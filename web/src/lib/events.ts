import type { EventRow } from '../api/types'

export function describe(e: EventRow): string {
  const d = e.data as Record<string, any>
  const name = d?.name ?? d?.after?.name ?? d?.snapshot?.name
  const [entity, verb] = e.type.split('.')
  const label = entity.replace('_', ' ')
  return name ? `${verb} ${label} “${name}”` : `${verb} ${label}`
}
