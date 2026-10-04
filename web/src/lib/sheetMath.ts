// Sheet (plan metres) <-> building metres <-> three.js coordinates.
import type { Sheet } from '../api/types'

export type P2 = [number, number]

export function sheetToBuilding(s: Pick<Sheet, 'transform'>, p: P2): P2 {
  const { dx = 0, dy = 0, rotation_deg = 0 } = s.transform ?? {}
  const r = (rotation_deg * Math.PI) / 180
  return [p[0] * Math.cos(r) - p[1] * Math.sin(r) + dx, p[0] * Math.sin(r) + p[1] * Math.cos(r) + dy]
}

export function buildingToSheet(s: Pick<Sheet, 'transform'>, p: P2): P2 {
  const { dx = 0, dy = 0, rotation_deg = 0 } = s.transform ?? {}
  const r = (-rotation_deg * Math.PI) / 180
  const x = p[0] - dx
  const y = p[1] - dy
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]
}

/** IFC/building plan (x, y) at height z → three.js (x, z, -y). */
export function buildingToThree(p: P2, z: number): [number, number, number] {
  return [p[0], z, -p[1]]
}

export function threeToBuilding(p: [number, number, number]): P2 {
  return [p[0], -p[2]]
}
