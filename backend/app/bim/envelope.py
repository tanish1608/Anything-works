"""Presentation hints from author-provided IFC properties, never geometry edits."""


def exterior_wall(ifc_class: str, props: dict | None) -> bool | None:
    if not ifc_class.startswith("IfcWall"):
        return False
    props = props or {}
    # Revit Function=5 is a shared/party wall, even when IsExternal is true.
    function = props.get("PSet_Revit_Type_Construction.Function")
    if str(function).strip().lower() in {"5", "5.0", "interior", "interior wall", "coreshaft"}:
        return False
    value = props.get("Pset_WallCommon.IsExternal")
    if isinstance(value, bool):
        return value
    if str(value).strip().lower() in {"true", "1", "1.0", "yes"}:
        return True
    if str(value).strip().lower() in {"false", "0", "0.0", "no"}:
        return False
    return None  # Untagged walls stay visible; do not guess from their name or position.


def roof_element(ifc_class: str, props: dict | None, name: str | None = None) -> bool:
    if ifc_class == "IfcRoof":
        return True
    if ifc_class != "IfcSlab":
        return False
    predefined = (props or {}).get("IFC.predefined_type")
    if predefined:
        return str(predefined).upper() == "ROOF"
    # Older imports omitted PredefinedType. Revit uses this explicit occurrence prefix.
    return (name or "").startswith("Basic Roof:")
