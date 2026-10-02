import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Pencil, Plus, Sparkles, FileText, Clock, Bot, Layers, Copy, Trash2,
  Briefcase, UtensilsCrossed, Building2, BookOpen, ExternalLink,
} from 'lucide-react'
import { useProjectsStore, type Project } from '@/store/projectsStore'
import { defaultConfig, useConfigStore } from '@/store/configStore'
import type { SiteConfig } from '@/blocks/types'
import { templateMeta, buildTemplate } from '@/lib/templates'
import { generateSiteConfig } from '@/lib/generate-site'
import { FileManagerPanel } from '@/editor/FileManager'
import { DashboardOverview } from './DashboardStats'
import {
  deleteServerPage, ensureServerPage, fetchAiUsage, fetchPublicHome, renameServerPage, restoreAiEdit, updatePageMeta,
  type AiUsageEntry, type SavedPage,
} from '@/lib/builderApi'
import { markCurrentSaved } from '@/editor/manualSave'
import { useEditorStore } from '@/store/editorStore'

const templateKo: Record<string, { name: string; description: string; icon: typeof Briefcase }> = {
  portfolio: { name: '포트폴리오', description: '작업물과 경력을 소개', icon: Briefcase },
  restaurant: { name: '음식점', description: '메뉴, 예약, 매장 분위기', icon: UtensilsCrossed },
  agency: { name: '회사 소개', description: '서비스, 사례, 팀 소개', icon: Building2 },
  blog: { name: '블로그', description: '글, 주제, 구독', icon: BookOpen },
}

