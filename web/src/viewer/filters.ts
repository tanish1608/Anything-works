import type { ElementInfo } from '../api/types'
import { elementColor } from './colors'

export interface ViewFilter {
  disciplines: Set<string> // visible layers
  levelId: string | null
  zoneId: string | null
}

/** Which elements to show. Context (ghost) elements ignore the zone filter so walls stay around the room. */
export function visibleIds(elements: ElementInfo[], f: ViewFilter): Set<string> {
  const out = new Set<string>()
  for (const e of elements) {
    if (!f.disciplines.has(e.discipline)) continue
    if (f.levelId && e.level_id !== f.levelId) continue
    if (f.zoneId && e.zone_id !== f.zoneId && !e.context) continue
    out.add(e.id)
  }
  return out
}

export function colorMap(elements: ElementInfo[], statusColoring: boolean): Map<string, string> {
  return new Map(elements.map((e) => [e.id, elementColor(e, statusColoring)]))
}
