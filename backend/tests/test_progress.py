import io
import json
import uuid

import pytest
from PIL import Image

from app.seed import seed


def jpeg(seed_val: int = 0, size=(640, 480), exif: bool = False) -> bytes:
    img = Image.new("RGB", size, (seed_val * 40 % 255, 120, 200 - seed_val * 30 % 200))
    for i in range(0, size[0], 40):  # some structure so the perceptual hash isn't flat
        for j in range(0, size[1], 40):
            if (i // 40 + j // 40 + seed_val) % 3 == 0:
                img.paste((255 - seed_val * 20 % 255, 50, 50), (i, j, i + 30, j + 30))
    out = io.BytesIO()
    if exif:
        ex = Image.Exif()
        ex[0x8769] = {36867: "2026:10:03 14:22:05"}
        ex[0x8825] = {1: "N", 2: (40.0, 26.0, 46.0), 3: "W", 4: (79.0, 58.0, 56.0)}
        img.save(out, "JPEG", exif=ex)
    else:
        img.save(out, "JPEG")
    return out.getvalue()


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo-password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def demo(db, client):
    p = seed(db)
    pm, plumber = login(client, "pm@example.com"), login(client, "plumber@example.com")
    zones = {z["name"]: z["id"] for b in client.get(f"/api/projects/{p.id}/tree", headers=pm).json()
             for lv in b["levels"] for z in lv["zones"]}
    return {"pid": p.id, "pm": pm, "plumber": plumber, "zones": zones,
            "viewer": login(client, "inspector@example.com"), "elec": login(client, "electrician@example.com")}


def post_upload(client, demo, headers, zone, ids, photos, trade="plumbing", cu=None):
    return client.post(f"/api/projects/{demo['pid']}/uploads", headers=headers,
                       data={"zone_id": zone, "trade": trade, "note": "rough-in done", "client_uuid": cu or str(uuid.uuid4()),
                             "captured_at": "2026-10-04T15:00:00Z", "element_ids": json.dumps(ids)},
                       files=[("files", (f"p{i}.jpg", b, "image/jpeg")) for i, b in enumerate(photos)])


def test_checklist_is_trade_and_zone_scoped(client, demo):
    bath = demo["zones"]["UNIT 101 BATH"]
    c = client.get(f"/api/zones/{bath}/checklist", headers=demo["plumber"]).json()
    items = c["items"]
    assert items and all(i["trade"] == "plumbing" for i in items)
    assert {i["ifc_class"] for i in items} >= {"IfcPipeSegment", "IfcSanitaryTerminal"}
    assert client.get(f"/api/zones/{demo['zones']['UNIT 101 BEDROOM']}/checklist", headers=demo["plumber"]).status_code == 404
    assert client.get(f"/api/zones/{bath}/checklist?trade=electrical", headers=demo["plumber"]).status_code == 403


def test_claim_review_and_green_with_evidence(client, demo):
    bath = demo["zones"]["UNIT 101 BATH"]
    items = client.get(f"/api/zones/{bath}/checklist", headers=demo["plumber"]).json()["items"]
    pipes = [i["id"] for i in items if i["ifc_class"] == "IfcPipeSegment"][:3]
    r = post_upload(client, demo, demo["plumber"], bath, pipes, [jpeg(1, exif=True), jpeg(2)])
    assert r.status_code == 201, r.text
    up = r.json()
    assert len(up["photos"]) == 2 and len(up["verifications"]) == 3
    ph = up["photos"][0]
    assert ph["exif_time"].startswith("2026-10-03T14:22:05") and ph["gps_lat"] == pytest.approx(40.446, abs=1e-3)
    assert ph["gps_lon"] < 0

    # Claimed → amber (needs_review); the rest of the zone keeps its original status.
    els = {e["id"]: e for e in client.get(f"/api/projects/{demo['pid']}/elements", headers=demo["pm"]).json()}
    assert all(els[i]["status"] == "needs_review" for i in pipes)
    others = [i["id"] for i in items if i["id"] not in pipes]
    assert all(els[i]["status"] == "not_started" for i in others)

    # PM sees it in the review queue and gets a notification.
    q = client.get(f"/api/projects/{demo['pid']}/reviews", headers=demo["pm"]).json()
    assert [u["id"] for u in q] == [up["id"]]
    assert any(n["kind"] == "progress.submitted" for n in client.get("/api/notifications", headers=demo["pm"]).json())
    assert client.get(f"/api/projects/{demo['pid']}/reviews", headers=demo["plumber"]).status_code == 403

    v1, v2, v3 = up["verifications"]
    assert client.post(f"/api/verifications/{v1['id']}/approve", json={}, headers=demo["pm"]).json()["state"] == "approved"
    assert client.post(f"/api/verifications/{v2['id']}/reject", json={"reason": ""}, headers=demo["pm"]).status_code == 422
    assert client.post(f"/api/verifications/{v2['id']}/reject", json={"reason": "Can't see the fitting"},
                       headers=demo["pm"]).json()["state"] == "rejected"
    els = {e["id"]: e for e in client.get(f"/api/projects/{demo['pid']}/elements", headers=demo["pm"]).json()}
    assert els[v1["element_id"]]["status"] == "done"
    assert els[v2["element_id"]]["status"] == "not_started" and "retake_photo" in els[v2["element_id"]]["flags"]
    assert els[v3["element_id"]]["status"] == "needs_review"
    assert any(n["kind"] == "progress.rejected" for n in client.get("/api/notifications", headers=demo["plumber"]).json())

    # Status change events carry the photo evidence.
    evs = client.get(f"/api/projects/{demo['pid']}/events?entity_id={v1['element_id']}", headers=demo["pm"]).json()
    done = next(e for e in evs if e["data"].get("to") == "done")
    assert up["id"] in done["evidence_ids"] and {p["id"] for p in up["photos"]} <= set(done["evidence_ids"])
    ev = client.get(f"/api/elements/{v1['element_id']}/evidence", headers=demo["viewer"]).json()
    assert ev[0]["upload_id"] == up["id"]
    # photo + thumbnail readable by inspector
    assert client.get(ph["url"], headers=demo["viewer"]).status_code == 200
    assert client.get(ph["thumb_url"], headers=demo["viewer"]).headers["content-type"] == "image/jpeg"


def test_no_green_without_photo_evidence(client, demo):
    bath = demo["zones"]["UNIT 101 BATH"]
    el = client.get(f"/api/zones/{bath}/checklist", headers=demo["plumber"]).json()["items"][0]["id"]
    r = client.post(f"/api/elements/{el}/status", json={"status": "done", "reason": "I saw it"}, headers=demo["pm"])
    assert r.status_code == 422 and "evidence" in r.json()["detail"]
    up = post_upload(client, demo, demo["plumber"], bath, [], [jpeg(3)]).json()
    r = client.post(f"/api/elements/{el}/status", json={"status": "done", "reason": "Verified on walk", "upload_id": up["id"]},
                    headers=demo["pm"])
    assert r.status_code == 200 and r.json()["status"] == "done"
    assert client.post(f"/api/elements/{el}/status", json={"status": "done", "reason": "looks done"}, headers=demo["plumber"]).status_code == 403


def test_photo_reuse_is_blocked_or_flagged(client, demo):
    bath, kitchen = demo["zones"]["UNIT 101 BATH"], demo["zones"]["UNIT 101 LIVING"]
    photo = jpeg(4)
    assert post_upload(client, demo, demo["plumber"], bath, [], [photo]).status_code == 201
    # exact same file for another zone → blocked
    r = post_upload(client, demo, demo["plumber"], kitchen, [], [photo])
    assert r.status_code == 409
    # same picture re-encoded at another size → accepted but flagged for the PM
    img = Image.open(io.BytesIO(photo)).resize((500, 375))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    r = post_upload(client, demo, demo["plumber"], kitchen, [], [buf.getvalue()])
    assert r.status_code == 201 and r.json()["photos"][0]["flags"][0].startswith("possible_reuse:")
    # not an image
    r = post_upload(client, demo, demo["plumber"], bath, [], [b"not an image"])
    assert r.status_code == 422


def test_offline_retry_is_idempotent(client, demo):
    bath = demo["zones"]["UNIT 101 BATH"]
    el = client.get(f"/api/zones/{bath}/checklist", headers=demo["plumber"]).json()["items"][0]["id"]
    a = post_upload(client, demo, demo["plumber"], bath, [el], [jpeg(5)], cu="queue-123").json()
    b = post_upload(client, demo, demo["plumber"], bath, [el], [jpeg(5)], cu="queue-123").json()
    assert a["id"] == b["id"] and len(b["verifications"]) == 1


def test_upload_permissions(client, demo):
    bath = demo["zones"]["UNIT 101 BATH"]
    el = client.get(f"/api/zones/{bath}/checklist", headers=demo["plumber"]).json()["items"][0]["id"]
    assert post_upload(client, demo, demo["viewer"], bath, [], [jpeg(6)]).status_code == 403
    assert post_upload(client, demo, demo["elec"], bath, [], [jpeg(6)], trade="plumbing").status_code == 403
    assert post_upload(client, demo, demo["plumber"], demo["zones"]["UNIT 101 BEDROOM"], [], [jpeg(6)]).status_code == 422
    wall = next(e["id"] for e in client.get(f"/api/projects/{demo['pid']}/elements", headers=demo["pm"]).json()
                if e["ifc_class"] == "IfcWall")
    assert post_upload(client, demo, demo["plumber"], bath, [el, wall], [jpeg(6)]).status_code == 422
    r = client.post(f"/api/projects/{demo['pid']}/uploads", headers=demo["plumber"],
                    data={"zone_id": bath, "trade": "plumbing", "client_uuid": "x"})
    assert r.status_code == 422  # photos required


def test_progress_summary(client, demo):
    s = client.get(f"/api/projects/{demo['pid']}/progress", headers=demo["pm"]).json()
    assert s["totals"]["not_started"] > 20