const aiStatusKo: Record<string, string> = {
  success: '제안 완료',
  failed: '실패',
  no_key: 'AI 키 없음',
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SummaryCard({ icon: Icon, label, value, hint }: { icon: typeof FileText; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-2 text-[14px] mb-2">
        <Icon size={14} className="text-green" />
        {label}
      </div>
      <div className="text-text-0 text-[20px] font-semibold truncate">{value}</div>
      {hint && <div className="text-text-3 text-[13.5px] mt-1 truncate">{hint}</div>}
    </div>
  )
}

// 서버에서 돌려준 페이지로 목록을 갱신한다. 메인을 바꿨다면 다른 페이지는 서브가 된다.
function applyPageMeta(page: SavedPage) {
  useProjectsStore.setState((state) => ({
    projects: state.projects.map((item) => {
      if (item.serverId === page.id) return { ...item, slug: page.slug ?? undefined, isHome: page.isHome }
      return page.isHome ? { ...item, isHome: false } : item
    }),
  }))
}

/** 구분(메인/서브)과 주소 칸. 서브 페이지는 주소를 바꾸거나 메인으로 지정할 수 있다. */
function PageKindCells({ project, isHome }: { project: Project; isHome: boolean }) {
  const [editing, setEditing] = useState(false)
  const [slug, setSlug] = useState(project.slug ?? '')

  async function saveSlug() {
    setEditing(false)
    const next = slug.trim().toLowerCase()
    if (!project.serverId || !next || next === project.slug) {
      setSlug(project.slug ?? '')
      return
    }
    try {
      const result = await updatePageMeta(project.serverId, { slug: next })
      applyPageMeta(result.page)
      toast.success('주소를 바꿨습니다.')
    } catch (error) {
      setSlug(project.slug ?? '')
      toast.error(error instanceof Error ? error.message : '주소를 바꾸지 못했습니다.')
    }
  }

  async function makeHome() {
    if (!project.serverId) return
    try {
      const result = await updatePageMeta(project.serverId, { isHome: true })
      applyPageMeta(result.page)
      toast.success(`'${project.name}'을(를) 메인 페이지로 지정했습니다.`)
    } catch {
      toast.error('메인 페이지로 지정하지 못했습니다.')
    }
  }

  return (
    <>
      <td className="px-4 py-3">
        {isHome ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green text-white text-[13.5px] font-semibold">메인</span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-3 text-text-1 text-[13.5px] font-medium">서브</span>
            <button type="button" onClick={makeHome} className="text-[13.5px] text-green hover:underline">메인으로</button>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-[14.5px]">
        {isHome ? (
          <span className="inline-flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer" className="text-text-1 hover:text-green">/</a>
            {project.slug && (
              <a href={`/page/${project.slug}`} target="_blank" rel="noreferrer" className="text-text-3 hover:text-green">/page/{project.slug}</a>
            )}
          </span>
        ) : editing ? (
          <div className="flex items-center gap-0.5">
            <span className="text-text-3">/page/</span>
            <input
              autoFocus
              value={slug}
              onChange={(event) => setSlug(event.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
              onBlur={saveSlug}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveSlug()
                if (event.key === 'Escape') {
                  setSlug(project.slug ?? '')
                  setEditing(false)
                }
              }}
              placeholder="about"
              className="w-28 px-1.5 py-0.5 rounded border border-border-default bg-bg-1 text-text-0"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <a href={`/page/${project.slug ?? ''}`} target="_blank" rel="noreferrer" className="text-text-1 hover:text-green">/page/{project.slug}</a>
            <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-text-3 hover:text-green">변경</button>
          </div>
        )}
      </td>
    </>
  )
}

function PageRow({ project, isHome, onOpen }: { project: Project; isHome: boolean; onOpen: (project: Project) => void }) {
  const renameProject = useProjectsStore((s) => s.renameProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const duplicateProject = useProjectsStore((s) => s.duplicateProject)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
  }, [])

  function commitRename() {
    const trimmed = name.trim()
    setEditing(false)
    if (!trimmed || trimmed === project.name) {
      setName(project.name)
      return
    }
    renameProject(project.id, trimmed)
    if (project.serverId) {
      renameServerPage(project.serverId, trimmed).catch(() => toast.error('이름을 저장하지 못했습니다.'))
    }
  }

  function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      confirmTimer.current = setTimeout(() => setConfirming(false), 2500)
      return
    }
    if (project.serverId) {
      deleteServerPage(project.serverId).catch(() => toast.error('페이지를 삭제하지 못했습니다.'))
    }
    deleteProject(project.id)
    toast('페이지를 삭제했습니다.')
  }

  async function handleDuplicate() {
    const id = duplicateProject(project.id)
    const copy = useProjectsStore.getState().projects.find((item) => item.id === id)
    if (!id || !copy) return
    const copyName = `${project.name} 사본`
    // 복제본은 원본 서버 페이지와 연결을 끊고 새 페이지로 저장한다.
    useProjectsStore.setState((state) => ({
      projects: state.projects.map((item) => (item.id === id ? { ...item, name: copyName, serverId: undefined, slug: undefined, isHome: false } : item)),
    }))
    try {
      await ensureServerPage(id, copyName, copy.config || defaultConfig)
      toast('페이지를 복제했습니다.')
    } catch {
      toast.error('페이지를 복제하지 못했습니다.')
    }
  }

  return (
    <tr className="border-t border-border-default hover:bg-bg-2/60">
      <td className="px-4 py-3">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') {
                setName(project.name)
                setEditing(false)
              }
            }}
            className="w-full px-2 py-1 rounded-md bg-bg-2 border border-border-default text-text-0 text-[15px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="눌러서 이름 바꾸기"
            className="text-text-0 text-[15.5px] font-medium hover:text-green text-left"
          >
            {project.name}
          </button>
        )}
      </td>
      <PageKindCells project={project} isHome={isHome} />
      <td className="px-4 py-3 text-text-2 text-[14.5px] hidden md:table-cell">{project.blockCount}개</td>
      <td className="px-4 py-3 text-text-2 text-[14.5px] hidden md:table-cell">{formatDate(project.updatedAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onOpen(project)}
            className="h-7 px-2.5 rounded-md bg-green text-black text-[14px] font-semibold inline-flex items-center gap-1"
          >
            <Pencil size={12} />
            수정
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            title="복제"
            aria-label="복제"
            className="w-7 h-7 rounded-md flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="삭제"
            aria-label="삭제"
            className={`h-7 rounded-md flex items-center justify-center text-[13.5px] ${
              confirming ? 'px-2 bg-red-500/15 text-red-400' : 'w-7 text-text-2 hover:text-red-400 hover:bg-bg-3'
            }`}
          >
            {confirming ? '삭제할까요?' : <Trash2 size={13} />}
          </button>
        </div>
      </td>
    </tr>
  )
}

function NewPagePanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const addProject = useProjectsStore((s) => s.addProject)
  const [prompt, setPrompt] = useState('')
  const [pageId, setPageId] = useState('')
  const [generating, setGenerating] = useState(false)

  function readPageId() {
    const slug = pageId.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) {
      toast.error('페이지 ID는 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.')
      return null
    }
    return slug
  }

  // 페이지를 서버에 만든 뒤, 설정한 페이지 ID 주소에서 바로 수정 도구로 연다.
  async function create(name: string, config: SiteConfig) {
    const slug = readPageId()
    if (!slug) return
    const id = addProject(name)
    try {
      await ensureServerPage(id, name, config, slug)
      useProjectsStore.getState().updateProjectConfig(id, config)
      navigate(`/page/${slug}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '페이지를 만들지 못했습니다.')
    }
  }

  async function createWithAi() {
    const text = prompt.trim()
    if (!text || generating) return
    setGenerating(true)
    try {
      const { config, source } = await generateSiteConfig(text)
      if (source === 'template') toast('AI 키가 없어 비슷한 기본 틀로 만들었습니다.')
      await create(config.name || text.slice(0, 30), config)
    } catch {
      toast.error('AI로 페이지를 만들지 못했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text-0 text-[17px] font-semibold">새 페이지 만들기</h2>
        <button type="button" onClick={onClose} className="text-text-3 hover:text-text-0 text-[14px]">닫기</button>
      </div>

      <label className="block text-text-2 text-[14px] mb-1.5">페이지 ID</label>
      <input
        value={pageId}
        onChange={(event) => setPageId(event.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())}
        placeholder="예: about"
        className="w-full h-9 px-3 mb-1 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[15px] placeholder:text-text-3"
      />
      <p className="text-text-3 text-[13px] mb-5">공개 주소는 /page/{pageId || '아이디'} 입니다.</p>

      <label className="block text-text-2 text-[14px] mb-1.5">AI에게 설명해서 만들기</label>
      <div className="flex gap-2 mb-5">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') createWithAi()
          }}
          placeholder="예: 강남에 있는 치과 홈페이지, 진료 안내와 예약 문의 포함"
          className="flex-1 h-9 px-3 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[15px] placeholder:text-text-3"
        />
        <button
          type="button"
          disabled={!prompt.trim() || generating}
          onClick={createWithAi}
          className="h-9 px-4 rounded-lg bg-green text-black text-[15px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Sparkles size={14} />
          {generating ? '만드는 중...' : '만들기'}
        </button>
      </div>

      <div className="text-text-2 text-[14px] mb-2">또는 기본 틀에서 시작</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {templateMeta.map((tpl) => {
          const ko = templateKo[tpl.id]
          const Icon = ko?.icon ?? Layers
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => create(ko?.name ?? tpl.name, buildTemplate(tpl.id, ko?.name ?? tpl.name))}
              className="text-left rounded-lg p-3 bg-bg-2 border border-border-default hover:border-border-hover"
            >
              <Icon size={15} className="mb-1.5" style={{ color: tpl.accent }} />
              <div className="text-text-0 text-[14.5px] font-medium">{ko?.name ?? tpl.name}</div>
              <div className="text-text-3 text-[13px] leading-snug">{ko?.description ?? tpl.description}</div>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => create(pageId.trim() || '새 페이지', blankSite(pageId.trim() || '새 페이지'))}
          className="text-left rounded-lg p-3 bg-bg-2 border border-dashed border-border-default hover:border-border-hover"
        >
          <Plus size={15} className="mb-1.5 text-text-2" />
          <div className="text-text-0 text-[14.5px] font-medium">빈 페이지</div>
          <div className="text-text-3 text-[13px] leading-snug">처음부터 직접 만들기</div>
        </button>
      </div>
    </div>
  )
}

function blankSite(name: string): SiteConfig {
  return {
    name,
    blocks: [],
    pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: [] }],
  }
}

function MainPageSection({
  homeProject, onOpen, onCreated,
}: {
  homeProject?: Project
  onOpen: (project: Project) => void
  onCreated: (pageId: number) => void
}) {
  const [name, setName] = useState('메인 페이지')
  const [pending, setPending] = useState(false)

  async function createMain() {
    const pageName = name.trim() || '메인 페이지'
    if (pending) return
    setPending(true)
    try {
      const localId = useProjectsStore.getState().addProject(pageName)
      const config = blankSite(pageName)
      const serverId = await ensureServerPage(localId, pageName, config)
      const result = await updatePageMeta(serverId, { isHome: true })
      applyPageMeta(result.page)
      useProjectsStore.getState().updateProjectConfig(localId, config)
      onCreated(serverId)
      onOpen({ ...useProjectsStore.getState().projects.find((item) => item.id === localId)!, serverId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '메인 페이지를 만들지 못했습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="bg-bg-1 border border-border-default rounded-xl p-5">
      {homeProject && (
        <div className="flex justify-end mb-4">
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-green text-white text-[13.5px] font-semibold">게시 중</span>
        </div>
      )}

      {homeProject ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg bg-bg-2 border border-border-default px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-text-0 text-[16px] font-semibold truncate">{homeProject.name}</div>
            <div className="text-text-3 text-[14px] mt-0.5">{homeProject.blockCount}개 섹션 · /</div>
          </div>
          <div className="flex gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3.5 rounded-lg border border-border-default text-text-1 text-[15px] inline-flex items-center gap-1.5 hover:border-border-hover hover:text-text-0"
            >
              <ExternalLink size={14} />
              보기
            </a>
            <button
              type="button"
              onClick={() => onOpen(homeProject)}
              className="h-9 px-3.5 rounded-lg bg-green text-black text-[15px] font-semibold inline-flex items-center gap-1.5"
            >
              <Pencil size={14} />
              수정
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createMain()
            }}
            placeholder="메인 페이지 이름"
            className="flex-1 h-9 px-3 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[15px] placeholder:text-text-3"
          />
          <button
            type="button"
            onClick={createMain}
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-green text-black text-[15px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus size={14} />
            {pending ? '만드는 중...' : '빈 메인 페이지 만들기'}
          </button>
        </div>
      )}
    </section>
  )
}

function PageListCard({ homeId, onOpen }: { homeId: number | null; onOpen: (project: Project) => void }) {
  const projects = useProjectsStore((s) => s.projects)
  const serverProjects = projects.filter((project) => project.serverId)
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-text-0 text-[17px] font-semibold">페이지 목록</h2>
        <span className="text-text-3 text-[14px]">메인 페이지는 홈페이지 첫 화면(/)에, 서브 페이지는 /page/페이지 ID 에 공개됩니다</span>
      </div>
      {serverProjects.length === 0 ? (
        <div className="px-4 py-10 text-center text-text-2 text-[15px] border-t border-border-default">
          아직 페이지가 없습니다. 새 페이지 만들기로 시작하세요.
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-text-3 text-[13.5px]">
              <th className="px-4 py-2 font-medium">이름</th>
              <th className="px-4 py-2 font-medium">구분</th>
              <th className="px-4 py-2 font-medium">주소</th>
              <th className="px-4 py-2 font-medium hidden md:table-cell">섹션</th>
              <th className="px-4 py-2 font-medium hidden md:table-cell">마지막 수정</th>
              <th className="px-4 py-2 font-medium text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {serverProjects.map((project) => (
              <PageRow key={project.id} project={project} isHome={project.isHome ?? project.serverId === homeId} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AiUsageCard({ usage, limit, onChange }: { usage: AiUsageEntry[]; limit?: number; onChange: () => void }) {
  const [pendingId, setPendingId] = useState<number | null>(null)

  async function undo(item: AiUsageEntry) {
    const ok = window.confirm('이 AI 수정을 취소하고 요청 전 페이지로 되돌립니다. 그 뒤에 저장한 변경도 함께 사라집니다.')
    if (!ok) return
    setPendingId(item.id)
    try {
      const data = await restoreAiEdit(item.id)
      const project = useProjectsStore.getState().projects.find((entry) => entry.serverId === data.page.id)
      if (project) {
        useProjectsStore.getState().updateProjectConfig(project.id, data.page.config)
        if (useEditorStore.getState().activeProjectId === project.id) {
          useConfigStore.getState().setConfig(data.page.config)
          markCurrentSaved()
        }
      }
      onChange()
      toast.success('AI 수정 전으로 되돌렸습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI 수정을 되돌리지 못했습니다.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="bg-bg-1 border border-border-default rounded-xl">
      <div className="px-4 py-3">
        <h2 className="text-text-0 text-[17px] font-semibold">{limit ? '최근 AI 수정 요청' : 'AI 수정 기록'}</h2>
      </div>
      {usage.length === 0 ? (
        <div className="px-4 py-6 text-text-3 text-[14.5px] border-t border-border-default">아직 AI로 수정한 기록이 없습니다.</div>
      ) : (
        <ul>
          {usage.slice(0, limit ?? usage.length).map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border-default">
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[13px] ${item.status === 'success' ? 'bg-green/15 text-green' : 'bg-bg-3 text-text-2'}`}>
                {aiStatusKo[item.status] ?? item.status}
              </span>
              <span className="flex-1 text-text-1 text-[15px] truncate">{item.prompt}</span>
              {item.restorable && (
                <button
                  type="button"
                  onClick={() => undo(item)}
                  disabled={pendingId === item.id}
                  className="shrink-0 h-7 px-2.5 rounded-md border border-border-default text-text-1 text-[14px] hover:border-border-hover hover:text-text-0 disabled:opacity-40"
                >
                  {pendingId === item.id ? '되돌리는 중' : '이 수정 취소'}
                </button>
              )}
              <span className="shrink-0 text-text-3 text-[13.5px]">{formatDate(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const projects = useProjectsStore((s) => s.projects)
  const [homeId, setHomeId] = useState<number | null>(null)
  const [usage, setUsage] = useState<AiUsageEntry[]>([])

  useEffect(() => {
    fetchPublicHome().then((data) => setHomeId(data.page?.id ?? null)).catch(() => {})
    fetchAiUsage().then((data) => setUsage(data.usage)).catch(() => {})
  }, [])

  const serverProjects = projects.filter((project) => project.serverId)
  const lastUpdated = serverProjects[0]?.updatedAt
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const aiThisMonth = usage.filter((item) => String(item.createdAt).startsWith(monthPrefix)).length

  function openPage(project: Project) {
    const address = project.slug || project.serverId
    if (address) navigate(`/page/${address}`)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-text-0 text-[26px] font-bold mb-1">관리자 대시보드</h1>
          <p className="text-text-2 text-[15.5px]">홈페이지를 수정하고 페이지를 관리합니다.</p>
        </div>

        {/* 방문자, 페이지, 용량, 보안, 메모 */}
        <DashboardOverview />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SummaryCard icon={Clock} label="마지막 수정" value={lastUpdated ? formatDate(lastUpdated) : '-'} />
          <SummaryCard icon={Bot} label="이번 달 AI 수정 요청" value={`${aiThisMonth}회`} />
        </div>

        <PageListCard homeId={homeId} onOpen={openPage} />
      </div>
    </div>
  )
}

// 좌측 메뉴의 공통 화면 틀: 제목, 설명, 오른쪽 버튼
function AdminScreen({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-text-0 text-[26px] font-bold mb-1">{title}</h1>
          <p className="text-text-2 text-[15.5px]">{description}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MainScreen() {
  const navigate = useNavigate()
  const projects = useProjectsStore((s) => s.projects)
  const [homeId, setHomeId] = useState<number | null>(null)

  useEffect(() => {
    fetchPublicHome().then((data) => setHomeId(data.page?.id ?? null)).catch(() => {})
  }, [])

  const homeProject = projects.find((project) => project.serverId && project.serverId === homeId)

  function openPage(project: Project) {
    const address = project.slug || project.serverId
    if (address) navigate(`/page/${address}`)
  }

  return (
    <AdminScreen title="메인" description="방문자가 처음 보는 홈 화면을 만듭니다. 주소는 / 입니다.">
      <MainPageSection homeProject={homeProject} onOpen={openPage} onCreated={setHomeId} />
    </AdminScreen>
  )
}

export function PagesScreen() {
  const navigate = useNavigate()
  const [homeId, setHomeId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    fetchPublicHome().then((data) => setHomeId(data.page?.id ?? null)).catch(() => {})
  }, [])

  function openPage(project: Project) {
    const address = project.slug || project.serverId
    if (address) navigate(`/page/${address}`)
  }

  return (
    <AdminScreen title="페이지 관리" description="페이지를 만들고, 이름을 바꾸고, 복제하거나 삭제합니다.">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="h-9 px-3.5 rounded-lg bg-green text-black text-[15px] font-semibold inline-flex items-center gap-1.5"
        >
          <Plus size={14} />
          새 페이지 만들기
        </button>
      </div>
      {showNew && <NewPagePanel onClose={() => setShowNew(false)} />}
      <PageListCard homeId={homeId} onOpen={openPage} />
    </AdminScreen>
  )
}

export function AiHistoryScreen() {
  const [usage, setUsage] = useState<AiUsageEntry[]>([])

  useEffect(() => {
    fetchAiUsage().then((data) => setUsage(data.usage)).catch(() => {})
  }, [])

  return (
    <AdminScreen title="AI 수정 기록" description="AI에게 요청한 수정 내용을 최근 50개까지 보여 줍니다.">
      <AiUsageCard usage={usage} onChange={() => fetchAiUsage().then((data) => setUsage(data.usage)).catch(() => {})} />
    </AdminScreen>
  )
}

export function FilesScreen() {
  return (
    <AdminScreen title="파일 관리자" description="홈페이지에 쓸 이미지를 올리고 관리합니다. 페이지 수정 중 이미지를 더블클릭해도 여기서 고를 수 있습니다.">
      <div className="bg-bg-1 border border-border-default rounded-xl p-5">
        <FileManagerPanel />
      </div>
    </AdminScreen>
  )
}
