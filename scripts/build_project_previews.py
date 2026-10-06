"""Rebuild cheap project-card SVGs from actual IFC component bounds, not stock houses.

These are source-bound silhouettes; the selected hero loads the real GLB meshes.
Run from the repository root: python3 scripts/build_project_previews.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
(ROOT / 'web/public/project-previews').mkdir(parents=True, exist_ok=True)
for slug in ('duplex', 'schependomlaan'):
    model = json.loads((ROOT / 'web/public' / f'bim-{slug}' / 'model.json').read_text())
    boxes = [e['bbox'] for e in model['elements'] if e.get('bbox') and e['discipline'] in ('architecture', 'structure')]
    center = [(min(b[i] for b in boxes) + max(b[i + 3] for b in boxes)) / 2 for i in range(3)]
    def project(x, y, z):
        x, y, z = x - center[0], y - center[1], z - center[2]
        return ((x - y) * .866, (x + y) * .36 - z * .95)
    def corners(b):
        x, y, z, xx, yy, zz = b
        return [project(x,y,z),project(xx,y,z),project(xx,yy,z),project(x,yy,z),project(x,y,zz),project(xx,y,zz),project(xx,yy,zz),project(x,yy,zz)]
    points = [p for b in boxes for p in corners(b)]
    x0, y0 = min(p[0] for p in points), min(p[1] for p in points)
    x1, y1 = max(p[0] for p in points), max(p[1] for p in points)
    padding = max(x1-x0,y1-y0)*.07
    view = f'{x0-padding:.3f} {y0-padding:.3f} {x1-x0+2*padding:.3f} {y1-y0+2*padding:.3f}'
    # Largest solids retain the structure at thumbnail size; no claim of exact mesh detail.
    boxes = sorted(boxes, key=lambda b: (b[3]-b[0])*(b[4]-b[1])*(b[5]-b[2]), reverse=True)[:240]
    boxes.sort(key=lambda b: b[0]+b[1]+b[2])
    polygons = []
    for b in boxes:
        p = corners(b)
        for face, color in [([0,1,5,4],'#526b83'),([1,2,6,5],'#8099b0'),([4,5,6,7],'#c9d8e5')]:
            coords = ' '.join(f'{p[i][0]:.3f},{p[i][1]:.3f}' for i in face)
            polygons.append(f'<polygon points="{coords}" fill="{color}" fill-opacity=".68" stroke="#b4d5f2" stroke-width=".3" vector-effect="non-scaling-stroke"/>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img"><title>{slug}: source component bounds silhouette</title>{"".join(polygons)}</svg>\n'
    (ROOT / 'web/public/project-previews' / f'{slug}.svg').write_text(svg)
    print(f'{slug}: {len(boxes)} bounds, {len(svg)} SVG bytes')
