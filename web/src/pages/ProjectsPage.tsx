import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ROLE_LABEL, type Project } from '../api/types'

export default function ProjectsPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  })
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const create = useMutation({
    mutationFn: () => api<Project>('/projects', { method: 'POST', json: { name, address: address || null } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      nav(`/p/${p.id}/structure`)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }

  return (
    <div className="page stack">
      <h1>Projects</h1>
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {projects && projects.length === 0 && <p className="muted">No projects yet. Create your first one below.</p>}
      <div className="cards">
        {projects?.map((p) => (
          <Link key={p.id} to={`/p/${p.id}`} className="panel card-link">
            <h3>{p.name}</h3>
            <div className="muted">{p.address || 'No address'}</div>
            <div style={{ marginTop: 8 }}>
              <span className="badge">{ROLE_LABEL[p.my_role]}</span>
            </div>
          </Link>
        ))}
      </div>
      <form className="panel stack" onSubmit={submit} style={{ maxWidth: 480 }}>
        <h2>New project</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Maple Court Townhomes" />
        </label>
        <label>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </label>
        {create.error && <div className="error">{(create.error as Error).message}</div>}
        <div>
          <button className="primary" disabled={create.isPending}>Create project</button>
        </div>
      </form>
    </div>
  )
}
