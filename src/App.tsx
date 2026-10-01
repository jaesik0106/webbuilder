import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from './layout/ErrorBoundary'
import { AppLayout } from './layout/AppLayout'
import { Dashboard, PagesScreen, AiHistoryScreen, FilesScreen } from './routes/Dashboard'
import { Deploy } from './routes/Deploy'
import { Settings } from './routes/Settings'
import { NotFound } from './routes/NotFound'
import { Login } from './routes/Login'
import { PublicHome, PageView, PublicSubPage } from './routes/PublicHome'
import { getToken } from './lib/builderApi'

// 관리자 화면은 토큰이 있을 때만 연다. 없으면 로그인으로 보낸다.
function RequireAuth() {
  if (!getToken()) return <Navigate to="/login" replace />
  return <AppLayout />
}

function LoginRoute() {
  const navigate = useNavigate()
  if (getToken()) return <Navigate to="/" replace />
  return <Login onSuccess={() => navigate('/', { replace: true })} />
}

function AppRoutes() {
  return (
    <Routes>
      <Route index element={<PublicHome />} />
      <Route path="login" element={<LoginRoute />} />
      <Route path="page/:id" element={<PageView />} />
      <Route path=":slug" element={<PublicSubPage />} />
      <Route element={<RequireAuth />}>
        <Route path="admin" element={<Dashboard />} />
        <Route path="admin/pages" element={<PagesScreen />} />
        <Route path="admin/ai" element={<AiHistoryScreen />} />
        <Route path="admin/files" element={<FilesScreen />} />
        <Route path="new" element={<Navigate to="/admin" replace />} />
        <Route path="deploy" element={<Deploy />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
