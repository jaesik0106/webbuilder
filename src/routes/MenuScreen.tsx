import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CornerDownRight, Eye, EyeOff, ListTree, Plus, Save, Trash2, X, Zap,
} from 'lucide-react'
import { fetchSiteSettings, listSavedPages, saveSiteSettings, type SavedPage } from '@/lib/builderApi'
import { MENU_MAX_DEPTH, menuDepth, newMenuItem, parseMenu, type MenuItem } from '@/lib/site-menu'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'

/**
 * 메뉴 관리 (10PAGE 메뉴 관리 참고). 홈페이지 상단 메뉴 블록에 나오는 메뉴를 최대 4단계로 만든다.
 * - 빠른 생성: 메인 메뉴 이름 + 하위 메뉴 이름(엔터로 추가)을 한 번에
 * - 순서: ↑ ↓, 단계: ← (한 단계 위로) → (바로 위 메뉴의 하위로)
 * - 링크: 페이지 고르기 또는 주소 직접 입력, 새 창 여부, 숨기기
 * 하위 메뉴가 있는 메뉴는 누르면 하위 메뉴를 펼치고, 그 메뉴의 링크는 쓰지 않는다.
 */

const inputClass = 'h-9 px-2.5 rounded-md border border-border-default bg-bg-1 text-[14px] outline-none focus:border-green'

type Path = number[]

function getList(items: MenuItem[], parentPath: Path): MenuItem[] {
  return parentPath.reduce((list, index) => list[index].children, items)
}

/** 트리를 바꿀 때는 깊은 복사본을 고친다. */
function edit(items: MenuItem[], fn: (copy: MenuItem[]) => void): MenuItem[] {
  const copy = structuredClone(items)
  fn(copy)
  return copy
}

function QuickCreate({ onCreate }: { onCreate: (item: MenuItem) => void }) {
  const [main, setMain] = useState('')
  const [subs, setSubs] = useState<string[]>([])
  const [sub, setSub] = useState('')

  function create() {
    if (!main.trim()) return toast.error('메인 메뉴 이름을 넣어 주세요.')
    const item = newMenuItem(main.trim())
    item.children = [...subs, sub].map((name) => name.trim()).filter(Boolean).map((name) => newMenuItem(name))
    onCreate(item)
    setMain('')
    setSubs([])
    setSub('')
  }

  return (
    <div className="p-4 rounded-lg border border-border-default bg-bg-1">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold mb-3"><Zap size={15} className="text-green" />빠른 메뉴 생성</div>
      <div className="flex flex-wrap items-start gap-2">
        <input value={main} onChange={(e) => setMain(e.target.value)} placeholder="메인 메뉴 이름" className={`${inputClass} w-44`} />
        <div className="flex-1 min-w-[220px]">
          <div className={`${inputClass} h-auto min-h-9 py-1 flex flex-wrap items-center gap-1`}>
            {subs.map((name, i) => (
              <span key={i} className="h-6 pl-2 pr-1 rounded bg-bg-3 text-[13px] inline-flex items-center gap-0.5">
                {name}
                <button type="button" aria-label={`${name} 빼기`} onClick={() => setSubs(subs.filter((_, j) => j !== i))} className="w-4 h-4 flex items-center justify-center text-text-3 hover:text-red-500">
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (sub.trim()) setSubs([...subs, sub.trim()])
                  setSub('')
                }
                if (e.key === 'Backspace' && !sub && subs.length) setSubs(subs.slice(0, -1))
              }}
              placeholder={subs.length ? '' : '하위 메뉴 이름을 입력하고 엔터'}
              className="flex-1 min-w-[120px] h-7 bg-transparent outline-none text-[14px]"
            />
          </div>
        </div>
        <button type="button" onClick={create} className="h-9 px-4 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5">
          <Plus size={15} />
          생성
        </button>
      </div>
    </div>
  )
}

