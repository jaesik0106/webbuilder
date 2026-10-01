import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { AdminSidebar, AdminTopBar } from './AdminSidebar'
import { getToken, listSavedPages, toProject } from '@/lib/builderApi'
import { useProjectsStore } from '@/store/projectsStore'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    listSavedPages()
      .then((data) => {
        if (cancelled) return
        useProjectsStore.setState({ projects: data.pages.map(toProject) })
      })
      .catch(() => {
        if (cancelled) return
        if (!getToken()) {
          navigate('/login', { replace: true })
          return
        }
        toast.error('저장한 페이지를 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      {/* 관리자 화면은 기존 10PAGE 관리자와 같은 톤(흰 바탕, 파란 상단 바, 왼쪽 메뉴). */}
      <div className="admin-light flex-1 flex overflow-hidden bg-bg-0 text-text-0">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AdminTopBar />
          <main id="main-content" className="flex-1 overflow-hidden" role="main">
            <div key={location.pathname} className="h-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--color-bg-3)',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-0)',
            fontSize: '13px',
          },
        }}
      />
    </div>
  )
}
