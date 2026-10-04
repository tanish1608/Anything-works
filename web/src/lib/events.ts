import type { EventRow } from '../api/types'

export function describe(e: EventRow): string {
  const d = e.data as Record<string, any>
  if (e.type === 'element.status_changed') return `status ${d.from} → ${d.to}${d.reason ? ` (${d.reason})` : ''}`
  if (e.type.startsWith('issue.') && d?.number) return `${e.type.split('.')[1].replace('_', ' ')} issue #${d.number}${d.title ? ` “${d.title}”` : ''}`
  if (e.type === 'upload.created') return `uploaded ${d.photos} photo(s), claimed ${d.claimed} item(s)`
  if (e.type === 'upload.analyzed') return `photo check: ${JSON.stringify(d.summary ?? {})}`
  if (e.type.startsWith('model.') && d?.number) return `${e.type.split('.')[1].replace('_', ' ')} model v${d.number}${e.message ? `: ${e.message}` : ''}`
  const name = d?.name ?? d?.after?.name ?? d?.snapshot?.name
  const [entity, verb] = e.type.split('.')
  const label = entity.replace('_', ' ')
  return name ? `${verb} ${label} “${name}”` : `${verb} ${label}`
}
