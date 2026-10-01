import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { TopNav } from './TopNav'
import { ShortcutsModal } from '@/editor/ShortcutsModal'
import { getToken, listSavedPages, toProject } from '@/lib/builderApi'
import { useProjectsStore } from '@/store/projectsStore'
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  useKeyboardShortcuts()

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
      <TopNav />
      <main id="main-content" className="flex-1 mt-12 overflow-hidden" role="main">
        <div key={location.pathname} className="h-full animate-fade-in-up">
          <Outlet />
        </div>
      </main>
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
      <ShortcutsModal />
    </div>
  )
}
