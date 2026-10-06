import type { ElementInfo } from "../api/types";

export function roofElement(
  e: ElementInfo & { props?: Record<string, unknown> },
): boolean {
  if (e.roof != null) return e.roof;
  if (e.ifc_class === "IfcRoof") return true;
  if (e.ifc_class !== "IfcSlab") return false;
  const predefined = e.props?.["IFC.predefined_type"];
  return predefined
    ? String(predefined).toUpperCase() === "ROOF"
    : !!e.name?.startsWith("Basic Roof:");
}

/** Mirrors API hints for public datasets whose full IFC properties are already local. */
export function exteriorWall(
  e: ElementInfo & { props?: Record<string, unknown> },
): boolean | null {
  if (!e.ifc_class.startsWith("IfcWall")) return false;
  if (e.exterior_wall != null) return e.exterior_wall;
  const p = e.props ?? {};
  if (
    ["5", "5.0", "interior", "interior wall", "coreshaft"].includes(
      String(p["PSet_Revit_Type_Construction.Function"]).trim().toLowerCase(),
    )
  )
    return false;
  const value = String(p["Pset_WallCommon.IsExternal"]).trim().toLowerCase();
  if (["true", "1", "1.0", "yes"].includes(value)) return true;
  if (["false", "0", "0.0", "no"].includes(value)) return false;
  return null;
}
