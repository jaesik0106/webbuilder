import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Globe, MousePointerClick, Pencil, Plus, Sparkles, FileText, Clock, Bot, Layers, Copy, Trash2,
  Briefcase, UtensilsCrossed, Building2, BookOpen, ExternalLink,
} from 'lucide-react'
import { useProjectsStore, type Project } from '@/store/projectsStore'
import { useConfigStore, defaultConfig } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { templateMeta, buildTemplate } from '@/lib/templates'
import {
  deleteServerPage, ensureServerPage, fetchAiUsage, fetchPublicHome, renameServerPage, type AiUsageEntry,
} from '@/lib/builderApi'

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

function SummaryCard({ icon: Icon, label, value, hint }: { icon: typeof Globe; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-4">
      <div className="flex items-center gap-2 text-text-2 text-[12px] mb-2">
        <Icon size={14} className="text-green" />
        {label}
      </div>
      <div className="text-text-0 text-[18px] font-semibold truncate">{value}</div>
      {hint && <div className="text-text-3 text-[11.5px] mt-1 truncate">{hint}</div>}
    </div>
  )
}

function QuickAction({
  icon: Icon, title, description, onClick, primary,
}: { icon: typeof Globe; title: string; description: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl p-4 border transition-all active:scale-[0.98] ${
        primary
          ? 'bg-green/10 border-green/40 hover:bg-green/15'
          : 'bg-bg-1 border-border-default hover:border-border-hover hover:bg-bg-2'
      }`}
    >
      <Icon size={18} className={primary ? 'text-green mb-2' : 'text-text-1 mb-2'} />
      <div className="text-text-0 text-[14px] font-semibold mb-0.5">{title}</div>
      <div className="text-text-2 text-[12px] leading-snug">{description}</div>
    </button>
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
      projects: state.projects.map((item) => (item.id === id ? { ...item, name: copyName, serverId: undefined } : item)),
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
            className="w-full px-2 py-1 rounded-md bg-bg-2 border border-border-default text-text-0 text-[13px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="눌러서 이름 바꾸기"
            className="text-text-0 text-[13.5px] font-medium hover:text-green text-left"
          >
            {project.name}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        {isHome ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green/15 text-green text-[11.5px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            홈페이지에 공개 중
          </span>
        ) : (
          <span className="text-text-3 text-[12px]">보관</span>
        )}
      </td>
      <td className="px-4 py-3 text-text-2 text-[12.5px] hidden md:table-cell">{project.blockCount}개</td>
      <td className="px-4 py-3 text-text-2 text-[12.5px] hidden md:table-cell">{formatDate(project.updatedAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onOpen(project)}
            className="h-7 px-2.5 rounded-md bg-green text-black text-[12px] font-semibold inline-flex items-center gap-1"
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
            className={`h-7 rounded-md flex items-center justify-center text-[11.5px] ${
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
  const setConfig = useConfigStore((s) => s.setConfig)
  const setActiveProject = useEditorStore((s) => s.setActiveProject)
  const setGenerating = useEditorStore((s) => s.setGenerating)
  const [prompt, setPrompt] = useState('')

  async function create(name: string, config = defaultConfig, generatePrompt?: string) {
    const id = addProject(name)
    setActiveProject(id)
    setConfig(config)
    try {
      await ensureServerPage(id, name, config)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '페이지를 만들지 못했습니다.')
      return
    }
    if (generatePrompt) setGenerating(generatePrompt)
    navigate('/editor')
  }

  return (
    <div className="bg-bg-1 border border-border-default rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text-0 text-[15px] font-semibold">새 페이지 만들기</h2>
        <button type="button" onClick={onClose} className="text-text-3 hover:text-text-0 text-[12px]">닫기</button>
      </div>

      <label className="block text-text-2 text-[12px] mb-1.5">AI에게 설명해서 만들기</label>
      <div className="flex gap-2 mb-5">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && prompt.trim()) create(prompt.trim().slice(0, 30), defaultConfig, prompt.trim())
          }}
          placeholder="예: 강남에 있는 치과 홈페이지, 진료 안내와 예약 문의 포함"
          className="flex-1 h-9 px-3 rounded-lg bg-bg-2 border border-border-default text-text-0 text-[13px] placeholder:text-text-3"
        />
        <button
          type="button"
          disabled={!prompt.trim()}
          onClick={() => create(prompt.trim().slice(0, 30), defaultConfig, prompt.trim())}
          className="h-9 px-4 rounded-lg bg-green text-black text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Sparkles size={14} />
          만들기
        </button>
      </div>

      <div className="text-text-2 text-[12px] mb-2">또는 기본 틀에서 시작</div>
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
              <div className="text-text-0 text-[12.5px] font-medium">{ko?.name ?? tpl.name}</div>
              <div className="text-text-3 text-[11px] leading-snug">{ko?.description ?? tpl.description}</div>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => create('새 페이지')}
          className="text-left rounded-lg p-3 bg-bg-2 border border-dashed border-border-default hover:border-border-hover"
        >
          <Plus size={15} className="mb-1.5 text-text-2" />
          <div className="text-text-0 text-[12.5px] font-medium">빈 페이지</div>
          <div className="text-text-3 text-[11px] leading-snug">처음부터 직접 만들기</div>
        </button>
      </div>
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const projects = useProjectsStore((s) => s.projects)
  const setConfig = useConfigStore((s) => s.setConfig)
  const setActiveProject = useEditorStore((s) => s.setActiveProject)
  const [homeId, setHomeId] = useState<number | null>(null)
  const [usage, setUsage] = useState<AiUsageEntry[]>([])
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    fetchPublicHome().then((data) => setHomeId(data.page?.id ?? null)).catch(() => {})
    fetchAiUsage().then((data) => setUsage(data.usage)).catch(() => {})
  }, [])

  const serverProjects = projects.filter((project) => project.serverId)
  const homeProject = serverProjects.find((project) => project.serverId === homeId)
  const lastUpdated = serverProjects[0]?.updatedAt
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const aiThisMonth = usage.filter((item) => String(item.createdAt).startsWith(monthPrefix)).length

  function openInEditor(project: Project) {
    setActiveProject(project.id)
    setConfig(project.config || defaultConfig)
    navigate('/editor')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-text-0 text-[24px] font-bold mb-1">관리자 대시보드</h1>
            <p className="text-text-2 text-[13.5px]">홈페이지를 수정하고 페이지를 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3.5 rounded-lg border border-border-default text-text-1 text-[13px] inline-flex items-center gap-1.5 hover:border-border-hover hover:text-text-0"
            >
              <ExternalLink size={14} />
              홈페이지 보기
            </a>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="h-9 px-3.5 rounded-lg bg-green text-black text-[13px] font-semibold inline-flex items-center gap-1.5"
            >
              <MousePointerClick size={14} />
              홈페이지에서 바로 수정
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={Globe} label="공개 중인 홈페이지" value={homeProject?.name ?? '없음'} hint={homeProject ? `${homeProject.blockCount}개 섹션` : '페이지를 만들면 공개됩니다'} />
          <SummaryCard icon={FileText} label="전체 페이지" value={`${serverProjects.length}개`} />
          <SummaryCard icon={Clock} label="마지막 수정" value={lastUpdated ? formatDate(lastUpdated) : '-'} />
          <SummaryCard icon={Bot} label="이번 달 AI 수정 요청" value={`${aiThisMonth}회`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            primary
            icon={MousePointerClick}
            title="홈페이지에서 바로 수정"
            description="실제 화면에서 글자를 눌러 고칩니다."
            onClick={() => navigate('/')}
          />
          <QuickAction
            icon={Pencil}
            title="에디터로 자세히 수정"
            description="섹션 추가, 순서 변경, 디자인을 바꿉니다."
            onClick={() => (homeProject ? openInEditor(homeProject) : setShowNew(true))}
          />
          <QuickAction
            icon={Plus}
            title="새 페이지 만들기"
            description="AI 설명이나 기본 틀로 시작합니다."
            onClick={() => setShowNew(true)}
          />
        </div>

        {showNew && <NewPagePanel onClose={() => setShowNew(false)} />}

        <div className="bg-bg-1 border border-border-default rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-text-0 text-[15px] font-semibold">페이지 목록</h2>
            <span className="text-text-3 text-[12px]">가장 최근에 수정한 페이지가 홈페이지에 공개됩니다</span>
          </div>
          {serverProjects.length === 0 ? (
            <div className="px-4 py-10 text-center text-text-2 text-[13px] border-t border-border-default">
              아직 페이지가 없습니다. 새 페이지 만들기로 시작하세요.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-3 text-[11.5px]">
                  <th className="px-4 py-2 font-medium">이름</th>
                  <th className="px-4 py-2 font-medium">상태</th>
                  <th className="px-4 py-2 font-medium hidden md:table-cell">섹션</th>
                  <th className="px-4 py-2 font-medium hidden md:table-cell">마지막 수정</th>
                  <th className="px-4 py-2 font-medium text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {serverProjects.map((project) => (
                  <PageRow key={project.id} project={project} isHome={project.serverId === homeId} onOpen={openInEditor} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-bg-1 border border-border-default rounded-xl">
          <div className="px-4 py-3">
            <h2 className="text-text-0 text-[15px] font-semibold">최근 AI 수정 요청</h2>
          </div>
          {usage.length === 0 ? (
            <div className="px-4 py-6 text-text-3 text-[12.5px] border-t border-border-default">아직 AI로 수정한 기록이 없습니다.</div>
          ) : (
            <ul>
              {usage.slice(0, 5).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border-default">
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] ${item.status === 'success' ? 'bg-green/15 text-green' : 'bg-bg-3 text-text-2'}`}>
                    {aiStatusKo[item.status] ?? item.status}
                  </span>
                  <span className="flex-1 text-text-1 text-[13px] truncate">{item.prompt}</span>
                  <span className="shrink-0 text-text-3 text-[11.5px]">{formatDate(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
