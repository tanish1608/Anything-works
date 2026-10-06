import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { BuildingView, Avatar, StatusBadge } from './BuildingView'
import { ActivityPage, EvidencePage, FieldPage, HandoffPage, ReportPage, WorkPage, formatDate } from './WorkflowPages'
import { STORE_KEY, TRADES, UNITS, initialState, loadState, stats, transition, type Action, type DemoState, type Page, type Task, type Trade } from './model'
import './studio.css'

const NAV: { page: Page; name: string; icon: string }[] = [
  { page: 'building', name: 'Building overview', icon: 'cube' }, { page: 'work', name: 'Work board', icon: 'work' },
  { page: 'evidence', name: 'Evidence inbox', icon: 'camera' }, { page: 'handoffs', name: 'Trade handoffs', icon: 'handoff' },
  { page: 'report', name: 'Daily report', icon: 'report' }, { page: 'activity', name: 'Activity', icon: 'activity' },
]
const TOUR = [
  { title: 'A building you can actually explore.', description: 'Six levels, 48 apartments, and detailed architectural and service systems. Orbit the model, isolate a floor, or turn on X-ray to look inside.', page: 'building', icon: 'cube' },
  { title: 'Put the work in the right hands.', description: 'Assign a crew to a room. Every work package has an owner, a due date, and evidence that follows it through review.', page: 'work', icon: 'work' },
  { title: 'Capture it once, from the field.', description: 'Try Marco’s plumbing task in Unit 304. Post a sample or upload your own photo and add a note. Updates stay on this device.', page: 'field', icon: 'phone' },
  { title: 'Review the proof before the handoff.', description: 'Resolve Unit 304’s missing-record issue, approve its evidence, then approve the electrical package. The room becomes ready only when all prerequisites are approved.', page: 'evidence', icon: 'shield' },
  { title: 'Give the next crew a clear green light.', description: 'Release a ready room to drywall and draft a daily report from the recorded activity. Your actions persist until you reset the demo.', page: 'handoffs', icon: 'handoff' },
]
type Modal = 'create' | 'settings' | 'tour' | null

