import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { Notification } from '../api/types'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications'), refetchInterval: 30_000 })
  const unread = data?.filter((n) => !n.read_at).length ?? 0
  const go = async (n: Notification) => {
    setOpen(false)
    if (!n.read_at) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
    if (n.link) nav(n.link)
  }
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  return (
    <div className="bell" style={{ position: 'relative' }}>
      <button className="small" onClick={() => setOpen(!open)} aria-label={`Notifications (${unread} unread)`}>
        🔔{unread > 0 && <span className="count">{unread}</span>}
      </button>
      {open && (
        <div className="panel dropdown stack" style={{ gap: 4, padding: 8 }}>
          <div className="row"><strong className="grow">Notifications</strong>{unread > 0 && <button className="link" onClick={readAll}>Mark all read</button>}</div>
          {data?.length === 0 && <span className="muted">Nothing yet.</span>}
          {data?.map((n) => (
            <div key={n.id} className="issue-row" role="button" tabIndex={0} onClick={() => go(n)} onKeyDown={(e) => e.key === 'Enter' && go(n)}>
              <span className="dot" style={{ background: n.read_at ? 'transparent' : 'var(--accent)' }} />
              <div className="grow">
                <div>{n.title}</div>
                {n.body && <div className="muted" style={{ fontSize: 12 }}>{n.body}</div>}
                <div className="muted" style={{ fontSize: 11 }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
