"""Guess what each CAD layer / block holds from its name. Users confirm or override per sheet."""

import re

ROLES = ["wall", "door", "window", "room_label", "fixture", "pipe_cold", "pipe_hot", "pipe_waste", "pipe_vent",
         "pipe_gas", "electrical", "wire", "ignore", "auto"]

_LAYER_RULES: list[tuple[str, str]] = [
    ("ignore", r"DIM|ANNO-(?!ROOM)|TITLE|TTLB|HATCH|PATT|GRID|DEFPOINTS|FURN|EQPM|NOTE|SYMB|VIEWPORT|^XREF"),
    ("room_label", r"AREA-IDEN|ROOM|RM-?NAME|SPACE|IDEN"),
    ("door", r"DOOR|DR\b"),
    ("window", r"GLAZ|WIND|WDW|WINDOW"),
    ("pipe_cold", r"CPIP|DOMW-C|COLD|\bCW\b"),
    ("pipe_hot", r"HPIP|DOMW-H|HOT|\bHW\b"),
    ("pipe_vent", r"VENT"),
    ("pipe_waste", r"SANR|SAN\b|SANI|WAST|DRAIN|SOIL|SEWR"),
    ("pipe_gas", r"GAS"),
    ("fixture", r"P-FIXT|FIXT|PLMB|PLUMB"),
    ("wire", r"E-WIRE|WIRE|CIRC"),
    ("electrical", r"^E-|ELEC|POWR|POWER|LITE|LIGHT|DEVC|RECEP"),
    ("wall", r"WALL|MUR\b|WAND"),
]


def suggest_role(layer: str) -> str:
    name = layer.upper()
    if name in ("0", ""):
        return "auto"
    for role, pat in _LAYER_RULES:
        if re.search(pat, name):
            return role
    return "auto"


def suggest_roles(layers: dict[str, int]) -> dict[str, str]:
    return {name: suggest_role(name) for name in layers}


# Block name → (category, kind)
_BLOCK_RULES: list[tuple[str, str, str]] = [
    (r"DOOR|^DR[-_ ]?\d*$", "door", "door"),
    (r"WIN|WDW|GLAZ", "window", "window"),
    (r"\bWC\b|TOILET|WATER ?CLOSET|^WC", "fixture", "toilet"),
    (r"LAV|BASIN|VANITY", "fixture", "lavatory"),
    (r"SINK", "fixture", "kitchen_sink"),
    (r"TUB|BATH(?!ROOM)", "fixture", "bathtub"),
    (r"SHOWER|SHWR", "fixture", "shower"),
    (r"\bWH\b|^WH|WATER ?HEATER|HWT", "fixture", "water_heater"),
    (r"DISHW|\bDW\b", "fixture", "dishwasher"),
    (r"WASHER|\bWM\b", "fixture", "washer_box"),
    (r"RECEP|OUTLET|DUPLEX|\bGFI|PLUG", "device", "outlet"),
    (r"SWITCH|^SW\b|^SW\d|^S\d?$", "device", "switch"),
    (r"LIGHT|LUMIN|^LT\b|FIXTURE-E|CAN\b|PENDANT", "device", "light"),
]


def classify_block(name: str, layer_role: str | None = None) -> tuple[str, str] | None:
    n = name.upper()
    for pat, cat, kind in _BLOCK_RULES:
        if re.search(pat, n):
            return cat, kind
    if layer_role == "fixture":
        return "fixture", "fixture"
    if layer_role == "electrical":
        return "device", "device"
    if layer_role in ("door", "window"):
        return layer_role, layer_role
    return None
