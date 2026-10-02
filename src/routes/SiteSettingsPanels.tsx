import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ExternalLink, FolderOpen, History, Lock, Save } from 'lucide-react'
import {
  apiUrl, fetchSettingsHistory, fetchSiteSettings, saveSiteSettings, type SettingsHistoryEntry, type SiteSettings,
} from '@/lib/builderApi'
import { FileManagerModal } from '@/editor/FileManager'
import { useIsDeveloper } from '@/store/authStore'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'

/**
 * 서버에 저장하는 사이트 설정 화면 (10PAGE 의 사이트 설정 / CSS 스타일시트 참고).
 * 탭마다 [저장] 버튼으로 저장한다. 코드 칸(추가 CSS, 스크립트, 추가 메타태그)은 제작자만 고칠 수 있다.
 */

export type SitePanel = 'basic' | 'search' | 'scripts' | 'css'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[15px] outline-none focus:border-green placeholder:text-text-3 disabled:opacity-60'
const codeClass = `${inputClass} font-mono text-[13px] leading-relaxed resize-y`

type Draft = { values: SiteSettings; set: (key: string, value: string) => void; codeLocked: boolean }

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[13.5px] text-text-1 mb-1.5 font-semibold">{label}</label>
      {children}
      {hint && <p className="text-[12.5px] text-text-3 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

function Text({ draft, k, placeholder }: { draft: Draft; k: string; placeholder?: string }) {
  return <input type="text" value={draft.values[k] ?? ''} placeholder={placeholder} onChange={(e) => draft.set(k, e.target.value)} className={inputClass} />
}

function Area({ draft, k, rows = 3, code, placeholder }: { draft: Draft; k: string; rows?: number; code?: boolean; placeholder?: string }) {
  const locked = code && draft.codeLocked
  return (
    <textarea
      value={draft.values[k] ?? ''}
      rows={rows}
      spellCheck={!code}
      disabled={locked}
      placeholder={placeholder}
      onChange={(e) => draft.set(k, e.target.value)}
      onKeyDown={(e) => {
        // 코드 칸에서 Tab 은 들여쓰기
        if (!code || e.key !== 'Tab') return
        e.preventDefault()
        const el = e.currentTarget
        const { selectionStart: start, selectionEnd: end, value } = el
        draft.set(k, `${value.slice(0, start)}  ${value.slice(end)}`)
        requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
      }}
      className={code ? codeClass : `${inputClass} resize-y`}
    />
  )
}

/** 이미지 주소 + 파일관리자에서 고르기 + 미리보기 */
function ImageField({ draft, k, folder = 'logo' }: { draft: Draft; k: string; folder?: string }) {
  const [picking, setPicking] = useState(false)
  const value = draft.values[k] ?? ''
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-12 shrink-0 rounded-md border border-border-default bg-bg-2 flex items-center justify-center overflow-hidden">
        {value ? <img src={value} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[11px] text-text-3">없음</span>}
      </div>
      <input type="text" value={value} placeholder="이미지 주소" onChange={(e) => draft.set(k, e.target.value)} className={inputClass} />
      <button type="button" onClick={() => setPicking(true)} className="h-10 px-3 shrink-0 rounded-lg border border-border-default text-[14px] hover:border-green hover:text-green inline-flex items-center gap-1.5">
        <FolderOpen size={15} />
        파일 선택
      </button>
      {picking && (
        <FileManagerModal
          initialFolder={folder}
          onClose={() => setPicking(false)}
          onPick={(url) => {
            draft.set(k, url)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

/** 코드 칸의 최근 10건 변경 이력. 고르면 그 내용을 칸에 불러오고, 저장해야 반영된다. */
function HistoryPicker({ draft, k }: { draft: Draft; k: string }) {
  const [entries, setEntries] = useState<SettingsHistoryEntry[] | null>(null)
  if (draft.codeLocked) return null
  return (
    <div className="mt-1.5">
      {entries === null ? (
        <button
          type="button"
          onClick={() => fetchSettingsHistory(k).then((data) => setEntries(data.history)).catch((error) => toast.error(error.message))}
          className="text-[12.5px] text-text-2 hover:text-green inline-flex items-center gap-1"
        >
          <History size={13} />
          변경 이력 (최근 10건)
        </button>
      ) : entries.length === 0 ? (
        <span className="text-[12.5px] text-text-3">이전에 저장한 내용이 없습니다.</span>
      ) : (
        <select
          defaultValue=""
          onChange={(e) => {
            const entry = entries.find((item) => String(item.id) === e.target.value)
            if (entry) {
              draft.set(k, entry.value)
              toast('이전 내용을 불러왔습니다. 저장하면 반영됩니다.')
            }
          }}
          className="h-8 px-2 rounded-md border border-border-default bg-bg-1 text-[12.5px] cursor-pointer"
        >
          <option value="" disabled>이전 내용 불러오기</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {new Date(entry.createdAt).toLocaleString('ko-KR')} {entry.email && `· ${entry.email}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function CodeLockNotice({ draft }: { draft: Draft }) {
  if (!draft.codeLocked) return null
  return (
    <div className="mb-5 px-3 py-2.5 rounded-lg bg-bg-2 border border-border-default text-[13px] text-text-2 flex items-center gap-2">
      <Lock size={14} />
      코드 칸은 제작자 계정만 고칠 수 있습니다. 바꿔야 하면 제작사에 요청해 주세요.
    </div>
  )
}

function BasicPanel({ draft }: { draft: Draft }) {
  const logoType = draft.values.logoType || 'image'
  return (
    <>
      <Field label="사이트 제목" hint="브라우저 탭, 검색 결과, 공유할 때 보이는 이름입니다.">
        <Text draft={draft} k="siteTitle" placeholder="예: 한국문화예술교육진흥원" />
      </Field>
      <Field label="제목 연결 문자" hint={'서브 페이지 제목은 "페이지 이름 + 연결 문자 + 사이트 제목"으로 보입니다. 비우면 " | "'}>
        <Text draft={draft} k="titleSeparator" placeholder=" | " />
      </Field>
      <Field label="대표 주소 (URL)" hint="검색엔진이 대표 주소로 인식합니다. 임시 도메인은 넣지 마세요.">
        <Text draft={draft} k="siteUrl" placeholder="https://www.example.com" />
      </Field>
      <Field label="사이트 소개" hint="검색 결과와 공유 미리보기에 보이는 설명입니다. (meta description)">
        <Area draft={draft} k="siteDescription" />
      </Field>
      <Field label="로고 종류" hint="상단 메뉴 블록에 로고 이미지를 따로 넣지 않았으면 여기 로고 이미지를 씁니다.">
        <select value={logoType} onChange={(e) => draft.set('logoType', e.target.value)} className={`${inputClass} cursor-pointer`}>
          <option value="image">이미지</option>
          <option value="text">텍스트</option>
          <option value="both">이미지 + 텍스트</option>
        </select>
      </Field>
      {logoType !== 'image' && (
        <Field label="텍스트 로고">
          <Text draft={draft} k="logoText" />
        </Field>
      )}
      {logoType !== 'text' && (
        <Field label="로고 이미지">
          <ImageField draft={draft} k="logoImage" />
        </Field>
      )}
      <Field label="파비콘" hint="브라우저 탭 왼쪽 아이콘입니다. 1:1 비율의 png 또는 ico 를 권장합니다.">
        <ImageField draft={draft} k="favicon" />
      </Field>
      <Field label="공유 이미지 (오픈그래프)" hint="카카오톡, 페이스북 등에 주소를 공유할 때 보이는 이미지입니다. 1200×630 (약 2:1) 권장.">
        <ImageField draft={draft} k="ogImage" folder="main" />
      </Field>
    </>
  )
}

function SearchPanel({ draft }: { draft: Draft }) {
  return (
    <>
      <Field label="검색 키워드" hint="쉼표로 구분합니다. 검색 순위에는 거의 영향이 없습니다. (meta keywords)">
        <Text draft={draft} k="keywords" placeholder="예: 문화예술, 교육, 지원사업" />
      </Field>
      <Field label="네이버 웹마스터 소유확인" hint={'네이버 서치어드바이저의 "HTML 태그" 방식에서 content="…" 안의 값만 넣습니다.'}>
        <Text draft={draft} k="naverVerification" />
      </Field>
      <Field label="구글 서치 콘솔 소유확인" hint={'구글 서치 콘솔의 "HTML 태그" 방식에서 content="…" 안의 값만 넣습니다.'}>
        <Text draft={draft} k="googleVerification" />
      </Field>
      <CodeLockNotice draft={draft} />
      <Field label="추가 메타태그" hint="<meta>, <link> 태그만 적용됩니다. 그 밖의 태그는 무시합니다.">
        <Area draft={draft} k="extraMeta" rows={4} code placeholder={'<meta name="author" content="…">'} />
        <HistoryPicker draft={draft} k="extraMeta" />
      </Field>
      <Field
        label="로봇 수집 설정 (robots.txt)"
        hint={
          <>
            비우면 모든 검색엔진의 수집을 허용합니다. 사이트맵은 페이지 목록으로 자동으로 만들어집니다:{' '}
            <a href={apiUrl('/api/public/sitemap.xml')} target="_blank" rel="noreferrer" className="text-green inline-flex items-center gap-0.5">
              sitemap.xml 보기 <ExternalLink size={11} />
            </a>
          </>
        }
      >
        <Area draft={draft} k="robots" rows={5} code placeholder={'User-agent: *\nAllow: /'} />
        <HistoryPicker draft={draft} k="robots" />
      </Field>
    </>
  )
}

const SCRIPT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'headTop', label: 'HEAD 상단', hint: '<head> 의 기본 태그 바로 다음. 구글 태그 매니저(GTM) 머리 코드 등' },
  { key: 'headBottom', label: 'HEAD 하단', hint: '</head> 닫는 태그 바로 앞. 구글 애널리틱스(GA) 코드 등' },
  { key: 'bodyTop', label: 'BODY 상단', hint: '<body> 여는 태그 바로 다음. GTM 의 noscript 코드 등' },
  { key: 'bodyBottom', label: 'BODY 하단', hint: '</body> 닫는 태그 바로 앞. 채팅 상담, 전환 추적 코드 등' },
]

function ScriptsPanel({ draft }: { draft: Draft }) {
  return (
    <>
      <p className="text-[13.5px] text-text-2 mb-4 leading-relaxed">
        방문자 화면에만 넣고, 페이지 수정 중에는 실행하지 않습니다. 잘못된 스크립트는 사이트를 멈추게 할 수 있으니 받은 코드를 그대로 붙여 넣어 주세요.
      </p>
      <CodeLockNotice draft={draft} />
      {SCRIPT_FIELDS.map(({ key, label, hint }) => (
        <Field key={key} label={label} hint={hint}>
          <Area draft={draft} k={key} rows={5} code />
          <HistoryPicker draft={draft} k={key} />
        </Field>
      ))}
    </>
  )
}

function CssPanel({ draft }: { draft: Draft }) {
  return (
    <>
      <p className="text-[13.5px] text-text-2 mb-4 leading-relaxed">
        모든 페이지에 적용하는 CSS 입니다. 페이지 수정 화면에도 적용되어 보이는 그대로 확인할 수 있습니다. 색, 글꼴, 간격 같은 값은 되도록 디자인 패널과 요소 속성으로 정하세요.
      </p>
      <CodeLockNotice draft={draft} />
      <Field label="추가 CSS">
        <Area draft={draft} k="customCss" rows={22} code placeholder={'.my-class {\n  color: #1c54e4;\n}'} />
        <HistoryPicker draft={draft} k="customCss" />
      </Field>
    </>
  )
}

export const SITE_PANEL_TITLES: Record<SitePanel, string> = {
  basic: '기본 정보',
  search: '검색 설정',
  scripts: '스크립트 추가',
  css: '추가 CSS',
}

export function SiteSettingsPanel({ panel }: { panel: SitePanel }) {
  const isDeveloper = useIsDeveloper()
  const [saved, setSaved] = useState<SiteSettings | null>(null)
  const [values, setValues] = useState<SiteSettings>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSiteSettings()
      .then((data) => {
        setSaved(data.settings)
        setValues(data.settings)
      })
      .catch((error) => toast.error(error.message))
  }, [])

  const dirty = !!saved && Object.keys(values).some((key) => (values[key] ?? '') !== (saved[key] ?? ''))
  const draft: Draft = { values, set: (key, value) => setValues((prev) => ({ ...prev, [key]: value })), codeLocked: !isDeveloper }

  async function save() {
    setBusy(true)
    try {
      // 제작자가 아니면 코드 칸은 보내지 않는다 (서버도 막는다).
      const changes = Object.fromEntries(Object.entries(values).filter(([key]) => isDeveloper || !CODE_KEYS.includes(key)))
      const data = await saveSiteSettings(changes)
      setSaved(data.settings)
      setValues(data.settings)
      const { adminMemo: _memo, robots: _robots, ...publicSettings } = data.settings
      useSiteSettingsStore.getState().set(publicSettings)
      toast.success('저장했습니다.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Ctrl+S 로 저장
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (dirty && !busy) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!saved) return <div className="text-text-3 text-[14px]">불러오는 중…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-lg font-semibold">{SITE_PANEL_TITLES[panel]}</h2>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="h-9 px-4 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Save size={15} />
          {dirty ? '저장 (Ctrl+S)' : '저장됨'}
        </button>
      </div>
      {panel === 'basic' && <BasicPanel draft={draft} />}
      {panel === 'search' && <SearchPanel draft={draft} />}
      {panel === 'scripts' && <ScriptsPanel draft={draft} />}
      {panel === 'css' && <CssPanel draft={draft} />}
    </div>
  )
}

const CODE_KEYS = ['customCss', 'headTop', 'headBottom', 'bodyTop', 'bodyBottom', 'extraMeta']
