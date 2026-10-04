import { useEffect, useState } from 'react'
import { retry, subscribe, syncQueue, removeFromQueue, type QueuedUpload } from './queue'

export default function QueueBadge({ detailed = false }: { detailed?: boolean }) {
  const [items, setItems] = useState<QueuedUpload[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => subscribe(setItems), [])
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const waiting = items.filter((i) => i.state !== 'failed').length
  const failed = items.filter((i) => i.state === 'failed')
  if (!detailed) {
    return (
      <span className={`badge ${failed.length ? 'danger' : waiting ? 'warn' : 'ok'}`} data-testid="queue-badge">
        {!online && 'Offline · '}{waiting ? `${waiting} waiting to sync` : failed.length ? `${failed.length} failed` : 'All synced'}
      </span>
    )
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <QueueBadge />
        {waiting > 0 && <button className="small" onClick={() => syncQueue()}>Sync now</button>}
      </div>
      {failed.map((f) => (
        <div key={f.client_uuid} className="notice warn" style={{ fontSize: 13 }}>
          <strong>{f.zone_name}</strong>: {f.error}
          <div className="row" style={{ marginTop: 4 }}>
            <button className="small" onClick={() => retry(f.client_uuid).then(() => syncQueue())}>Retry</button>
            <button className="small danger" onClick={() => window.confirm('Discard this report?') && removeFromQueue(f.client_uuid)}>Discard</button>
          </div>
        </div>
      ))}
    </div>
  )
}
