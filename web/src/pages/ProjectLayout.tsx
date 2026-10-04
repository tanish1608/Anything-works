import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ROLE_LABEL, type Project } from '../api/types'

export interface ProjectCtx {
  project: Project
}

const NAV = [
  { to: 'model', label: '3D model' },
  { to: 'structure', label: 'Buildings & zones' },
  { to: 'members', label: 'Team' },
  { to: 'activity', label: 'Activity' },
]

export default function ProjectLayout() {
  const { pid } = useParams()
  const { data: project, error } = useQuery({
    queryKey: ['project', pid],
    queryFn: () => api<Project>(`/projects/${pid}`),
  })
  if (error) return <div className="page error">{(error as Error).message}</div>
  if (!project) return <div className="page muted">Loading…</div>
  return (
    <div className="main">
      <nav className="sidenav" aria-label="Project">
        <div className="title">
          {project.name}
          <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{ROLE_LABEL[project.my_role]}</div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="content">
        <Outlet context={{ project } satisfies ProjectCtx} />
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProject(): ProjectCtx {
  return useOutletContext<ProjectCtx>()
}
