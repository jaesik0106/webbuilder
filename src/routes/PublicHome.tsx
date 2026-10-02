import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RenderBlock } from '@/blocks/registry'
import type { SiteConfig } from '@/blocks/types'
import { fetchPublicHome, fetchPublicPage, fetchSavedPage, getToken, toProject, type SavedPage } from '@/lib/builderApi'
import { resolveTheme, themeToCSS } from '@/lib/theme-presets'
import { useGoogleFonts } from '@/lib/useGoogleFonts'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { EditableBlocks, OnPageToolbar, UnsavedChangesDialog, VisitorLoginButton } from '@/editor/OnPageEditor'
import { discardChanges, isDirty, markCurrentSaved, saveCurrentPage } from '@/editor/manualSave'
import { SiteHead } from '@/lib/SiteHead'
import { PopupLayer } from '@/lib/PopupLayer'

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
  markCurrentSaved()
}

/** 페이지 하나를 실제 화면 그대로 보여 주고, 관리자에게는 바로 수정 도구를 붙인다. */
function SiteView({
  load, autoEdit, emptyTitle = '아직 공개된 페이지가 없습니다', emptyText = '관리자가 페이지를 저장하면 이곳에 표시됩니다.',
}: { load: () => Promise<SavedPage | null>; autoEdit?: boolean; emptyTitle?: string; emptyText?: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editing, setEditing] = useState(!!autoEdit)
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


  const [confirmExit, setConfirmExit] = useState(false)
  const canvasLeft = useEditorStore((s) => s.canvasLeft)
  const canvasRight = useEditorStore((s) => s.canvasRight)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const inset = canvasLeft + canvasRight
  const available = Math.max(viewportWidth - inset, 1)
  // 편집 중에는 실제 창 너비로 배치한 뒤, 패널 사이 공간에 맞게 축소한다.
  const scale = inset > 0 ? available / viewportWidth : 1
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameHeight, setFrameHeight] = useState(0)

  useEffect(() => {
    const el = frameRef.current
    if (!el || scale === 1) return
    const update = () => setFrameHeight(el.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scale, editing, state.status])

  // 편집을 끝내면 저장된 내용(또는 방금 저장한 내용)을 보여 준다.
  function finishEditing() {
    if (!page) return
    setState({ status: 'ready', page: { ...page, config: useConfigStore.getState().config } })
    useEditorStore.getState().selectBlock(null)
    setConfirmExit(false)
    setEditing(false)
  }

  function toggleEditing() {
    if (!page) return
    if (editing) {
      if (isDirty()) setConfirmExit(true)
      else finishEditing()
      return
    }
    loadIntoEditor(page)
    setEditing(true)
  }

  return (
    <>
      {/* 사이트 설정의 제목, 메타, 파비콘, 추가 CSS, 스크립트 */}
      <SiteHead pageName={page?.name || config?.name} isHome={page ? page.isHome : true} editing={editing} />
      {/* 팝업은 메인 페이지에서, 수정 중이 아닐 때만 */}
      {!editing && (page ? page.isHome : true) && <PopupLayer />}
      <div
        // 관리자 앱 때문에 body 가 스크롤을 막고 있어서, 공개 홈은 자체 스크롤 영역을 쓴다.
        // 편집 중에는 좌우 패널 너비만큼 비워서, 패널 아래 페이지가 잘리지 않게 한다.
        className="h-screen overflow-x-clip overflow-y-auto"
        style={{
          ...cssVars,
          color: 'var(--color-text-0)',
          backgroundColor: 'var(--color-bg-1)',
          marginLeft: canvasLeft,
          width: inset > 0 ? available : '100%',
          boxShadow: editing ? 'inset 0 0 0 3px #1c54e4' : undefined,
        } as React.CSSProperties}
      >
        <div style={scale === 1 ? undefined : { height: frameHeight * scale }}>
        <div
          ref={frameRef}
          className="@container"
          style={scale === 1 ? undefined : { width: viewportWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
        {state.status === 'loading' && <div className="min-h-screen" />}

        {state.status === 'error' && (
          <div className="min-h-screen flex items-center justify-center px-6 text-center text-[16px]" style={{ color: 'var(--color-text-2)' }}>
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
            <p className="text-[20px] font-semibold mb-1" style={{ color: 'var(--color-text-0)' }}>
              {page ? '빈 페이지입니다' : emptyTitle}
            </p>
            <p className="text-[15px]" style={{ color: 'var(--color-text-2)' }}>
              {page ? '섹션을 추가하면 이 주소에 내용이 표시됩니다.' : emptyText}
            </p>
          </div>
        ))}
        </div>
        </div>
      </div>

      {isAdmin ? (
        <OnPageToolbar editing={editing} canEdit={!!page} onToggleEditing={toggleEditing} />
      ) : (
        <VisitorLoginButton />
      )}

      {confirmExit && (
        <UnsavedChangesDialog
          onCancel={() => setConfirmExit(false)}
          onDiscard={() => {
            discardChanges()
            finishEditing()
          }}
          onSave={async () => {
            if (await saveCurrentPage()) finishEditing()
          }}
        />
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
  return <SiteView load={loadHome} autoEdit={!!getToken()} />
}

/** /page/:id 는 페이지 ID(주소)로 연다. 숫자만 있는 예전 주소는 로그인한 관리자가 번호로도 연다. */
export function PageView() {
  const { id = '' } = useParams()
  const load = useMemo(() => async () => {
    try {
      return (await fetchPublicPage(id)).page
    } catch {
      if (getToken() && /^\d+$/.test(id)) return (await fetchSavedPage(Number(id))).page
      return null
    }
  }, [id])
  return (
    <SiteView
      key={id}
      load={load}
      autoEdit={!!getToken()}
      emptyTitle="페이지를 찾을 수 없습니다"
      emptyText="주소가 바뀌었거나 삭제된 페이지입니다."
    />
  )
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
      autoEdit={!!getToken()}
      emptyTitle="페이지를 찾을 수 없습니다"
      emptyText="주소가 바뀌었거나 삭제된 페이지입니다."
    />
  )
}
