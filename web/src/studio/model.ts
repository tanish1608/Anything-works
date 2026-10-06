/** A deterministic, local-only project sandbox. Every workflow mutation emits an event. */
export type Trade = 'plumbing' | 'electrical' | 'hvac' | 'inspection'
export type WorkStatus = 'planned' | 'active' | 'review' | 'approved' | 'blocked'
export type Page = 'building' | 'work' | 'evidence' | 'handoffs' | 'report' | 'activity' | 'field'
export const TRADES: Record<Trade, { name: string; company: string; person: string; color: string; initials: string }> = {
  plumbing: { name: 'Plumbing', company: 'Apex Mechanical', person: 'Marco Reyes', color: '#387caf', initials: 'MR' },
  electrical: { name: 'Electrical', company: 'Volt Electric', person: 'Jamie Chen', color: '#b18b35', initials: 'JC' },
  hvac: { name: 'HVAC', company: 'North Air', person: 'Alex Morgan', color: '#518f8e', initials: 'AM' },
  inspection: { name: 'Inspection', company: 'Site supervision', person: 'Sarah Mitchell', color: '#8273ac', initials: 'SM' },
}
export const STATUS: Record<WorkStatus, { label: string; color: string }> = {
  planned: { label: 'Planned', color: '#909b9c' }, active: { label: 'In progress', color: '#5989af' },
  review: { label: 'Needs review', color: '#c4953e' }, approved: { label: 'Approved', color: '#44836c' },
  blocked: { label: 'Blocked', color: '#c26955' },
}
export interface Unit { id: string; floor: number; index: number; x: number; z: number; name: string; area: number }
export interface Task { id: string; unit: string; trade: Trade; title: string; status: WorkStatus; due: string; note: string; evidence: string[]; required: boolean }
export interface Evidence { id: string; task: string; image: string; kind: 'sample' | 'photo'; note: string; author: string; at: string }
export interface Issue { id: string; unit: string; task: string; title: string; detail: string; resolved: boolean }
export interface Event { id: string; at: string; title: string; detail: string; unit?: string; task?: string; actor: string }
export interface DemoState { version: 1; tasks: Task[]; evidence: Evidence[]; issues: Issue[]; events: Event[]; handoffs: string[]; report: { text: string; signedAt: string | null } }
export const UNITS: Unit[] = Array.from({ length: 48 }, (_, n) => {
  const floor = Math.floor(n / 8) + 1, index = n % 8
  return { id: `${floor}${String(index + 1).padStart(2, '0')}`, floor, index, x: (index % 4) * 7 - 10.5, z: index < 4 ? 5.3 : -5.3, name: index % 3 === 0 ? 'Two bedroom' : 'One bedroom', area: index % 3 === 0 ? 94 : 76 }
})
const taskTitles: Record<Trade, string> = { plumbing: 'Plumbing rough-in', electrical: 'Electrical rough-in', hvac: 'Ductwork & ventilation', inspection: 'Pre-close inspection' }
export function initialState(): DemoState {
  const tasks: Task[] = [], evidence: Evidence[] = [], events: Event[] = []
  for (const u of UNITS) for (const [i, trade] of (Object.keys(TRADES) as Trade[]).entries()) {
    let status: WorkStatus = u.floor <= 2 ? 'approved' : u.floor === 3 ? (u.index < 3 ? 'approved' : i < 2 ? 'review' : 'active') : u.floor === 4 ? (i === 0 ? 'review' : 'active') : 'planned'
    if (u.id === '304') status = trade === 'plumbing' ? 'blocked' : trade === 'electrical' ? 'review' : 'approved'
    const id = `T-${u.id}-${trade}`
    const evId = `E-${u.id}-${trade}`
    if (status === 'approved' || status === 'review') {
      evidence.push({ id: evId, task: id, image: `/demo/${trade}.svg`, kind: 'sample', note: trade === 'inspection' ? 'Sample inspection record and room walkthrough attached. For demonstration only.' : 'Full-height overview and connection detail recorded. Illustrative demo evidence.', author: TRADES[trade].person, at: `2026-10-04T${String(8 + i).padStart(2, '0')}:24:00-05:00` })
      if (status === 'review') events.push({ id: `seed-${id}`, at: '2026-10-04T10:24:00-05:00', title: 'Evidence submitted for review', detail: `${taskTitles[trade]} · Unit ${u.id}`, unit: u.id, task: id, actor: TRADES[trade].person })
    }
    tasks.push({ id, unit: u.id, trade, title: taskTitles[trade], status, due: '2026-10-05', note: '', evidence: status === 'approved' || status === 'review' ? [evId] : [], required: true })
  }
  events.unshift({ id: 'seed-issue', at: '2026-10-04T11:08:00-05:00', title: 'Handoff blocked in Unit 304', detail: 'Pressure-test record missing. Apex Mechanical assigned to follow up.', unit: '304', task: 'T-304-plumbing', actor: 'Sarah Mitchell' })
  return { version: 1, tasks, evidence, events, handoffs: ['101', '102', '103', '201'], issues: [{ id: 'I-104', unit: '304', task: 'T-304-plumbing', title: 'Pressure-test record missing', detail: 'Attach the test record and a clear photo of the wet-wall connections before the pre-drywall handoff.', resolved: false }], report: { text: '', signedAt: null } }
}
export function unitStatus(state: DemoState, id: string): WorkStatus {
  const tasks = state.tasks.filter(t => t.unit === id && t.required)
  if (state.issues.some(i => i.unit === id && !i.resolved) || tasks.some(t => t.status === 'blocked')) return 'blocked'
  if (tasks.some(t => t.status === 'review')) return 'review'
  if (tasks.length && tasks.every(t => t.status === 'approved' && t.evidence.some(eid => state.evidence.some(e => e.id === eid && e.task === t.id)))) return 'approved'
  return tasks.some(t => t.status !== 'planned') ? 'active' : 'planned'
}
export function stats(state: DemoState) {
  return { approved: state.tasks.filter(t => t.status === 'approved').length, total: state.tasks.length, reviews: state.tasks.filter(t => t.status === 'review').length, issues: state.issues.filter(i => !i.resolved).length, ready: UNITS.filter(u => unitStatus(state, u.id) === 'approved').length }
}
export type Action =
  | { type: 'create'; unit: string; trade: Trade; title: string; due: string; note: string }
  | { type: 'start'; task: string }
  | { type: 'submit'; task: string; image: string; kind: Evidence['kind']; note: string }
  | { type: 'approve'; task: string }
  | { type: 'reject'; task: string; reason: string }
  | { type: 'resolve'; issue: string }
  | { type: 'handoff'; unit: string }
  | { type: 'report'; text: string; sign: boolean }
