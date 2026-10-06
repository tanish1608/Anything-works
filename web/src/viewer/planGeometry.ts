import type { ModelPlanData } from "./ModelPlan";

export type PlanViewBox = [number, number, number, number];

/** Shared bounds keep the preview and main plan aligned in IFC XY metres. */
export function planViewBox(plan: ModelPlanData): PlanViewBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const points of [
    ...plan.elements.map((e) => e.points),
    ...plan.rooms.map((r) => r.polygon),
  ]) {
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, -y);
      maxY = Math.max(maxY, -y);
    }
  }
  return minX === Infinity
    ? [0, 0, 10, 10]
    : [minX - 0.5, minY - 0.5, maxX - minX + 1, maxY - minY + 1];
}
