import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Building } from '../api/types'
import { useProject } from './ProjectLayout'

/** Printable sheet: one QR per zone. Scanning opens that room in the field app. */
export default function QrPage() {
  const { project } = useProject()
  const tree = useQuery({ queryKey: ['tree', project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) })
  const zones = (tree.data ?? []).flatMap((b) => b.levels.flatMap((l) => l.zones.map((z) => ({ ...z, level: l.name, building: b.name }))))
  const [codes, setCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    Promise.all(zones.map(async (z) => [z.id, await QRCode.toDataURL(`${window.location.origin}/q/${z.qr_token}`, { margin: 1, width: 240 })] as const))
      .then((pairs) => setCodes(Object.fromEntries(pairs)))
  }, [tree.data]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="page stack" style={{ maxWidth: 1100 }}>
      <div className="row no-print">
        <h1 className="grow">Room QR codes</h1>
        <button className="primary" onClick={() => window.print()}>Print</button>
      </div>
      <p className="muted no-print">Post one in each room. Workers scan it to jump straight to that room's checklist.</p>
      <div className="qr-grid">
        {zones.map((z) => (
          <div key={z.id} className="qr-card">
            {codes[z.id] ? <img src={codes[z.id]} alt={`QR for ${z.name}`} /> : <div style={{ height: 160 }} />}
            <strong>{z.name}</strong>
            <span className="muted">{project.name} · {z.building} · {z.level}</span>
            <code style={{ fontSize: 11 }}>{z.qr_token}</code>
          </div>
        ))}
      </div>
    </div>
  )
}
