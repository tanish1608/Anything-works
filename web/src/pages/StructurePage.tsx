import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { can, type Building, type Level, type Zone } from '../api/types'
import { useProject } from './ProjectLayout'

function InlineAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await onAdd(name.trim())
      setName('')
      setErr(null)
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  return (
    <form className="row" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="small">Add</button>
      {err && <span className="error">{err}</span>}
    </form>
  )
}

export default function StructurePage() {
  const { project } = useProject()
  const editable = can.editStructure(project.my_role)
  const qc = useQueryClient()
  const key = ['tree', project.id]
  const { data: tree, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api<Building[]>(`/projects/${project.id}/tree`),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const call = useMutation({
    mutationFn: ({ path, method, json }: { path: string; method: string; json?: unknown }) =>
      api(path, { method, json }),
    onSuccess: refresh,
  })
  const run = (path: string, method: string, json?: unknown) => call.mutateAsync({ path, method, json })

  const rename = (path: string, current: string) => {
    const name = window.prompt('New name', current)
    if (name && name !== current) run(path, 'PATCH', { name })
  }
  const remove = (path: string, what: string) => {
    if (window.confirm(`Delete ${what}? Everything inside it is deleted too. This is recorded in the history.`))
      run(path, 'DELETE')
  }
  const editLevel = (lv: Level) => {
    const h = window.prompt('Floor-to-floor height (m)', String(lv.height_m))
    if (h && Number(h) > 0) run(`/levels/${lv.id}`, 'PATCH', { height_m: Number(h) })
  }
  const nextIndex = (b: Building) => (b.levels.length ? Math.max(...b.levels.map((l) => l.index)) + 1 : 0)

  return (
    <div className="page stack">
      <h1>Buildings & zones</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Projects contain buildings, buildings contain levels, and levels contain zones (rooms, units or areas).
        {project.my_role === 'trade' && ' You only see the zones assigned to you.'}
      </p>
      {call.error && <div className="error">{(call.error as Error).message}</div>}
      {isLoading && <p className="muted">Loading…</p>}
      {tree && tree.length === 0 && <p className="muted">No buildings yet.</p>}
      <div className="panel tree">
        <ul>
          {tree?.map((b) => (
            <li key={b.id}>
              <div className="node">
                <strong className="grow">🏢 {b.name}</strong>
                {editable && (
                  <>
                    <button className="small" onClick={() => rename(`/buildings/${b.id}`, b.name)}>Rename</button>
                    <button className="small danger" onClick={() => remove(`/buildings/${b.id}`, b.name)}>Delete</button>
                  </>
                )}
              </div>
              <ul>
                {b.levels.map((lv) => (
                  <li key={lv.id}>
                    <div className="node">
                      <span className="grow">
                        {lv.name} <span className="muted">· {lv.height_m} m floor-to-floor</span>
                      </span>
                      {editable && (
                        <>
                          <button className="small" onClick={() => editLevel(lv)}>Height</button>
                          <button className="small" onClick={() => rename(`/levels/${lv.id}`, lv.name)}>Rename</button>
                          <button className="small danger" onClick={() => remove(`/levels/${lv.id}`, lv.name)}>Delete</button>
                        </>
                      )}
                    </div>
                    <ul>
                      {lv.zones.map((z: Zone) => (
                        <li key={z.id}>
                          <div className="node">
                            <span className="grow">
                              {z.name} {z.code && <span className="muted">({z.code})</span>}{' '}
                              <span className="badge">{z.kind}</span>
                            </span>
                            {editable && (
                              <>
                                <button className="small" onClick={() => rename(`/zones/${z.id}`, z.name)}>Rename</button>
                                <button className="small danger" onClick={() => remove(`/zones/${z.id}`, z.name)}>Delete</button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                      {editable && (
                        <li>
                          <InlineAdd placeholder="New zone, e.g. Unit 304, Bedroom 2"
                            onAdd={(name) => run(`/levels/${lv.id}/zones`, 'POST', { name })} />
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
                {editable && (
                  <li>
                    <InlineAdd placeholder="New level, e.g. Level 1"
                      onAdd={(name) => run(`/buildings/${b.id}/levels`, 'POST', { name, index: nextIndex(b) })} />
                  </li>
                )}
              </ul>
            </li>
          ))}
          {editable && (
            <li>
              <InlineAdd placeholder="New building" onAdd={(name) => run(`/projects/${project.id}/buildings`, 'POST', { name })} />
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
