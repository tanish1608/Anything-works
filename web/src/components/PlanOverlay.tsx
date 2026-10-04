import type { Plan, PlanWall } from '../api/types'

export type Selection = { kind: 'wall' | 'opening' | 'room' | 'fixture' | 'device' | 'pipe'; id: string } | null

const PIPE_COLORS: Record<string, string> = { cold: '#1e88e5', hot: '#e53935', waste: '#6d4c41', vent: '#7cb342', gas: '#fbc02d' }
const OPENING_COLORS = { door: '#ef6c00', window: '#1e88e5', opening: '#8e24aa' }

function along(w: PlanWall, t: number): [number, number] {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1
  return [w.a[0] + ((w.b[0] - w.a[0]) / L) * t, w.a[1] + ((w.b[1] - w.a[1]) / L) * t]
}

export function Label({ x, y, size, children, color = '#333' }: { x: number; y: number; size: number; children: string; color?: string }) {
  return (
    <text x={x} y={-y} transform="scale(1,-1)" fontSize={size} textAnchor="middle" fill={color} style={{ pointerEvents: 'none', fontFamily: 'sans-serif', fontWeight: 600 }}>
      {children}
    </text>
  )
}

export default function PlanOverlay({ plan, selected, onSelect, show }: {
  plan: Plan
  selected: Selection
  onSelect?: (s: Selection) => void
  show?: { walls?: boolean; rooms?: boolean; mep?: boolean }
}) {
  const vis = { walls: true, rooms: true, mep: true, ...show }
  const ext = plan.extents
  const scale = Math.max(ext[2] - ext[0], ext[3] - ext[1], 1)
  const label = scale / 60
  const pick = (s: Selection) => (e: React.PointerEvent) => {
    if (!onSelect) return
    e.stopPropagation()
    onSelect(s)
  }
  const isSel = (kind: string, id: string) => selected?.kind === kind && selected.id === id
  return (
    <g className="plan-overlay">
      {vis.rooms && plan.rooms.map((r) => {
        const cx = r.polygon.reduce((s, p) => s + p[0], 0) / r.polygon.length
        const cy = r.polygon.reduce((s, p) => s + p[1], 0) / r.polygon.length
        const low = r.confidence < 0.9
        return (
          <g key={r.id} onPointerUp={pick({ kind: 'room', id: r.id })} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <polygon points={r.polygon.map((p) => p.join(',')).join(' ')}
              fill={isSel('room', r.id) ? 'rgba(124,77,255,.25)' : low ? 'rgba(255,179,0,.18)' : 'rgba(46,196,182,.12)'}
              stroke={isSel('room', r.id) ? '#7c4dff' : 'none'} strokeWidth={label / 4} />
            {/* The drawing already shows detected labels; only label rooms that are unnamed or renamed. */}
            {r.confidence !== 0.95 && <Label x={cx} y={cy} size={label} color={low ? '#b26a00' : '#00695c'}>{r.name}</Label>}
          </g>
        )
      })}
      {vis.walls && plan.walls.map((w) => (
        <g key={w.id}>
          <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} strokeWidth={w.thickness} strokeLinecap="square"
            stroke={isSel('wall', w.id) ? 'rgba(124,77,255,.75)' : w.source === 'added' ? 'rgba(67,160,71,.55)' : w.confidence < 0.7 ? 'rgba(255,152,0,.55)' : 'rgba(229,57,53,.35)'}
            onPointerUp={pick({ kind: 'wall', id: w.id })} style={{ cursor: onSelect ? 'pointer' : undefined }} />
          {w.openings.map((o) => {
            const p1 = along(w, o.start)
            const p2 = along(w, o.end)
            return (
              <line key={o.id} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} strokeWidth={w.thickness * 1.3}
                stroke={isSel('opening', o.id) ? '#7c4dff' : OPENING_COLORS[o.kind]} strokeOpacity={0.8}
                strokeDasharray={o.confidence < 0.7 ? `${w.thickness} ${w.thickness / 2}` : undefined}
                onPointerUp={pick({ kind: 'opening', id: o.id })} style={{ cursor: onSelect ? 'pointer' : undefined }} />
            )
          })}
        </g>
      ))}
      {vis.mep && plan.pipes.map((p) => (
        <line key={p.id} x1={p.a[0]} y1={p.a[1]} x2={p.b[0]} y2={p.b[1]} stroke={isSel('pipe', p.id) ? '#7c4dff' : PIPE_COLORS[p.system] ?? '#555'}
          strokeWidth={Math.max(p.diameter * 2, label / 5)} strokeLinecap="round" strokeDasharray={p.source === 'traced' ? `${label / 2} ${label / 4}` : undefined}
          onPointerUp={pick({ kind: 'pipe', id: p.id })} style={{ cursor: onSelect ? 'pointer' : undefined }} />
      ))}
      {vis.mep && plan.fixtures.map((f) => (
        <g key={f.id} onPointerUp={pick({ kind: 'fixture', id: f.id })} style={{ cursor: onSelect ? 'pointer' : undefined }}>
          <rect x={f.pos[0] - f.size[0] / 2} y={f.pos[1] - f.size[1] / 2} width={f.size[0]} height={f.size[1]}
            fill={isSel('fixture', f.id) ? 'rgba(124,77,255,.4)' : 'rgba(30,136,229,.25)'} stroke="#1e88e5" strokeWidth={label / 8} />
          <Label x={f.pos[0]} y={f.pos[1] - f.size[1] / 2 - label * 0.9} size={label * 0.7} color="#1565c0">{f.kind.replace('_', ' ')}</Label>
        </g>
      ))}
      {vis.mep && plan.devices.map((d) => (
        <circle key={d.id} cx={d.pos[0]} cy={d.pos[1]} r={label / 2} fill={isSel('device', d.id) ? '#7c4dff' : 'rgba(239,108,0,.6)'}
          onPointerUp={pick({ kind: 'device', id: d.id })} style={{ cursor: onSelect ? 'pointer' : undefined }} />
      ))}
    </g>
  )
}