function LinkInput({ item, pages, onChange }: { item: MenuItem; pages: SavedPage[]; onChange: (href: string) => void }) {
  const options = pages.map((page) => ({ href: page.isHome ? '/' : `/${page.slug}`, label: `${page.name}${page.isHome ? ' (메인)' : ''}` }))
  const known = options.some((option) => option.href === item.href)
  const [custom, setCustom] = useState(!known && item.href !== '#')
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
      <select
        value={custom ? '__custom__' : known ? item.href : '#'}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(e.target.value)
        }}
        className={`${inputClass} w-40 cursor-pointer`}
      >
        <option value="#">링크 없음</option>
        {options.map((option) => <option key={option.href} value={option.href}>{option.label}</option>)}
        <option value="__custom__">주소 직접 입력</option>
      </select>
      {custom && <input value={item.href} onChange={(e) => onChange(e.target.value)} placeholder="https:// 또는 /about" className={`${inputClass} flex-1 min-w-0`} />}
    </div>
  )
}

function MenuRow({
  item, path, depth, siblings, pages, onChange,
}: {
  item: MenuItem; path: Path; depth: number; siblings: number; pages: SavedPage[]
  onChange: (fn: (copy: MenuItem[]) => void) => void
}) {
  const index = path[path.length - 1]
  const parentPath = path.slice(0, -1)
  const update = (changes: Partial<MenuItem>) => onChange((copy) => Object.assign(getList(copy, parentPath)[index], changes))
  const hasChildren = item.children.length > 0
  const canIndent = index > 0 && depth + menuDepth(item) - 1 < MENU_MAX_DEPTH

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border-subtle first:border-t-0 ${item.hidden ? 'opacity-50' : ''}`} style={{ paddingLeft: 12 + (depth - 1) * 28 }}>
        {depth > 1 ? <CornerDownRight size={14} className="text-text-3 shrink-0" /> : <span className="px-1.5 h-5 rounded bg-green-glow2 text-green text-[11px] font-semibold flex items-center shrink-0">메인</span>}
        <input value={item.label} onChange={(e) => update({ label: e.target.value })} placeholder="메뉴 이름" className={`${inputClass} w-40`} />
        {hasChildren ? (
          <span className="flex-1 min-w-[200px] text-[12.5px] text-text-3">하위 메뉴가 있어 링크 대신 하위 메뉴를 펼칩니다</span>
        ) : (
          <LinkInput item={item} pages={pages} onChange={(href) => update({ href })} />
        )}
        <select value={item.target} onChange={(e) => update({ target: e.target.value as MenuItem['target'] })} disabled={hasChildren} className={`${inputClass} w-28 cursor-pointer disabled:opacity-40`}>
          <option value="_self">현재 창</option>
          <option value="_blank">새 창</option>
        </select>
        <div className="flex items-center">
          <IconButton label={item.hidden ? '보이기' : '숨기기'} onClick={() => update({ hidden: !item.hidden || undefined })}>
            {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconButton>
          <IconButton label="위로" disabled={index === 0} onClick={() => onChange((copy) => {
            const list = getList(copy, parentPath)
            ;[list[index - 1], list[index]] = [list[index], list[index - 1]]
          })}><ArrowUp size={14} /></IconButton>
          <IconButton label="아래로" disabled={index === siblings - 1} onClick={() => onChange((copy) => {
            const list = getList(copy, parentPath)
            ;[list[index + 1], list[index]] = [list[index], list[index + 1]]
          })}><ArrowDown size={14} /></IconButton>
          <IconButton label="한 단계 위로" disabled={depth === 1} onClick={() => onChange((copy) => {
            const list = getList(copy, parentPath)
            const [moved] = list.splice(index, 1)
            const grandList = getList(copy, parentPath.slice(0, -1))
            grandList.splice(parentPath[parentPath.length - 1] + 1, 0, moved)
          })}><ChevronLeft size={14} /></IconButton>
          <IconButton label="위 메뉴의 하위로" disabled={!canIndent} onClick={() => onChange((copy) => {
            const list = getList(copy, parentPath)
            const [moved] = list.splice(index, 1)
            list[index - 1].children.push(moved)
          })}><ChevronRight size={14} /></IconButton>
          <IconButton label="하위 메뉴 추가" disabled={depth >= MENU_MAX_DEPTH} onClick={() => onChange((copy) => {
            getList(copy, parentPath)[index].children.push(newMenuItem('새 메뉴'))
          })}><Plus size={14} /></IconButton>
          <IconButton label="삭제" danger onClick={() => {
            if (hasChildren && !window.confirm(`"${item.label}" 과(와) 하위 메뉴를 모두 지울까요?`)) return
            onChange((copy) => getList(copy, parentPath).splice(index, 1))
          }}><Trash2 size={14} /></IconButton>
        </div>
      </div>
      {item.children.map((child, i) => (
        <MenuRow key={child.id} item={child} path={[...path, i]} depth={depth + 1} siblings={item.children.length} pages={pages} onChange={onChange} />
      ))}
    </>
  )
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-text-2 hover:bg-bg-2 disabled:opacity-25 ${danger ? 'hover:text-red-500 hover:bg-red-50' : 'hover:text-green'}`}
    >
      {children}
    </button>
  )
}