export function transition(state: DemoState, action: Action, now = new Date().toISOString(), id = crypto.randomUUID()): DemoState {
  const next = structuredClone(state)
  const task = 'task' in action ? next.tasks.find(t => t.id === action.task) : undefined
  const log = (title: string, detail: string, unit = task?.unit, actor = 'Sarah Mitchell') => next.events.unshift({ id, at: now, title, detail, unit, task: task?.id, actor })
  if ('task' in action && !task) throw new Error('This task no longer exists.')
  switch (action.type) {
    case 'create':
      if (!UNITS.some(u => u.id === action.unit) || !action.title.trim()) throw new Error('Choose a room and enter a task title.')
      next.tasks.push({ id, unit: action.unit, trade: action.trade, title: action.title.trim(), due: action.due, note: action.note, status: 'planned', evidence: [], required: true })
      log('Task assigned', `${action.title} · ${TRADES[action.trade].company}`, action.unit)
      break
    case 'start':
      if (task!.status !== 'planned') throw new Error('Only planned work can be started.')
      task!.status = 'active'; log('Work started', task!.title, task!.unit, TRADES[task!.trade].person); break
    case 'submit':
      if (!action.image || !action.note.trim()) throw new Error('Attach evidence and add a field note.')
      if (task!.status === 'approved') throw new Error('This task is already approved.')
      next.evidence.push({ id, task: task!.id, image: action.image, kind: action.kind, note: action.note.trim(), author: TRADES[task!.trade].person, at: now })
      task!.evidence.push(id); task!.status = 'review'
      log('Evidence submitted for review', task!.title, task!.unit, TRADES[task!.trade].person); break
    case 'approve':
      if (task!.status !== 'review') throw new Error('Submit evidence for review before approving work.')
      if (!task!.evidence.some(eid => next.evidence.some(e => e.id === eid && e.task === task!.id && e.image))) throw new Error('Approval requires linked evidence.')
      if (next.issues.some(i => i.task === task!.id && !i.resolved)) throw new Error('Resolve the linked issue before approving this task.')
      task!.status = 'approved'; log('Work approved with evidence', task!.title); break
    case 'reject':
      if (task!.status !== 'review' || !action.reason.trim()) throw new Error('Add a reason to request a retake.')
      task!.status = 'active'; task!.note = action.reason.trim(); log('New evidence requested', action.reason); break
    case 'resolve': {
      const issue = next.issues.find(i => i.id === action.issue)
      if (!issue || issue.resolved) throw new Error('This issue is already resolved.')
      const linked = next.tasks.find(t => t.id === issue.task)
      if (!linked?.evidence.length) throw new Error('Submit correction evidence before resolving this issue.')
      issue.resolved = true
      if (linked.status === 'blocked') linked.status = 'review'
      log('Issue resolved', issue.title, issue.unit); break
    }
    case 'handoff':
      if (unitStatus(next, action.unit) !== 'approved') throw new Error('Every prerequisite must be approved before releasing the room.')
      if (next.handoffs.includes(action.unit)) throw new Error('This room has already been released.')
      next.handoffs.push(action.unit); log('Room released to drywall', `Unit ${action.unit} · Interior Works`, action.unit); break
    case 'report':
      if (next.report.signedAt) throw new Error('The signed report is locked. Export it or reset the demo to start again.')
      if (action.sign && !action.text.trim()) throw new Error('Draft the report before signing.')
      next.report = { text: action.text, signedAt: action.sign ? now : null }; log(action.sign ? 'Daily report signed' : 'Daily report drafted', 'Project activity and evidence summary'); break
  }
  return next
}
export function draftReport(s: DemoState): string {
  const n = stats(s)
  const reviews = s.tasks.filter(t => t.status === 'review')
  return `THE HAWTHORNE · DAILY SITE REPORT\nDemo project · Snapshot of recorded activity\n\nPROGRESS\n${n.approved} of ${n.total} work packages approved with linked demo evidence. ${n.ready} of 48 units meet the configured handoff requirements; ${s.handoffs.length} have been released to Interior Works.\n\nREVIEW QUEUE\n${reviews.length} work packages await review across ${new Set(reviews.map(t => t.unit)).size} units.\n\nOPEN ITEMS\n${s.issues.filter(i => !i.resolved).map(i => `• Unit ${i.unit}: ${i.title}`).join('\n') || 'No open issues recorded.'}\n\nRECENT RECORDED ACTIVITY\n${s.events.slice(0, 6).map(e => `• ${e.title}: ${e.detail} (${e.actor})`).join('\n')}\n\nNEXT ACTIONS\nReview submitted evidence, follow up on unresolved items, and confirm ready rooms with the next trade.\n\nSOURCE\nCompiled from this demo’s task, issue, evidence, and handoff records. No weather, headcount, or unrecorded site conditions have been inferred.`
}
export const STORE_KEY = 'sitemesh-studio-v1'
export function loadState(): DemoState {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (data?.version === 1 && Array.isArray(data.tasks) && Array.isArray(data.events) && Array.isArray(data.evidence) && Array.isArray(data.issues) && Array.isArray(data.handoffs) && data.report) return data
  } catch { /* A fresh, usable demo is preferable to a broken session. */ }
  return initialState()
}
