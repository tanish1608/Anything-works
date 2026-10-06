"""Reproducible public-project import audit and standalone viewer dataset.

Run from backend: .venv/bin/python -m app.bim.audit --download
Source IFCs stay untracked; generated GLBs/metadata are a public, attributed demo.
No existing project/database is touched. No AI or provider calls are made.
"""
import argparse
import hashlib
import json
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.bim.ifc_import import apply_building_aliases, create_version, read_ifc
from app.bim.plans import footprint
from app.config import get_settings
from app.db import Base
from app.models import Building, Element, ElementRevision, Level, Organization, Project, Zone
from app.storage import get_storage

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "samples/ifc/duplex"
OUTPUT = ROOT / "web/public/bim-duplex"


def download(source_dir: Path = SOURCE):
    source = json.loads((source_dir / "source.json").read_text())
    for name, expected in source["files"].items():
        path = source_dir / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
            continue
        url = (f'https://media.githubusercontent.com/media/{source["repository"]}/{source["revision"]}/'
               + urllib.parse.quote(f'{source["folder"]}/{name}'))
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Checksum mismatch: {name}")
        path.write_bytes(data)


def audit(output: Path = OUTPUT, source_dir: Path = SOURCE):
    source = json.loads((source_dir / "source.json").read_text())
    slug = source.get("slug", "duplex")
    public_root = "/" + output.name
    all_items, spaces, reports = [], [], []
    for name, expected in source["files"].items():
        path = source_dir / name
        if not path.exists():
            raise FileNotFoundError(f"{path}; run with --download")
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Source changed: {name}")
        start = time.monotonic()
        report = {"file": name, "bytes": path.stat().st_size, "sha256": expected}
        # Resolve specific IFC2x3 types rather than forcing the whole source to one discipline.
        items, rooms = read_ifc(path, audit=report)
        report.update(seconds=round(time.monotonic() - start, 3),
                      by_discipline=dict(Counter(i.discipline for i in items)),
                      triangles=sum(len(i.faces) for i in items),
                      max_properties=max((len(i.props) for i in items), default=0))
        print(f'{name}: {len(items)} elements, {len(rooms)} spaces, {report["seconds"]}s', flush=True)
        all_items += items
        spaces += rooms
        reports.append(report)
    apply_building_aliases(all_items, spaces, source.get("building_aliases", {}), source.get("level_aliases", {}))
    unique = {i.guid: i for i in reversed(all_items)}
    settings = get_settings()
    previous_storage = settings.storage_dir
    output.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.TemporaryDirectory(prefix="ew-bim-audit-") as temp:
            settings.storage_dir = temp
            engine = create_engine("sqlite://")
            Base.metadata.create_all(engine)
            with Session(engine) as db:
                org = Organization(id="public-bim-audit", name="Public BIM sample")
                project = Project(id=f"{slug}-sample", org_id=org.id, name=source.get("name", "Duplex Apartment"))
                db.add_all([org, project])
                db.flush()
                # Stable public-demo UUIDs; connected projects retain their own stable identities.
                db.add_all([Element(id=str(uuid.uuid5(uuid.NAMESPACE_URL, slug + ":" + guid)),
                                    project_id=project.id, ifc_guid=guid) for guid in unique])
                db.flush()
                start = time.monotonic()
                version = create_version(db, project, all_items, spaces, actor_id=None,
                                         message=source["attribution"], source="ifc_import")
                db.flush()
                export_seconds = round(time.monotonic() - start, 3)
                levels = list(db.scalars(select(Level).order_by(Level.elevation_m)))
                zones = list(db.scalars(select(Zone)))
                buildings = {b.id: b.name for b in db.scalars(select(Building))}
                # Export stable spatial identities for new samples without changing the API/database IDs.
                level_ids = {lv.id: str(uuid.uuid5(uuid.NAMESPACE_URL,
                             f"{slug}:level:{buildings[lv.building_id]}:{lv.name}:{lv.elevation_m}"))
                             for lv in levels} if slug != "duplex" else {}
                zone_ids = {z.id: str(uuid.uuid5(uuid.NAMESPACE_URL,
                            f"{slug}:room:{level_ids[z.level_id]}:{z.code}:{z.name}" +
                            (f":{z.ifc_guid}" if sum(other.level_id == z.level_id and other.code == z.code and other.name == z.name for other in zones) > 1 else "")))
                            for z in zones} if slug != "duplex" else {}
                rows = db.execute(select(Element, ElementRevision).join(ElementRevision)
                                  .where(ElementRevision.version_id == version.id)).all()
                from app.bim.envelope import exterior_wall, roof_element

                records = [{"id": el.id, "ifc_guid": el.ifc_guid, "name": rev.name,
                            "ifc_class": rev.ifc_class, "discipline": rev.discipline, "trade": rev.trade,
                            "level_id": level_ids.get(rev.level_id, rev.level_id),
                            "zone_id": zone_ids.get(rev.zone_id, rev.zone_id), "bbox": rev.bbox,
                            "props": rev.props, "status": "not_started", "flags": [], "open_issues": 0,
                            "context": False, "source": "imported", "confidence": None,
                            "exterior_wall": exterior_wall(rev.ifc_class, rev.props),
                            "roof": roof_element(rev.ifc_class, rev.props, rev.name)}
                           for el, rev in rows]
                plans = [{"id": level_ids.get(lv.id, lv.id), "name": f"{buildings[lv.building_id]} · {lv.name}",
                          "elevation_m": lv.elevation_m, "provenance": "IFC-derived plan silhouettes; not an approved drawing",
                          "rooms": [{"id": zone_ids.get(z.id, z.id), "name": z.name, "code": z.code, "polygon": z.polygon, "ifc_guid": z.ifc_guid}
                                    for z in zones if z.level_id == lv.id],
                          "elements": [{"id": el.id, "discipline": rev.discipline,
                                        "points": footprint(unique[el.ifc_guid])}
                                       for el, rev in rows if rev.level_id == lv.id
                                       and rev.ifc_class not in ("IfcSlab", "IfcRoof", "IfcFooting", "IfcCovering")]}
                         for lv in levels]
                meshes = []
                for disc, key in version.files["meshes"].items():
                    path = output / f"{disc}.glb"
                    shutil.copyfile(get_storage().local_path(key), path)
                    meshes.append({"discipline": disc, "url": f"{public_root}/{disc}.glb", "context": False,
                                   "bytes": path.stat().st_size})
                sample = next((r for r in records if r["props"].get("IFC.resolved_class") == "IfcPipeFitting"
                               and any(zone_ids.get(z.id, z.id) == r["zone_id"]
                                       and "bedroom" in z.name.lower() for z in zones)), None)
                report = {"source": source, "files": reports, "elements": len(records), "levels": len(levels),
                          "rooms": len(zones), "assigned_to_room": sum(bool(r["zone_id"]) for r in records),
                          "triangles": sum(len(i.faces) for i in unique.values()),
                          "vertices": sum(len(i.verts) for i in unique.values()),
                          "by_discipline": version.stats["by_discipline"], "export_seconds": export_seconds,
                          "mesh_bytes": sum(m["bytes"] for m in meshes),
                          "bedroom_fitting": sample and {k: sample[k] for k in ("id", "ifc_guid", "name", "zone_id", "bbox")}}
                version_key = source["revision"] if slug == "duplex" else f'{slug}:{source["revision"]}'
                data = {"source": source, "version": version_key, "layers": meshes,
                        "elements": records, "plans": plans, "audit": report}
                (output / "model.json").write_text(json.dumps(data, separators=(",", ":")))
                (source_dir / "AUDIT.json").write_text(json.dumps(report, indent=2) + "\n")
                print(json.dumps({k: v for k, v in report.items() if k not in ("files", "source")}, indent=2))
            engine.dispose()
    finally:
        settings.storage_dir = previous_storage


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--source", type=Path, default=SOURCE)
    args = parser.parse_args()
    if args.download:
        download(args.source)
    source = json.loads((args.source / "source.json").read_text())
    output = args.output or ROOT / "web/public" / f'bim-{source.get("slug", "duplex")}'
    audit(output, args.source)
