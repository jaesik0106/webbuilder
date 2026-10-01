import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RenderBlock } from '@/blocks/registry'
import type { SiteConfig } from '@/blocks/types'
import { fetchPublicHome, fetchPublicPage, fetchSavedPage, getToken, toProject, type SavedPage } from '@/lib/builderApi'
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

/** 페이지 하나를 실제 화면 그대로 보여 주고, 관리자에게는 바로 수정 도구를 붙인다. */
function SiteView({
  load, autoEdit, emptyTitle = '아직 공개된 페이지가 없습니다', emptyText = '관리자가 페이지를 저장하면 이곳에 표시됩니다.',
}: { load: () => Promise<SavedPage | null>; autoEdit?: boolean; emptyTitle?: string; emptyText?: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editing, setEditing] = useState(false)
  const isAdmin = !!getToken()
  const editingConfig = useConfigStore((s) => s.config)

  useEffect(() => {
    let cancelled = false
    load()
      .then((page) => {
        if (cancelled) return
        setState({ status: 'ready', page })
        // 페이지 메뉴에서 [수정]으로 들어오면 바로 편집 상태로 연다.
        if (autoEdit && page) {
          loadIntoEditor(page)
          setEditing(true)
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [load, autoEdit])

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
              {emptyTitle}
            </p>
            <p className="text-[13px]" style={{ color: 'var(--color-text-2)' }}>
              {emptyText}
            </p>
          </div>
        ))}
      </div>

      {isAdmin ? (
        <OnPageToolbar editing={editing} canEdit={!!page} onToggleEditing={toggleEditing} />
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

const loadHome = () => fetchPublicHome().then((data) => data.page)

export function PublicHome() {
  return <SiteView load={loadHome} />
}

/** /page/:id 관리자 전용. 홈에 공개되지 않은 페이지도 실제 화면에서 바로 수정한다. */
export function PageView() {
  const { id } = useParams()
  const pageId = Number(id)
  const load = useMemo(() => () => fetchSavedPage(pageId).then((data) => data.page), [pageId])
  if (!getToken()) return <Navigate to="/login" replace />
  return <SiteView key={pageId} load={load} autoEdit />
}

/** /about 처럼 서브 페이지 주소로 들어온 방문자에게 그 페이지를 보여 준다. */
export function PublicSubPage() {
  const { slug = '' } = useParams()
  const load = useMemo(
    () => () => fetchPublicPage(slug).then((data) => data.page).catch(() => null),
    [slug],
  )
  return (
    <SiteView
      key={slug}
      load={load}
      emptyTitle="페이지를 찾을 수 없습니다"
      emptyText="주소가 바뀌었거나 삭제된 페이지입니다."
    />
  )
}
