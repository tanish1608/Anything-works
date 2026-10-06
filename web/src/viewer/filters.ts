import type { ElementInfo } from "../api/types";
import { elementColor } from "./colors";
import { exteriorWall, roofElement } from "./envelope";

export interface ViewFilter {
  disciplines: Set<string>; // visible layers
  levelId: string | null;
  zoneId: string | null;
  interior?: boolean;
  hideRoof?: boolean;
  revealed?: string | null;
  hidden?: Set<string>;
  isolated?: string | null;
}

/** Which elements to show. Context (ghost) elements ignore the zone filter so walls stay around the room. */
export function visibleIds(
  elements: ElementInfo[],
  f: ViewFilter,
): Set<string> {
  const out = new Set<string>();
  for (const e of elements) {
    if (!f.disciplines.has(e.discipline)) continue;
    if (f.levelId && e.level_id !== f.levelId) continue;
    if (f.zoneId && e.zone_id !== f.zoneId && !e.context) continue;
    if (f.hidden?.has(e.id) || (f.isolated && e.id !== f.isolated)) continue;
    if (
      e.id !== f.revealed &&
      ((f.interior && exteriorWall(e) === true) ||
        (f.hideRoof && roofElement(e)))
    )
      continue;
    out.add(e.id);
  }
  return out;
}

export function colorMap(
  elements: ElementInfo[],
  statusColoring: boolean,
): Map<string, string> {
  return new Map(elements.map((e) => [e.id, elementColor(e, statusColoring)]));
}