export function MenuScreen() {
  const [saved, setSaved] = useState<string | null>(null)
  const [items, setItems] = useState<MenuItem[]>([])
  const [pages, setPages] = useState<SavedPage[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSiteSettings()
      .then((data) => {
        setSaved(data.settings.menu ?? '')
        setItems(parseMenu(data.settings.menu))
      })
      .catch((error) => toast.error(error.message))
    listSavedPages().then((data) => setPages(data.pages)).catch(() => {})
  }, [])

  const json = JSON.stringify(items)
  const dirty = saved !== null && json !== (saved || '[]')

  async function save() {
    setBusy(true)
    try {
      const data = await saveSiteSettings({ menu: json })
      setSaved(data.settings.menu)
      setItems(parseMenu(data.settings.menu))
      const store = useSiteSettingsStore.getState()
      if (store.settings) store.set({ ...store.settings, menu: data.settings.menu })
      toast.success('메뉴를 저장했습니다.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

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

  const change = (fn: (copy: MenuItem[]) => void) => setItems((prev) => edit(prev, fn))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 md:p-8 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold flex items-center gap-2"><ListTree size={20} />메뉴 관리</h1>
            <p className="text-text-2 text-[14px] mt-1">홈페이지 상단 메뉴를 최대 4단계(메인 &gt; 서브 &gt; 서브 &gt; 서브)로 만듭니다. 메뉴를 하나 이상 만들면 상단 메뉴 블록이 이 메뉴를 보여 줍니다.</p>
          </div>
          <button type="button" onClick={save} disabled={!dirty || busy} className="h-9 px-4 shrink-0 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40">
            <Save size={15} />
            {dirty ? '저장 (Ctrl+S)' : '저장됨'}
          </button>
        </div>

        <QuickCreate onCreate={(item) => setItems((prev) => [...prev, item])} />

        <div className="rounded-lg border border-border-default bg-bg-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-bg-2 text-[13.5px] text-text-1 font-semibold">
            메뉴 목록
            <button type="button" onClick={() => setItems((prev) => [...prev, newMenuItem('새 메뉴')])} className="h-8 px-2.5 rounded-md text-[13px] font-medium text-green hover:bg-green-glow inline-flex items-center gap-1">
              <Plus size={14} />
              메인 메뉴 추가
            </button>
          </div>
          {saved === null ? (
            <div className="px-4 py-8 text-center text-text-3 text-[14px]">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-3 text-[14px]">아직 메뉴가 없습니다. 위의 빠른 메뉴 생성으로 시작하세요. 메뉴가 없으면 상단 메뉴 블록에 적어 둔 메뉴가 그대로 보입니다.</div>
          ) : (
            items.map((item, i) => (
              <MenuRow key={item.id} item={item} path={[i]} depth={1} siblings={items.length} pages={pages} onChange={change} />
            ))
          )}
        </div>

        <ul className="text-[12.5px] text-text-3 leading-relaxed list-disc pl-5">
          <li>← 는 한 단계 위로, → 는 바로 위 메뉴의 하위 메뉴로 옮깁니다.</li>
          <li>하위 메뉴가 있는 메뉴는 링크와 새 창 설정이 쓰이지 않고, 누르면 하위 메뉴를 펼칩니다.</li>
          <li>숨긴 메뉴는 홈페이지에 보이지 않습니다. 저장하지 않으면 바뀐 순서와 내용이 남지 않습니다.</li>
        </ul>
      </div>
    </div>
  )
}
