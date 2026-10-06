import { Vector3, type Mesh } from "three";
import type { ElementInfo } from "../api/types";

/** Presentation offsets in viewer metres, keyed by stable element ID. Source coordinates stay fixed. */
export function levelOffsets(
  elements: ElementInfo[],
  levels: { id: string; elevation_m: number }[],
  expanded: boolean,
  gap = 3,
): Map<string, number> {
  const order = [...levels].sort((a, b) => a.elevation_m - b.elevation_m);
  const byLevel = new Map(order.map((l, i) => [l.id, expanded ? i * gap : 0]));
  return new Map(
    elements.map((e) => [e.id, byLevel.get(e.level_id || "") || 0]),
  );
}
const originals = new WeakMap<Mesh, Vector3>();
/** Correct with rotated/scaled GLB parents; repeat commands never accumulate translations. */
export function applyDisplayOffset(mesh: Mesh, offset: number) {
  if (!originals.has(mesh)) originals.set(mesh, mesh.position.clone());
  const position = originals.get(mesh)!.clone();
  if (mesh.parent) {
    mesh.parent.updateWorldMatrix(true, false);
    mesh.parent.localToWorld(position);
    position.y += offset;
    mesh.parent.worldToLocal(position);
  } else position.y += offset;
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
}
