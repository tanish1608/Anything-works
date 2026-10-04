import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import ActivityPage from './pages/ActivityPage'
import NotificationBell from './components/NotificationBell'
import DrawingsPage from './pages/DrawingsPage'
import EmbedViewerPage from './pages/EmbedViewerPage'
import SheetReviewPage from './pages/SheetReviewPage'
import IssuesPage from './pages/IssuesPage'
import LoginPage from './pages/LoginPage'
import MembersPage from './pages/MembersPage'
import ModelPage from './pages/ModelPage'
import ProjectLayout from './pages/ProjectLayout'
import ProjectsPage from './pages/ProjectsPage'
import StructurePage from './pages/StructurePage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">SiteMesh</Link>
        <span className="grow" />
        <NotificationBell />
        <span className="muted">{user?.name}</span>
        <button className="small" onClick={logout}>Sign out</button>
      </header>
      {children}
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><Shell><ProjectsPage /></Shell></RequireAuth>} />
      <Route path="/p/:pid" element={<RequireAuth><Shell><ProjectLayout /></Shell></RequireAuth>}>
        <Route index element={<Navigate to="model" replace />} />
        <Route path="model" element={<ModelPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="drawings" element={<DrawingsPage />} />
        <Route path="drawings/:sid" element={<SheetReviewPage />} />
        <Route path="structure" element={<StructurePage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>
      <Route path="/embed/p/:pid/viewer" element={<RequireAuth><EmbedViewerPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
