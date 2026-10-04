import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'

export type PlanPoint = [number, number]

/**
 * Pan/zoom SVG of a drawing sheet with an overlay drawn in plan metres (y up).
 * The backend SVG uses viewBox units = metres with y flipped; overlay children are wrapped in scale(1,-1).
 */
export default function SheetCanvas({ sheetId, version, children, onPoint, onMove, cursor, focus }: {
  sheetId: string
  version?: string
  children?: ReactNode
  onPoint?: (p: PlanPoint, e: React.MouseEvent) => void
  onMove?: (p: PlanPoint) => void
  cursor?: string
  focus?: { center: PlanPoint; size: number } | null
}) {
  const [raw, setRaw] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vb, setVb] = useState<[number, number, number, number] | null>(null)
  const base = useRef<[number, number, number, number] | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; vb: [number, number, number, number]; moved: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    setError(null)
    api<Blob>(`/sheets/${sheetId}/svg`)
      .then((b) => b.text())
      .then((t) => {
        if (!alive) return
        setRaw(t)
        const m = t.match(/viewBox="([^"]+)"/)
        if (m) {
          const v = m[1].split(/\s+/).map(Number) as [number, number, number, number]
          base.current = v
          setVb(v)
        }
      })
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [sheetId, version])

  useEffect(() => {
    if (!focus) return
    const s = Math.max(focus.size, 3)
    setVb([focus.center[0] - s, -focus.center[1] - s * 0.75, s * 2, s * 1.5])
  }, [focus])

  const inner = useMemo(() => (raw ? raw.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') : ''), [raw])

  const toPlan = (clientX: number, clientY: number): PlanPoint | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return [p.x, -p.y]
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!vb) return
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15
    setVb([p.x - (p.x - vb[0]) * k, p.y - (p.y - vb[1]) * k, vb[2] * k, vb[3] * k])
  }
  const onDown = (e: React.PointerEvent) => {
    if (!vb) return
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (d && vb && svgRef.current) {
      const dxp = e.clientX - d.x
      const dyp = e.clientY - d.y
      if (Math.abs(dxp) + Math.abs(dyp) > 4) d.moved = true
      if (d.moved) {
        const rect = svgRef.current.getBoundingClientRect()
        const scale = Math.max(d.vb[2] / rect.width, d.vb[3] / rect.height)
        setVb([d.vb[0] - dxp * scale, d.vb[1] - dyp * scale, d.vb[2], d.vb[3]])
      }
    }
    if (onMove) {
      const p = toPlan(e.clientX, e.clientY)
      if (p) onMove(p)
    }
  }
  const lastGesture = useRef<{ moved: boolean } | null>(null)
  const onUpCapture = () => {
    // Runs before overlay handlers, so a click on an overlay element (which stops propagation) still ends the pan.
    lastGesture.current = drag.current ? { moved: drag.current.moved } : null
    drag.current = null
  }
  const onUp = (e: React.PointerEvent) => {
    const d = lastGesture.current
    if (d && !d.moved && onPoint) {
      const p = toPlan(e.clientX, e.clientY)
      if (p) onPoint(p, e as unknown as React.MouseEvent)
    }
  }

  if (error) return <div className="error" style={{ padding: 12 }}>{error}</div>
  if (!vb) return <div className="muted" style={{ padding: 12 }}>Loading drawing…</div>
  return (
    <div className="sheet-canvas">
      <svg ref={svgRef} viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet" data-testid="sheet-svg"
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onPointerMove} onPointerUpCapture={onUpCapture} onPointerUp={onUp}
        style={{ cursor: cursor ?? 'grab' }}>
        <rect x={vb[0] - vb[2] * 10} y={vb[1] - vb[3] * 10} width={vb[2] * 21} height={vb[3] * 21} fill="#fff" />
        <g className="sheet-underlay" dangerouslySetInnerHTML={{ __html: inner }} />
        <g transform="scale(1,-1)">{children}</g>
      </svg>
      <div className="sheet-zoom">
        <button className="small" onClick={() => vb && setVb([vb[0] + vb[2] * 0.15, vb[1] + vb[3] * 0.15, vb[2] * 0.7, vb[3] * 0.7])} aria-label="Zoom in">+</button>
        <button className="small" onClick={() => vb && setVb([vb[0] - vb[2] * 0.2, vb[1] - vb[3] * 0.2, vb[2] * 1.4, vb[3] * 1.4])} aria-label="Zoom out">−</button>
        <button className="small" onClick={() => base.current && setVb(base.current)}>Fit</button>
      </div>
    </div>
  )
}
