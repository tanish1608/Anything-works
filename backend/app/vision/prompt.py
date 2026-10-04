"""Prompt + output schema for photo verification. Bump PROMPT_VERSION whenever the wording changes so
eval results stay comparable (eval_vision.py records it with every run)."""

PROMPT_VERSION = "v1"

VERDICTS = ["installed", "missing", "not_visible", "uncertain"]

SYSTEM = """You verify construction progress from site photos for a building coordination tool.

A tradesperson says they finished work in one room. You get their photos, a 3D reference render of what
should be installed in that room for their trade (from the building model), and a list of expected
elements. For each expected element decide:

- installed: you can clearly see this specific element in the photos, installed in place. Match it to the
  reference render and description by type, position and run direction. Pipes and cables count when the
  visible run matches the expected segment's location and direction.
- missing: the part of the room where this element belongs is clearly visible and the element is not there.
- not_visible: the photos don't show where this element would be (out of frame, hidden behind something,
  too dark or blurry, or already covered by drywall/flooring).
- uncertain: something may be there but you can't tell which element it is or whether it's complete.

Marking an element installed when it isn't is far worse than missing a real installation: a wrong
"installed" can release payment for work that wasn't done. When in doubt, choose not_visible or uncertain.
Never infer that an element is installed from neighbouring work, from the note, or from what is typical.

Give one entry for every expected element, using its exact element_id. confidence is your probability
(0 to 1) that the verdict is correct. reason is one short sentence a site manager can check against the
photo (say which photo and where)."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "element_id": {"type": "string"},
                    "verdict": {"type": "string", "enum": VERDICTS},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                },
                "required": ["element_id", "verdict", "confidence", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}


def describe_element(e: dict) -> str:
    """One line per expected element: id, type, and enough geometry to place it in the room."""
    bits = [f"element_id={e['id']}", e.get("ifc_class", "").replace("Ifc", ""), e.get("name") or ""]
    props = e.get("props") or {}
    if props.get("SiteMesh.System"):
        bits.append(f"system={props['SiteMesh.System']}")
    if props.get("SiteMesh.Kind"):
        bits.append(f"kind={props['SiteMesh.Kind']}")
    if e.get("position_hint"):
        bits.append(e["position_hint"])
    return " | ".join(b for b in bits if b)


def user_text(zone: str, trade: str, note: str, elements: list[dict], n_photos: int, has_reference: bool) -> str:
    lines = [f"Room: {zone}", f"Trade: {trade}", f"Worker's note: {note or '(none)'}",
             f"Photos: {n_photos} (numbered in the order shown)",
             "Reference render: " + ("the last image, labelled REFERENCE" if has_reference else "not available"),
             "", "Expected elements:"]
    lines += [f"- {describe_element(e)}" for e in elements]
    return "\n".join(lines)


def position_hint(bbox: list[float] | None, zone_polygon: list | None) -> str:
    """Rough location of an element inside its room, in words (plan coordinates, metres)."""
    if not bbox or not zone_polygon:
        return ""
    xs = [p[0] for p in zone_polygon]
    ys = [p[1] for p in zone_polygon]
    cx, cy = (bbox[0] + bbox[3]) / 2, (bbox[1] + bbox[4]) / 2
    fx = (cx - min(xs)) / ((max(xs) - min(xs)) or 1)
    fy = (cy - min(ys)) / ((max(ys) - min(ys)) or 1)
    horiz = "west" if fx < 0.33 else "east" if fx > 0.67 else "middle"
    vert = "south" if fy < 0.33 else "north" if fy > 0.67 else "middle"
    dx, dy = bbox[3] - bbox[0], bbox[4] - bbox[1]
    run = "runs east-west" if dx > 3 * dy and dx > 0.3 else "runs north-south" if dy > 3 * dx and dy > 0.3 else ""
    h = f"height {bbox[2]:.2f}-{bbox[5]:.2f} m"
    return f"in the {vert}-{horiz} part of the room, {h}{', ' + run if run else ''}, length {max(dx, dy):.2f} m"
