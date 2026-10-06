import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import ActivityPage from './pages/ActivityPage'
import NotificationBell from './components/NotificationBell'
import DrawingsPage from './pages/DrawingsPage'
import { FieldHome, FieldScan, FieldZone, FieldZones, QrRedirect } from './field/FieldPages'
import ProgressPage from './pages/ProgressPage'
import QrPage from './pages/QrPage'
import EmbedViewerPage from './pages/EmbedViewerPage'
import SheetReviewPage from './pages/SheetReviewPage'
import IssuesPage from './pages/IssuesPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'
import MembersPage from './pages/MembersPage'
import ModelPage from './pages/ModelPage'
import ProjectLayout from './pages/ProjectLayout'
import ProjectsPage from './pages/ProjectsPage'
import StructurePage from './pages/StructurePage'
import TodayPage from './pages/TodayPage'
import { Icon } from './studio/Icon'
import Workspace from './workspace/Workspace'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page muted">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand connected-brand"><span className="connected-brand-mark"><Icon name="bolt" size={17} /></span>Everything Works AI</Link>
        <span className="grow" />
        <Link to="/field" className="btn small">Field app</Link>
        <Link to="/demo" className="btn small">Explore demo</Link>
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
      <Route path="/demo/*" element={<Workspace />} />
      <Route path="/" element={<RequireAuth><Shell><ProjectsPage /></Shell></RequireAuth>} />
      <Route path="/p/:pid" element={<RequireAuth><Shell><ProjectLayout /></Shell></RequireAuth>}>
        <Route index element={<Navigate to="model" replace />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="model" element={<ModelPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="qr" element={<QrPage />} />
        <Route path="drawings" element={<DrawingsPage />} />
        <Route path="drawings/:sid" element={<SheetReviewPage />} />
        <Route path="structure" element={<StructurePage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="history" element={<HistoryPage />} />
      </Route>
      <Route path="/field" element={<RequireAuth><FieldHome /></RequireAuth>} />
      <Route path="/field/:pid" element={<RequireAuth><FieldZones /></RequireAuth>} />
      <Route path="/field/:pid/scan" element={<RequireAuth><FieldScan /></RequireAuth>} />
      <Route path="/field/:pid/zone/:zid" element={<RequireAuth><FieldZone /></RequireAuth>} />
      <Route path="/q/:token" element={<RequireAuth><QrRedirect /></RequireAuth>} />
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
