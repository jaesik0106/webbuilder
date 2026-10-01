import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RenderBlock } from '@/blocks/registry'
import type { SiteConfig } from '@/blocks/types'
import { fetchPublicHome, getToken, toProject, type SavedPage } from '@/lib/builderApi'
import { resolveTheme, themeToCSS } from '@/lib/theme-presets'
import { useGoogleFonts } from '@/lib/useGoogleFonts'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { EditableBlocks, OnPageToolbar, VisitorLoginButton } from '@/editor/OnPageEditor'

type LoadState = { status: 'loading' } | { status: 'ready'; page: SavedPage | null } | { status: 'error' }

// 에디터가 이 페이지를 고치도록 프로젝트 목록, 선택 프로젝트, 편집 중 JSON 을 맞춰 둔다.
function loadIntoEditor(page: SavedPage) {
  const project = toProject(page)
  const { projects } = useProjectsStore.getState()
  useProjectsStore.setState({
    projects: [project, ...projects.filter((item) => item.id !== project.id && item.serverId !== page.id)],
  })
  useEditorStore.getState().setActiveProject(project.id)
  useEditorStore.getState().selectBlock(null)
  useConfigStore.getState().setConfig(page.config)
}

export function PublicHome() {
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const isAdmin = !!getToken()
  const editingConfig = useConfigStore((s) => s.config)

  useEffect(() => {
    let cancelled = false
    fetchPublicHome()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', page: data.page })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const page = state.status === 'ready' ? state.page : null
  const config: SiteConfig | undefined = editing ? editingConfig : page?.config
  // 에디터의 setConfig 와 같은 기준으로 첫 페이지를 홈으로 렌더한다.
  const blocks = config?.pages?.length ? config.pages[0].blocks : config?.blocks ?? []

  const resolved = useMemo(() => resolveTheme(config?.theme), [config?.theme])
  const cssVars = useMemo(() => themeToCSS(resolved), [resolved])
  useGoogleFonts([resolved.fontSans, resolved.fontDisplay, resolved.fontMono])

  useEffect(() => {
    document.title = config?.name || page?.name || '웹빌더'
  }, [config?.name, page?.name])

  function toggleEditing() {
    if (!page) return
    if (editing) {
      // 편집을 끝내면 방금 고친 내용을 그대로 보여 준다.
      setState({ status: 'ready', page: { ...page, config: useConfigStore.getState().config } })
      useEditorStore.getState().selectBlock(null)
      setEditing(false)
      return
    }
    loadIntoEditor(page)
    setEditing(true)
  }

  function openFullEditor() {
    if (!page) {
      navigate('/admin')
      return
    }
    if (!editing) loadIntoEditor(page)
    navigate('/editor')
  }

  return (
    <>
      <div
        // 관리자 앱 때문에 body 가 스크롤을 막고 있어서, 공개 홈은 자체 스크롤 영역을 쓴다.
        className="@container h-screen overflow-y-auto"
        style={{ ...cssVars, color: 'var(--color-text-0)', backgroundColor: 'var(--color-bg-1)' } as React.CSSProperties}
      >
        {state.status === 'loading' && <div className="min-h-screen" />}

        {state.status === 'error' && (
          <div className="min-h-screen flex items-center justify-center px-6 text-center text-[14px]" style={{ color: 'var(--color-text-2)' }}>
            홈페이지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {state.status === 'ready' && (editing ? (
          <EditableBlocks />
        ) : blocks.length > 0 ? (
          <main>
            {blocks.map((block) => (
              <RenderBlock key={block.id} block={block} />
            ))}
          </main>
        ) : (
          <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
            <p className="text-[18px] font-semibold mb-1" style={{ color: 'var(--color-text-0)' }}>
              아직 공개된 페이지가 없습니다
            </p>
            <p className="text-[13px]" style={{ color: 'var(--color-text-2)' }}>
              관리자가 페이지를 저장하면 이곳에 표시됩니다.
            </p>
          </div>
        ))}
      </div>

      {isAdmin ? (
        <OnPageToolbar editing={editing} onToggleEditing={toggleEditing} onOpenEditor={openFullEditor} />
      ) : (
        <VisitorLoginButton />
      )}

      {isAdmin && (
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
      )}
    </>
  )
}