export default function Studio() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('view'), page: Page = [...NAV.map(n => n.page), 'field'].includes(requested || '') ? requested as Page : 'building'
  const [state, setState] = useState<DemoState>(loadState), [selected, setSelected] = useState('304')
  const [modal, setModal] = useState<Modal>(null), [taskId, setTaskId] = useState<string | null>(null), [captureId, setCaptureId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null), [search, setSearch] = useState(''), [mobileNav, setMobileNav] = useState(false)
  const [tour, setTour] = useState(0), [online, setOnline] = useState(navigator.onLine), [resetConfirm, setResetConfirm] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null), notificationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const n = stats(state), completion = Math.round(n.approved / n.total * 100)
  const navigate = (view: string) => { setParams({ view }); setMobileNav(false); setSearch('') }
  const notify = (text: string, error = false) => { clearTimeout(notificationTimer.current); setToast({ text, error }); notificationTimer.current = setTimeout(() => setToast(null), 5000) }
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine)
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus() } }
    window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener('keydown', shortcut)
    return () => { window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('keydown', shortcut); clearTimeout(notificationTimer.current) }
  }, [])
  const act = (action: Action): boolean => {
    try {
      const next = transition(state, action)
      localStorage.setItem(STORE_KEY, JSON.stringify(next)); setState(next)
      notify(action.type === 'approve' ? 'Work approved. Room readiness updated.' : action.type === 'submit' ? 'Evidence saved on this device and sent to the demo review inbox.' : action.type === 'handoff' ? `Unit ${action.unit} released to Interior Works.` : action.type === 'create' ? 'Work assigned. The room’s prerequisites have been updated.' : action.type === 'resolve' ? 'Issue resolved. Evidence is ready for approval.' : action.type === 'report' ? action.sign ? 'Report signed and locked.' : 'Report draft saved.' : action.type === 'reject' ? 'New evidence requested. Work returned to the crew.' : 'Work started.')
      return true
    } catch (e) { notify(e instanceof DOMException && e.name === 'QuotaExceededError' ? 'Device storage is full. Export your report and reset the demo, or use a smaller photo.' : (e as Error).message, true); return false }
  }
  const openTask = (task: Task) => { setTaskId(task.id); setSelected(task.unit) }
  const task = state.tasks.find(t => t.id === taskId), capture = state.tasks.find(t => t.id === captureId)
  const searchUnits = search.trim() ? UNITS.filter(u => `${u.id} ${u.name} level ${u.floor}`.includes(search.toLowerCase())).slice(0, 6) : []
  const searchTasks = search.trim() ? state.tasks.filter(t => `${t.title} ${t.unit} ${TRADES[t.trade].company}`.toLowerCase().includes(search.toLowerCase())).slice(0, 4) : []
  const reset = () => { const fresh = initialState(); try { localStorage.setItem(STORE_KEY, JSON.stringify(fresh)); setState(fresh); setResetConfirm(false); setModal(null); setTaskId(null); setSelected('304'); navigate('building'); notify('Demo restored to its starting state.') } catch { notify('This browser is not allowing local storage.', true) } }
  return <div className="studio">
    {mobileNav && <button className="st-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`st-sidebar ${mobileNav ? 'open' : ''}`}>
      <Link to="/demo" className="st-brand"><span className="st-brand-mark"><Icon name="layers" size={26} /></span>site<span>mesh</span><i /></Link>
      <button className="st-project-picker" onClick={() => setModal('settings')}><span className="st-project-icon"><Icon name="building" size={20} /></span><span><strong>The Hawthorne</strong><small>Residential · Building A</small></span><Icon name="down" size={14} /></button>
      <div className="st-nav-label">PROJECT WORKSPACE</div>
      <nav aria-label="Project workspace">{NAV.map(item => <button className={page === item.page ? 'active' : ''} key={item.page} onClick={() => navigate(item.page)} aria-current={page === item.page ? 'page' : undefined}><Icon name={item.icon} size={19} /><span>{item.name}</span>{item.page === 'evidence' && n.reviews > 0 && <b>{n.reviews}</b>}{item.page === 'handoffs' && <i className="st-nav-dot" />}</button>)}</nav>
      <div className="st-nav-label st-field-label">ON SITE</div><button className={`st-field-link ${page === 'field' ? 'active' : ''}`} onClick={() => navigate('field')}><Icon name="phone" size={19} /><span>Field workspace</span><Icon name="arrow" size={14} /></button>
      <div className="st-sidebar-bottom"><div className="st-demo-card"><span><Icon name="spark" size={17} />BUILT TO EXPLORE</span><strong>See the full picture.</strong><p>Walk through a day on site, from field update to handoff.</p><button onClick={() => { setTour(0); setModal('tour') }}>Take a guided tour <Icon name="arrow" size={14} /></button></div><button className="st-settings-link" onClick={() => setModal('settings')}><Icon name="settings" size={18} />Demo settings<span>V1</span></button><div className="st-user"><span className="st-user-avatar">SM</span><div><strong>Sarah Mitchell</strong><small>Project superintendent</small></div><span className="st-user-online" /></div></div>
    </aside>
    <div className="st-main">
      <header className="st-topbar"><button className="st-mobile-menu st-icon-btn" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu" /></button><div className="st-header-breadcrumb">Projects <Icon name="chevron" size={12} /><strong>The Hawthorne</strong><span className="st-demo-label">INTERACTIVE DEMO</span></div><div className="st-global-search"><Icon name="search" size={16} /><input ref={searchRef} aria-label="Search project" placeholder="Find a room, task, or trade…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Escape' && setSearch('')} /><kbd>⌘ K</kbd>{search && <div className="st-search-results"><span className="st-eyebrow">PROJECT RESULTS</span>{searchUnits.map(u => <button key={u.id} onClick={() => { setSelected(u.id); navigate('building') }}><Icon name="building" size={16} /><span>Unit {u.id}<small>Level {u.floor} · {u.name}</small></span><Icon name="arrow" size={14} /></button>)}{searchTasks.map(t => <button key={t.id} onClick={() => { openTask(t); setSearch('') }}><Icon name="work" size={16} /><span>{t.title}<small>Unit {t.unit} · {TRADES[t.trade].company}</small></span></button>)}{!searchTasks.length && !searchUnits.length && <p>No rooms or tasks found.</p>}</div>}</div><button className="st-notification st-icon-btn" aria-label={`${n.reviews} submissions need review`} onClick={() => navigate('evidence')}><Icon name="bell" size={19} />{n.reviews > 0 && <i />}</button><span className="st-header-avatar">SM</span></header>
      <div className="st-project-heading"><div><div className="st-project-kicker"><span className="st-live-dot" />PROJECT A-001 <span>·</span> CHICAGO, IL</div><h1>The Hawthorne<span>Building better, together.</span></h1></div><div className="st-project-actions"><span className="st-sync"><Icon name={online ? 'shield' : 'wifi'} size={14} />{online ? 'Local demo workspace' : 'Offline · saved on device'}</span><button className="st-secondary" onClick={() => navigate('field')}><Icon name="phone" size={16} />Field view</button><button className="st-primary" onClick={() => setModal('create')}><Icon name="plus" size={16} />Assign work</button></div></div>
      <div className="st-metrics"><button onClick={() => navigate('work')}><span className="st-metric-icon green"><Icon name="layers" size={19} /></span><div><span>Verified progress</span><strong>{completion}<small>%</small></strong><div className="st-metric-track"><i style={{ width: `${completion}%` }} /></div></div><span className="st-metric-caption">{n.approved} / {n.total} packages</span></button><button onClick={() => navigate('evidence')}><span className="st-metric-icon amber"><Icon name="camera" size={19} /></span><div><span>Awaiting review</span><strong>{String(n.reviews).padStart(2, '0')}</strong></div><span className="st-metric-caption">Evidence submitted <Icon name="arrow" size={13} /></span></button><button onClick={() => navigate('handoffs')}><span className="st-metric-icon red"><Icon name="alert" size={19} /></span><div><span>Open blockers</span><strong>{String(n.issues).padStart(2, '0')}</strong></div><span className="st-metric-caption">Needs your attention <Icon name="arrow" size={13} /></span></button><button onClick={() => navigate('handoffs')}><span className="st-metric-icon green"><Icon name="handoff" size={19} /></span><div><span>Ready for next trade</span><strong>{String(n.ready).padStart(2, '0')}<small> / 48</small></strong></div><span className="st-metric-caption">All prerequisites approved <Icon name="arrow" size={13} /></span></button></div>
      <main className="st-content" id="main-content">
        {page === 'building' && <BuildingView state={state} selected={selected} select={setSelected} openTask={openTask} createTask={() => setModal('create')} navigate={navigate} />}
        {page === 'work' && <WorkPage state={state} openTask={openTask} createTask={() => setModal('create')} />}
        {page === 'evidence' && <EvidencePage state={state} act={act} openTask={openTask} />}
        {page === 'handoffs' && <HandoffPage state={state} act={act} selectUnit={id => { setSelected(id); navigate('building') }} />}
        {page === 'report' && <ReportPage state={state} act={act} />}
        {page === 'activity' && <ActivityPage state={state} openTask={openTask} />}
        {page === 'field' && <FieldPage state={state} openTask={openTask} capture={t => setCaptureId(t.id)} />}
      </main>
      <footer className="st-app-footer"><span><i />A connected site is a better site.</span><span>Sample project · simulated workflows · changes stay on this device</span><Link to="/">Open connected projects <Icon name="arrow" size={12} /></Link></footer>
    </div>
    {toast && <div className={`st-toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}><Icon name={toast.error ? 'alert' : 'check'} size={18} /><span>{toast.text}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={14} /></button></div>}
    {task && !capture && <TaskDialog task={task} state={state} act={act} close={() => setTaskId(null)} capture={() => setCaptureId(task.id)} />}
    {capture && <CaptureDialog task={capture} act={act} close={() => setCaptureId(null)} />}
    {modal === 'create' && <CreateDialog unit={selected} act={act} close={() => setModal(null)} />}
    {modal === 'settings' && <Dialog title="Your demo workspace" subtitle="An independent space to explore the SiteMesh vision." close={() => { setModal(null); setResetConfirm(false) }}><div className="st-settings-body"><div className="st-settings-project"><span className="st-mark"><Icon name="building" size={26} /></span><div><h3>The Hawthorne</h3><p>6 levels · 48 apartments · four coordinated trades</p></div></div><div className="st-callout"><Icon name="shield" size={20} /><p>This is a fictional project with illustrative evidence. Actions persist in this browser. No invitations, notifications, AI checks, or live project updates are sent.</p></div><div className="st-settings-row"><div><strong>Connected project workspace</strong><p>Use the existing backend for IFC imports and live project records.</p></div><Link to="/" className="st-secondary">Open <Icon name="arrow" size={14} /></Link></div><div className="st-settings-row"><div><strong>Restore the starting scenario</strong><p>Clears only this demo’s tasks, uploaded images, and decisions.</p></div><button className="st-secondary st-danger" onClick={() => resetConfirm ? reset() : setResetConfirm(true)}>{resetConfirm ? 'Confirm reset' : 'Reset demo'}</button></div></div></Dialog>}
    {modal === 'tour' && <Dialog title={TOUR[tour].title} subtitle={`A DAY AT THE HAWTHORNE · ${tour + 1} OF ${TOUR.length}`} close={() => setModal(null)}><div className="st-tour"><div className="st-tour-art"><Icon name={TOUR[tour].icon} size={66} /><span>{String(tour + 1).padStart(2, '0')}</span></div><p>{TOUR[tour].description}</p><div className="st-tour-dots">{TOUR.map((s, i) => <button key={s.page} aria-label={`Tour step ${i + 1}`} className={tour === i ? 'active' : ''} onClick={() => { setTour(i); navigate(s.page) }} />)}</div><div className="st-dialog-actions"><button className="st-secondary" onClick={() => { navigate(TOUR[tour].page); setModal(null) }}>Explore this view</button><button className="st-primary" onClick={() => { if (tour === TOUR.length - 1) { setModal(null); navigate('field') } else { setTour(tour + 1); navigate(TOUR[tour + 1].page) } }}>{tour === TOUR.length - 1 ? 'Try a field update' : 'Continue'}<Icon name="arrow" size={15} /></button></div></div></Dialog>}
  </div>
}

export function Dialog({ title, subtitle, close, children, wide = false }: { title: string; subtitle?: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), closeRef = useRef(close); closeRef.current = close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || [])].filter(n => n.getClientRects().length)
        if (!nodes.length) { e.preventDefault(); return }
        if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === ref.current)) { e.preventDefault(); nodes.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus() }
      }
    }
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div className="st-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close() }}><div className={`st-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><div className="st-dialog-head"><div>{subtitle && <span className="st-eyebrow">{subtitle}</span>}<h2>{title}</h2></div><button className="st-icon-btn" onClick={close} aria-label="Close dialog"><Icon name="close" size={20} /></button></div>{children}</div></div>
}
function CreateDialog({ unit, act, close }: { unit: string; act: (action: Action) => boolean; close: () => void }) {
  const [title, setTitle] = useState(''), [room, setRoom] = useState(unit), [trade, setTrade] = useState<Trade>('plumbing'), [due, setDue] = useState('2026-10-05'), [note, setNote] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); if (act({ type: 'create', title, unit: room, trade, due, note })) close() }
  return <Dialog title="Give the next task a clear owner." subtitle="ASSIGN WORK" close={close}><form className="st-form" onSubmit={submit}><label>What needs to be done?<input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Complete wet-wall pressure test" /></label><div className="st-form-row"><label>Room<select value={room} onChange={e => setRoom(e.target.value)}>{UNITS.map(u => <option key={u.id} value={u.id}>Unit {u.id} · Level {u.floor}</option>)}</select></label><label>Due date<input type="date" required value={due} onChange={e => setDue(e.target.value)} /></label></div><label>Responsible crew<select value={trade} onChange={e => setTrade(e.target.value as Trade)}>{Object.entries(TRADES).map(([k, t]) => <option key={k} value={k}>{t.company} · {t.name}</option>)}</select></label><label>Completion criteria<textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What should the crew capture or check before submitting?" /></label><div className="st-callout"><Icon name="shield" size={18} /><p>This task becomes a room prerequisite. Completing it requires evidence and approval before the room is ready.</p></div><div className="st-dialog-actions"><button type="button" className="st-secondary" onClick={close}>Cancel</button><button className="st-primary" type="submit">Assign to {TRADES[trade].person.split(' ')[0]}<Icon name="arrow" size={16} /></button></div></form></Dialog>
}
function TaskDialog({ task, state, act, close, capture }: { task: Task; state: DemoState; act: (action: Action) => boolean; close: () => void; capture: () => void }) {
  const [reason, setReason] = useState(''), [retake, setRetake] = useState(false)
  const evidence = state.evidence.filter(e => task.evidence.includes(e.id)), issue = state.issues.find(i => i.task === task.id && !i.resolved)
  return <Dialog title={task.title} subtitle={`UNIT ${task.unit} · LEVEL ${task.unit[0]} · ${TRADES[task.trade].name.toUpperCase()}`} close={close} wide><div className="st-task-detail"><div className="st-task-assignment"><Avatar trade={task.trade} /><div><strong>{TRADES[task.trade].person}</strong><span>{TRADES[task.trade].company} · Due {formatDate(task.due)}</span></div><StatusBadge status={task.status} /></div>{task.note && <div className="st-callout"><Icon name="work" size={18} /><p>{task.note}</p></div>}{issue && <div className="st-callout danger"><Icon name="alert" size={22} /><div><strong>{issue.title}</strong><p>{issue.detail}</p><button className="st-secondary" disabled={!evidence.length} onClick={() => act({ type: 'resolve', issue: issue.id })}>Resolve with attached evidence</button>{!evidence.length && <small>Attach correction evidence first.</small>}</div></div>}<div className="st-section-heading"><h3>Evidence & field notes</h3><span>{evidence.length} attachment{evidence.length === 1 ? '' : 's'}</span></div>{!evidence.length ? <button className="st-upload-empty" onClick={capture}><Icon name="camera" size={27} /><strong>No evidence attached yet</strong><span>Add a field update to move this work into review.</span></button> : <div className="st-task-evidence">{evidence.map(e => <div key={e.id}><img src={e.image} alt={`Evidence for ${task.title}`} /><div><span className="st-eyebrow">{e.kind === 'sample' ? 'ILLUSTRATIVE DEMO SAMPLE' : 'UPLOADED PHOTO'}</span><p>{e.note}</p><small>{e.author} · {formatDate(e.at)}</small></div></div>)}</div>}{retake && <label className="st-retake">What should the crew correct or capture?<textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain what is missing…" rows={3} /><button className="st-secondary" disabled={!reason.trim()} onClick={() => { if (act({ type: 'reject', task: task.id, reason })) setRetake(false) }}>Send request to demo crew</button></label>}<div className="st-dialog-actions">{task.status === 'planned' && <button className="st-secondary" onClick={() => act({ type: 'start', task: task.id })}>Start work</button>}{task.status === 'review' && <button className="st-secondary" onClick={() => setRetake(!retake)}>Request changes</button>}{task.status !== 'approved' && <button className="st-secondary" onClick={capture}><Icon name="camera" size={16} />Add evidence</button>}{task.status === 'review' && <button className="st-primary" disabled={!!issue} onClick={() => act({ type: 'approve', task: task.id })}><Icon name="check" size={16} />Approve with evidence</button>}{task.status === 'approved' && <span className="st-approved-message"><Icon name="shield" size={17} />Approved with linked evidence</span>}</div></div></Dialog>
}
function CaptureDialog({ task, act, close }: { task: Task; act: (action: Action) => boolean; close: () => void }) {
  const [image, setImage] = useState(''), [kind, setKind] = useState<'sample' | 'photo'>('photo'), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('Choose an image smaller than 20 MB.'); return }
    setBusy(true); setError('')
    try {
      const bitmap = await createImageBitmap(file), scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
      setImage(canvas.toDataURL('image/jpeg', .76)); setKind('photo')
    } catch { setError('This image could not be read. Try a JPEG or PNG.') } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); if (act({ type: 'submit', task: task.id, image, kind, note })) close() }
  return <Dialog title="Show the team what’s done." subtitle={`FIELD UPDATE · UNIT ${task.unit} · ${TRADES[task.trade].name.toUpperCase()}`} close={close}><form className="st-form" onSubmit={submit}><div className="st-capture-steps"><span className={image ? 'done' : 'active'}><b>1</b>Capture evidence</span><i /><span className={note ? 'done' : ''}><b>2</b>Add context</span><i /><span><b>3</b>Submit</span></div>{image ? <div className="st-capture-preview"><img src={image} alt="Evidence preview" /><button type="button" aria-label="Remove attachment" onClick={() => setImage('')}><Icon name="close" size={15} /></button><span>{kind === 'sample' ? 'Illustrative sample · demo only' : 'Your photo · stored on this device'}</span></div> : <label className="st-upload-empty"><Icon name="camera" size={31} /><strong>{busy ? 'Preparing photo…' : 'Add a clear view of the work'}</strong><span>JPEG, PNG, or WebP · up to 20 MB</span><input type="file" accept="image/*" capture="environment" aria-label="Upload evidence photo" onChange={e => upload(e.target.files?.[0])} disabled={busy} /></label>}{!image && <button type="button" className="st-secondary st-full" onClick={() => { setImage(`/demo/${task.trade}.svg`); setKind('sample'); setNote('Demo submission: the required view and completion record are attached for review.') }}><Icon name="spark" size={15} />Use illustrative demo evidence</button>}<label>Field note<textarea required rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you finish? Anything the reviewer should know?" /></label><div className="st-callout"><Icon name="shield" size={18} /><p>Submitting sends this task to the demo review inbox. Only approval changes its status to complete.</p></div>{error && <p className="st-error" role="alert">{error}</p>}<div className="st-dialog-actions"><button type="button" className="st-secondary" onClick={close}>Cancel</button><button type="submit" className="st-primary" disabled={!image || !note.trim() || busy}>Submit for review <Icon name="arrow" size={16} /></button></div></form></Dialog>
}
