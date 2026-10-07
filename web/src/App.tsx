import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

const Workspace = lazy(() => import('./workspace/Workspace'))

function LegacyWorkspaceRedirect() {
  const { pathname, search, hash } = useLocation()
  // Keep saved work selections and capture links when retiring the /demo prefix.
  const path = pathname.slice('/demo'.length) || '/'
  return <Navigate to={`${path}${search}${hash}`} replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="page muted">Loading workspace…</div>}>
      <Routes>
        <Route path="/demo/*" element={<LegacyWorkspaceRedirect />} />
        <Route path="/bim-lab" element={<Navigate to="/building" replace />} />
        <Route path="/field" element={<Navigate to="/capture" replace />} />
        {/* Retired private-project URLs cannot identify records in the local workspace. */}
        <Route path="/p/*" element={<Navigate to="/" replace />} />
        <Route path="/field/*" element={<Navigate to="/" replace />} />
        <Route path="/q/*" element={<Navigate to="/" replace />} />
        <Route path="/embed/*" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Navigate to="/?screen=projects&panel=import&signin=1" replace />} />
        <Route path="/*" element={<Workspace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  // Temporary public testing workspace: no AuthProvider or sign-in gate.
  // Restore scoped sign-in here when the chosen UI connects to private project APIs.
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}
