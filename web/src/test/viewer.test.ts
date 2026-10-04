import { describe, expect, it, vi } from 'vitest'
import type { ElementInfo } from '../api/types'
import { handleCommand } from '../viewer/bridge'
import { DISCIPLINE_COLORS, elementColor, STATUS_COLORS, statusKey } from '../viewer/colors'
import { colorMap, visibleIds } from '../viewer/filters'
import type { SiteViewer } from '../viewer/Viewer'

const el = (over: Partial<ElementInfo>): ElementInfo => ({
  id: 'e', ifc_guid: 'g', name: null, ifc_class: 'IfcPipeSegment', discipline: 'plumbing', trade: 'plumbing',
  level_id: 'L1', zone_id: 'Z1', bbox: null, status: 'not_started', flags: [], source: 'drawn', confidence: null,
  open_issues: 0, context: false, ...over,
})

describe('status colors', () => {
  it('follows red > amber > green > discipline', () => {
    expect(statusKey(el({ status: 'done', open_issues: 1 }))).toBe('issue')
    expect(statusKey(el({ status: 'needs_review' }))).toBe('review')
    expect(statusKey(el({ status: 'done' }))).toBe('done')
    expect(statusKey(el({ status: 'in_progress' }))).toBeNull()
    expect(elementColor(el({ status: 'done' }), true)).toBe(STATUS_COLORS.done)
  })
  it('can be switched off', () => {
    expect(elementColor(el({ status: 'done', open_issues: 2 }), false)).toBe(DISCIPLINE_COLORS.plumbing)
  })
})

describe('filters', () => {
  const els = [
    el({ id: 'a' }),
    el({ id: 'b', zone_id: 'Z2' }),
    el({ id: 'c', discipline: 'electrical' }),
    el({ id: 'd', discipline: 'architecture', zone_id: null, context: true }),
    el({ id: 'e', level_id: 'L2', zone_id: 'Z9' }),
  ]
  const all = new Set(['plumbing', 'electrical', 'architecture'])
  it('filters by discipline, level and zone; context survives zone filter', () => {
    expect([...visibleIds(els, { disciplines: all, levelId: null, zoneId: null })]).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect([...visibleIds(els, { disciplines: new Set(['plumbing']), levelId: null, zoneId: null })]).toEqual(['a', 'b', 'e'])
    expect([...visibleIds(els, { disciplines: all, levelId: 'L1', zoneId: 'Z1' })]).toEqual(['a', 'c', 'd'])
  })
  it('builds a color map', () => {
    expect(colorMap([el({ id: 'x', status: 'done' })], true).get('x')).toBe(STATUS_COLORS.done)
  })
})

describe('bridge', () => {
  it('routes commands to the viewer and replies to queries', () => {
    const v = { select: vi.fn(), setColors: vi.fn(), snapshot: vi.fn(() => 'data:x'), getViewpoint: vi.fn(() => ({ position: [0, 0, 0], target: [1, 1, 1] })) }
    const reply = vi.fn()
    handleCommand(v as unknown as SiteViewer, { type: 'select', id: 'a' }, reply)
    expect(v.select).toHaveBeenCalledWith('a')
    handleCommand(v as unknown as SiteViewer, { type: 'setColors', colors: { a: '#fff' } }, reply)
    expect((v.setColors.mock.calls[0] as unknown[])[0]).toEqual(new Map([['a', '#fff']]))
    handleCommand(v as unknown as SiteViewer, { type: 'snapshot', requestId: 'r1' }, reply)
    expect(reply).toHaveBeenCalledWith({ type: 'snapshot', requestId: 'r1', dataUrl: 'data:x' })
  })
})
