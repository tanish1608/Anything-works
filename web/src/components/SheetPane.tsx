import { useMemo } from 'react'
import type { Sheet } from '../api/types'
import { buildingToSheet, sheetToBuilding, type P2 } from '../lib/sheetMath'
import SheetCanvas from './SheetCanvas'

/** 2D drawing next to the 3D model. Click → building point; highlightBox (building coords) is outlined. */
export default function SheetPane({ sheet, highlight, marker, onPick }: {
  sheet: Sheet
  highlight: number[] | null // [minx, miny, minz, maxx, maxy, maxz] in building/IFC coords
  marker: P2 | null // building coords
  onPick: (buildingPoint: P2) => void
}) {
  const box = useMemo(() => {
    if (!highlight) return null
    const corners: P2[] = [[highlight[0], highlight[1]], [highlight[3], highlight[1]], [highlight[3], highlight[4]], [highlight[0], highlight[4]]]
    return corners.map((c) => buildingToSheet(sheet, c))
  }, [highlight, sheet])
  const focus = useMemo(() => {
    if (!box) return null
    const xs = box.map((p) => p[0])
    const ys = box.map((p) => p[1])
    return { center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] as P2, size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 2 }
  }, [box])
  const m = marker ? buildingToSheet(sheet, marker) : null
  return (
    <SheetCanvas sheetId={sheet.id} onPoint={(p) => onPick(sheetToBuilding(sheet, p))} focus={focus} cursor="crosshair">
      {box && <polygon points={box.map((p) => p.join(',')).join(' ')} fill="rgba(124,77,255,.2)" stroke="#7c4dff" strokeWidth={0.06} />}
      {m && (
        <g>
          <circle cx={m[0]} cy={m[1]} r={0.3} fill="none" stroke="#d81b60" strokeWidth={0.06} />
          <circle cx={m[0]} cy={m[1]} r={0.07} fill="#d81b60" />
        </g>
      )}
    </SheetCanvas>
  )
}
