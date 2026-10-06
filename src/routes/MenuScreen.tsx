import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Info, Link2, Plus, Save, Settings, Trash2, X,
} from 'lucide-react'
import { fetchSiteSettings, listSavedPages, saveSiteSettings, type SavedPage } from '@/lib/builderApi'
import { MENU_MAX_DEPTH, alertHref, menuAlertText, menuDepth, newMenuItem, parseMenu, type MenuItem } from '@/lib/site-menu'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'

/**
 * 메뉴 관리 (10PAGE 메뉴 관리 화면과 같은 구성). 홈페이지 상단 메뉴를 최대 4단계로 만든다.
 * - 왼쪽: 메뉴 생성(이름·링크·타겟), 빠른 메뉴 생성(메인 + 하위 이름 여러 개)
 * - 오른쪽: 메뉴 목록 카드. 하위 메뉴 추가, ↑ ↓ 순서, ← → 단계, 설정(메뉴 수정 창), 삭제, 접기
 * 하위 메뉴가 있는 메뉴는 '링크 사용'을 켠 경우에만 링크로 이동한다.
 */

const inputClass = 'w-full h-10 px-3 rounded-md border border-border-default bg-bg-1 text-[14px] outline-none focus:border-green placeholder:text-text-3'

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

/** 목록에 보이는 번호: 위에서부터 차례대로 매긴다. */
function numberMenus(items: MenuItem[], map = new Map<string, number>()) {
  for (const item of items) {
    map.set(item.id, map.size + 1)
    numberMenus(item.children, map)
  }
  return map
}

const targetLabel = (target: MenuItem['target']) => (target === '_blank' ? '_blank(새 창)' : '_self(현재 창)')

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-1">
      <div className="flex items-center justify-between px-5 h-14 border-b border-border-default">
        <h2 className="text-[15px] font-semibold text-text-0">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function PillButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-8 px-3.5 rounded-full bg-green text-white text-[13px] font-semibold inline-flex items-center gap-1 disabled:opacity-40">
      {children}
    </button>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[13px] font-semibold text-text-0 mb-2">{children}</div>
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1 text-[12.5px] text-text-2 leading-snug">
      <Info size={13} className="mt-0.5 shrink-0 text-green" />
      {children}
    </p>
  )
}

function Radio({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[14px] text-text-1 cursor-pointer">
      <input type="radio" checked={checked} onChange={onChange} className="w-4 h-4 accent-[#1c54e4]" />
      {children}
    </label>
  )
}

/** 연결할 링크를 보기 좋게: 알럿창 링크는 '알럿창: 문구'. */
function linkText(href: string) {
  const alertText = menuAlertText(href)
  return alertText ? `알럿창: ${alertText}` : href
}

/** 10PAGE 모달 틀: 제목, 닫기(X/Esc/바깥 클릭), 본문, 아래 버튼. */
function Modal({ title, width = 600, onClose, footer, children }: { title: string; width?: number; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="w-full max-h-[90vh] flex flex-col rounded-xl bg-bg-1 shadow-2xl" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-6 h-16 shrink-0 border-b border-border-default">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-text-2 hover:bg-bg-2"><X size={17} /></button>
        </div>
        <div className="overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-6 pt-1 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

type LinkTab = 'page' | 'url' | 'alert'
const EXTERNAL = /^(https?:|mailto:|tel:)/i

/** 연결할 링크 선택 창 (10PAGE와 같은 구성): 왼쪽 종류 탭, 오른쪽 목록 또는 입력. 게시판·주문폼·캘린더는 우리 빌더에 아직 없다. */
function LinkPickerModal({ value, pages, onPick, onClose }: { value: string; pages: SavedPage[]; onPick: (href: string) => void; onClose: () => void }) {
  const initialAlert = menuAlertText(value)
  const [tab, setTab] = useState<LinkTab>(initialAlert ? 'alert' : EXTERNAL.test(value) ? 'url' : 'page')
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState(EXTERNAL.test(value) ? value : '')
  const [message, setMessage] = useState(initialAlert && initialAlert !== '준비중입니다' ? initialAlert : '')
  const q = query.trim().toLowerCase()
  const options = [
    { href: '#', id: '#', name: '링크 없음' },
    ...pages.map((page) => ({ href: page.isHome ? '/' : `/${page.slug}`, id: page.isHome ? '/' : page.slug ?? '', name: `${page.name}${page.isHome ? ' (메인)' : ''}` })),
  ].filter((option) => !q || option.id.toLowerCase().includes(q) || option.name.toLowerCase().includes(q))

  const tabs: { key: LinkTab; label: string }[] = [
    { key: 'page', label: '페이지' },
    { key: 'url', label: '직접 입력' },
    { key: 'alert', label: '알럿창' },
  ]

  return (
    <Modal title="연결할 링크 선택" width={720} onClose={onClose}>
      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 p-5">
        <div className="flex flex-col gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-10 px-3 rounded-md text-left text-[14px] font-medium ${tab === key ? 'bg-green text-white' : 'text-text-1 hover:bg-bg-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-w-0">
          {tab === 'page' && (
            <>
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID 또는 이름 검색" className={inputClass} />
              <div className="mt-3 h-72 overflow-y-auto rounded-lg border border-border-default">
                {options.length === 0 ? (
                  <div className="py-10 text-center text-[14px] text-text-3">검색 결과가 없습니다.</div>
                ) : (
                  options.map((option) => (
                    <div key={option.href} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-default last:border-b-0">
                      <div className="min-w-0">
                        <div className={`text-[14px] font-semibold truncate ${option.href === value ? 'text-green' : ''}`}>{option.id}</div>
                        <div className="text-[12.5px] text-text-2 truncate">{option.name}</div>
                      </div>
                      <button type="button" onClick={() => onPick(option.href)} className="h-8 px-3 shrink-0 rounded-md border border-green text-green text-[13px] font-medium inline-flex items-center gap-1 hover:bg-green-glow">
                        <Check size={13} />
                        선택
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {tab === 'url' && (
            <div className="flex gap-2">
              <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL 주소 (http:// 및 https:// 포함)" className={inputClass} />
              <button
                type="button"
                onClick={() => {
                  if (!/^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(url.trim())) return toast.error('http:// 또는 https:// 로 시작하는 주소를 넣어 주세요.')
                  onPick(url.trim())
                }}
                className="h-10 px-4 shrink-0 rounded-md bg-green text-white text-[14px] font-semibold"
              >
                적용
              </button>
            </div>
          )}
          {tab === 'alert' && (
            <div className="flex gap-2">
              <input autoFocus value={message} onChange={(e) => setMessage(e.target.value)} placeholder="입력하신 경고 문구가 출력됩니다 (미 입력시 '준비중입니다' 출력)" className={inputClass} />
              <button type="button" onClick={() => onPick(alertHref(message))} className="h-10 px-4 shrink-0 rounded-md bg-green text-white text-[14px] font-semibold">
                적용
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** 연결할 링크 선택: 칸이나 링크 버튼을 누르면 링크 선택 창이 열린다. */
function LinkPicker({ value, pages, onChange }: { value: string; pages: SavedPage[]; onChange: (href: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex gap-1.5">
        <button type="button" aria-label="연결할 링크 선택" onClick={() => setOpen(true)} className="w-10 h-10 shrink-0 rounded-md border border-border-default bg-bg-2 flex items-center justify-center text-text-1 hover:border-green hover:text-green">
          <Link2 size={15} />
        </button>
        <input readOnly value={value === '#' ? '' : linkText(value)} onClick={() => setOpen(true)} placeholder="연결할 링크 선택" className={`${inputClass} cursor-pointer`} />
      </div>
      {open && (
        <LinkPickerModal
          value={value}
          pages={pages}
          onClose={() => setOpen(false)}
          onPick={(href) => {
            onChange(href)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

/** 이름을 입력하고 엔터를 누르면 태그로 쌓인다. */
function TagInput({ values, onChange, placeholder, autoFocus }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const commit = () => {
    if (text.trim()) onChange([...values, text.trim()])
    setText('')
  }
  return (
    // 10PAGE처럼 넣은 이름은 파란 줄로 위아래로 쌓이고, 입력칸은 맨 아래에 있다.
    <div className={`${inputClass} h-auto min-h-10 p-1.5 flex flex-col gap-1 focus-within:border-green`}>
      {values.map((name, i) => (
        <span key={i} className="h-8 pl-2.5 pr-1 rounded bg-green text-white text-[13px] font-semibold flex items-center justify-between gap-1">
          <span className="truncate">{name}</span>
          <button type="button" aria-label={`${name} 빼기`} onClick={() => onChange(values.filter((_, j) => j !== i))} className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15">
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1))
        }}
        placeholder={placeholder}
        className="w-full h-7 px-1.5 bg-transparent outline-none focus-visible:outline-none text-[14px]"
      />
    </div>
  )
}

/** [+ 하위 메뉴]: 하위 메뉴 이름을 여러 개 넣어 한 번에 만든다 (10PAGE 하위 메뉴 빠른 생성). */
function SubQuickCreateModal({ parent, onCreate, onClose }: { parent: MenuItem; onCreate: (names: string[]) => void; onClose: () => void }) {
  const [names, setNames] = useState<string[]>([])
  return (
    <Modal
      title="하위 메뉴 빠른 생성"
      width={520}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-md bg-bg-4 text-text-1 text-[14px] font-medium">닫기</button>
          <button
            type="button"
            onClick={() => {
              if (!names.length) return toast.error('하위 메뉴명을 입력하고 엔터를 눌러주세요.')
              onCreate(names)
            }}
            className="h-9 px-4 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            생성
          </button>
        </>
      }
    >
      <div className="p-6">
        <Label>상위 메뉴</Label>
        <div className="h-10 px-3 rounded-md bg-bg-2 text-[14px] flex items-center mb-4">{parent.label}</div>
        <Label>하위 메뉴명</Label>
        <TagInput values={names} onChange={setNames} placeholder="하위 메뉴명을 입력하고 엔터를 눌러주세요" autoFocus />
        <Hint>하위 메뉴명을 입력하고 엔터를 눌러주세요.</Hint>
      </div>
    </Modal>
  )
}

function CreateMenuCard({ pages, selected, onCreate }: { pages: SavedPage[]; selected: MenuItem | null; onCreate: (item: MenuItem, asMain: boolean) => void }) {
  const [name, setName] = useState('')
  const [asMain, setAsMain] = useState(false)
  const [href, setHref] = useState('#')
  const [target, setTarget] = useState<MenuItem['target']>('_self')

  function create() {
    if (!name.trim()) return toast.error('새 메뉴 이름을 넣어 주세요.')
    onCreate({ ...newMenuItem(name.trim(), href), target }, asMain)
    setName('')
    setHref('#')
    setTarget('_self')
  }

  return (
    <Card title="메뉴 생성" action={<PillButton onClick={create}><Plus size={14} />생성</PillButton>}>
      <Label>새 메뉴 이름</Label>
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && create()} placeholder="새 메뉴 이름" className={inputClass} />
      <label className="mt-2.5 flex items-center gap-2 text-[14px] text-text-1 cursor-pointer">
        <input type="checkbox" checked={asMain} onChange={(e) => setAsMain(e.target.checked)} className="w-4 h-4 accent-[#1c54e4]" />
        메인 메뉴로 생성
      </label>
      {!asMain && (
        <Hint>{selected ? `목록에서 선택한 "${selected.label}"의 하위 메뉴로 만듭니다.` : '목록에서 메뉴를 선택하면 그 하위로, 선택하지 않으면 메인 메뉴로 만듭니다.'}</Hint>
      )}
      <div className="my-5 border-t border-border-default" />
      <Label>연결할 링크 선택</Label>
      <LinkPicker value={href} pages={pages} onChange={setHref} />
      <Hint>연결할 페이지나 링크를 선택해 주세요.</Hint>
      <div className="mt-5" />
      <Label>타겟 선택</Label>
      <div className="flex flex-col gap-2">
        <Radio checked={target === '_self'} onChange={() => setTarget('_self')}>_self(현재 창)</Radio>
        <Radio checked={target === '_blank'} onChange={() => setTarget('_blank')}>_blank(새 창)</Radio>
      </div>
    </Card>
  )
}

function QuickCreateCard({ onCreate }: { onCreate: (item: MenuItem) => void }) {
  const [main, setMain] = useState('')
  const [subs, setSubs] = useState<string[]>([])

  function create() {
    if (!main.trim()) return toast.error('메인 메뉴명을 넣어 주세요.')
    const item = newMenuItem(main.trim())
    item.children = subs.map((name) => newMenuItem(name))
    onCreate(item)
    setMain('')
    setSubs([])
  }

  return (
    <Card title="빠른 메뉴 생성" action={<PillButton onClick={create}><Plus size={14} />빠른 생성</PillButton>}>
      <Label>메인 메뉴명</Label>
      <input value={main} onChange={(e) => setMain(e.target.value)} placeholder="메인 메뉴명을 입력하세요" className={inputClass} />
      <div className="mt-4" />
      <Label>하위 메뉴명</Label>
      <TagInput values={subs} onChange={setSubs} placeholder="하위 메뉴명을 입력하고 엔터를 눌러주세요" />
      <Hint>하위 메뉴명을 입력하고 엔터를 눌러주세요.</Hint>
    </Card>
  )
}

/** 메뉴 수정 창 (10PAGE 메뉴 수정과 같은 항목). 저장하면 목록에 반영되고, 목록의 [저장]으로 홈페이지에 적용된다. */
function MenuEditModal({ item, pages, onSave, onClose }: { item: MenuItem; pages: SavedPage[]; onSave: (changes: Partial<MenuItem>) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(item)
  const set = (changes: Partial<MenuItem>) => setDraft((prev) => ({ ...prev, ...changes }))

  return (
    <Modal
      title="메뉴 수정"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-md bg-bg-4 text-text-1 text-[14px] font-medium">닫기</button>
          <button
            type="button"
            onClick={() => {
              if (!draft.label.trim()) return toast.error('메뉴 이름을 넣어 주세요.')
              const { label, hidden, hideChildren, href, target, linkEnabled } = draft
              onSave({ label: label.trim(), hidden, hideChildren, href, target, linkEnabled })
            }}
            className="h-9 px-4 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5"
          >
            <Save size={14} />
            저장
          </button>
        </>
      }
    >
      <div className="p-6 flex flex-col gap-5">
        <div>
          <h3 className="text-[15px] font-semibold mb-2">메뉴 설정</h3>
          <div className="rounded-lg border border-border-default p-4 flex flex-col gap-4">
            <div>
              <Label>메뉴 이름</Label>
              <input value={draft.label} onChange={(e) => set({ label: e.target.value })} className={inputClass} />
            </div>
            <div>
              <Label>메뉴 출력 설정</Label>
              <label className="flex items-center gap-2 text-[14px] text-text-1 cursor-pointer">
                <input type="checkbox" checked={!!draft.hidden} onChange={(e) => set({ hidden: e.target.checked || undefined })} className="w-4 h-4 accent-[#1c54e4]" />
                전체 숨김
              </label>
              <Hint>숨김 설정 시 해당 메뉴 및 서브 메뉴는 표시되지 않습니다.</Hint>
            </div>
            <div>
              <Label>서브 메뉴 출력 설정</Label>
              <label className="flex items-center gap-2 text-[14px] text-text-1 cursor-pointer">
                <input type="checkbox" checked={!!draft.hideChildren} onChange={(e) => set({ hideChildren: e.target.checked || undefined })} className="w-4 h-4 accent-[#1c54e4]" />
                숨김
              </label>
              <Hint>숨김 설정 시 서브 메뉴는 표시되지 않습니다.</Hint>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold mb-2">링크 설정</h3>
          <div className="rounded-lg border border-border-default p-4 flex flex-col gap-4">
            <div>
              <Label>연결할 링크 선택</Label>
              <LinkPicker value={draft.href} pages={pages} onChange={(href) => set({ href })} />
            </div>
            <div>
              <Label>타겟 선택</Label>
              <div className="flex gap-5">
                <Radio checked={draft.target === '_self'} onChange={() => set({ target: '_self' })}>_self(현재 창)</Radio>
                <Radio checked={draft.target === '_blank'} onChange={() => set({ target: '_blank' })}>_blank(새 창)</Radio>
              </div>
            </div>
            <div>
              <Label>메뉴 링크 사용 설정</Label>
              <div className="flex gap-5">
                <Radio checked={!!draft.linkEnabled} onChange={() => set({ linkEnabled: true })}>링크 사용</Radio>
                <Radio checked={!draft.linkEnabled} onChange={() => set({ linkEnabled: undefined })}>비활성화(#)</Radio>
              </div>
              <Hint>서브 메뉴가 있는 메뉴에서 상위 메뉴 클릭 시 이동 방식을 설정합니다.</Hint>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function RowButton({ label, onClick, disabled, danger, active, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean; children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`w-8 h-8 border-l border-border-default first:border-l-0 flex items-center justify-center disabled:opacity-30 ${
        danger ? 'text-red-500 hover:bg-red-50' : active ? 'text-green hover:bg-green-glow' : 'text-text-1 hover:bg-bg-2'
      }`}
    >
      {children}
    </button>
  )
}

/** 끌어 놓을 위치: 대상 메뉴의 위(before), 아래(after), 안쪽 하위로(inside). */
type DropPos = 'before' | 'after' | 'inside'
interface DropTarget { id: string; pos: DropPos }

interface DragApi {
  dragId: string | null
  drop: DropTarget | null
  start: (id: string) => void
  over: (target: DropTarget | null) => void
  end: () => void
  commit: () => void
}

function MenuCard({
  item, path, depth, siblings, numbers, selectedId, collapsed, drag, onSelect, onToggle, onEdit, onAddSub, onChange,
}: {
  item: MenuItem; path: Path; depth: number; siblings: number; numbers: Map<string, number>
  selectedId: string | null; collapsed: Set<string>; drag: DragApi
  onSelect: (id: string) => void; onToggle: (id: string) => void; onEdit: (path: Path) => void; onAddSub: (path: Path) => void
  onChange: (fn: (copy: MenuItem[]) => void) => void
}) {
  const index = path[path.length - 1]
  const parentPath = path.slice(0, -1)
  const hasChildren = item.children.length > 0
  const canIndent = index > 0 && depth + menuDepth(item) - 1 < MENU_MAX_DEPTH
  const isOpen = !collapsed.has(item.id)
  const selected = selectedId === item.id
  const main = depth === 1
  const dragging = drag.dragId === item.id
  const dropPos = drag.drop?.id === item.id ? drag.drop.pos : null

  return (
    <div className={`relative border-b border-border-default last:border-b-0 bg-bg-1 ${dragging ? 'opacity-40' : ''}`}>
      {dropPos === 'before' && <div className="absolute left-0 right-0 -top-px h-[3px] bg-green z-10 pointer-events-none" />}
      {dropPos === 'after' && <div className="absolute left-0 right-0 -bottom-px h-[3px] bg-green z-10 pointer-events-none" />}
      <div
        draggable
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', item.id)
          drag.start(item.id)
        }}
        onDragEnd={drag.end}
        onDragOver={(event) => {
          if (!drag.dragId || drag.dragId === item.id) return
          event.preventDefault()
          event.stopPropagation()
          // 위쪽 1/4은 위로, 아래쪽 1/4은 아래로, 가운데는 이 메뉴의 하위로 넣는다.
          const rect = event.currentTarget.getBoundingClientRect()
          const y = (event.clientY - rect.top) / rect.height
          drag.over({ id: item.id, pos: y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside' })
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          drag.commit()
        }}
        onClick={() => onSelect(item.id)}
        className={`px-5 py-4 cursor-grab active:cursor-grabbing ${selected ? 'bg-green-glow2 ring-1 ring-inset ring-green' : ''} ${dropPos === 'inside' ? 'bg-green-glow ring-2 ring-inset ring-green' : ''} ${item.hidden ? 'opacity-50' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <GripVertical size={15} className="text-text-3 shrink-0 -ml-2" />
            <span className={`h-6 px-2.5 rounded-full text-[12px] font-semibold flex items-center shrink-0 ${main ? 'bg-green text-white' : 'bg-[#363b3f] text-white'}`}>
              {main ? '메인' : `서브 ${index + 1}`}
            </span>
            <span className={`truncate text-[15px] ${main ? 'font-semibold' : 'font-medium'}`}>{item.label || '(이름 없음)'}</span>
            {item.hidden && <span className="text-[12px] text-text-3">숨김</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={depth >= MENU_MAX_DEPTH}
              onClick={(event) => {
                event.stopPropagation()
                onAddSub(path)
              }}
              className="h-8 px-2.5 rounded-md border border-border-default text-[13px] text-text-1 hover:bg-bg-2 inline-flex items-center gap-1 disabled:opacity-30"
            >
              <Plus size={13} />
              하위 메뉴
            </button>
            <div className="flex rounded-md border border-border-default overflow-hidden bg-bg-1">
              <RowButton label="위로" disabled={index === 0} onClick={() => onChange((copy) => {
                const list = getList(copy, parentPath)
                ;[list[index - 1], list[index]] = [list[index], list[index - 1]]
              })}><ArrowUp size={14} /></RowButton>
              <RowButton label="아래로" disabled={index === siblings - 1} onClick={() => onChange((copy) => {
                const list = getList(copy, parentPath)
                ;[list[index + 1], list[index]] = [list[index], list[index + 1]]
              })}><ArrowDown size={14} /></RowButton>
              <RowButton label="한 단계 위로" disabled={depth === 1} onClick={() => onChange((copy) => {
                const list = getList(copy, parentPath)
                const [moved] = list.splice(index, 1)
                getList(copy, parentPath.slice(0, -1)).splice(parentPath[parentPath.length - 1] + 1, 0, moved)
              })}><ChevronLeft size={14} /></RowButton>
              <RowButton label="위 메뉴의 하위로" disabled={!canIndent} onClick={() => onChange((copy) => {
                const list = getList(copy, parentPath)
                const [moved] = list.splice(index, 1)
                list[index - 1].children.push(moved)
              })}><ChevronRight size={14} /></RowButton>
              <RowButton label="메뉴 수정" active onClick={() => onEdit(path)}><Settings size={14} /></RowButton>
              <RowButton label="삭제" danger onClick={() => {
                if (!window.confirm(hasChildren ? `"${item.label}" 과(와) 하위 메뉴를 모두 지울까요?` : `"${item.label}" 메뉴를 지울까요?`)) return
                onChange((copy) => getList(copy, parentPath).splice(index, 1))
              }}><Trash2 size={14} /></RowButton>
            </div>
            {hasChildren && (
              <button
                type="button"
                aria-label={isOpen ? '하위 메뉴 접기' : '하위 메뉴 펼치기'}
                title={isOpen ? '접기' : '펼치기'}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggle(item.id)
                }}
                className="w-8 h-8 rounded-md bg-green text-white flex items-center justify-center"
              >
                {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-text-2">
          <span><b className="font-medium text-green">번호</b> {numbers.get(item.id)}</span>
          <span><b className="font-medium text-green">링크</b> {linkText(item.href)}{hasChildren && !item.linkEnabled ? ' (비활성화)' : ''}</span>
          <span><b className="font-medium text-green">타겟</b> {targetLabel(item.target)}</span>
          {hasChildren && <span><b className="font-medium text-green">메뉴</b> {item.children.length}개{item.hideChildren ? ' (숨김)' : ''}</span>}
        </div>
      </div>
      {hasChildren && isOpen && (
        <div className="mx-5 mb-4 rounded-lg border border-border-default bg-bg-2 p-3">
          <div className="rounded-lg border border-border-default overflow-hidden">
            {item.children.map((child, i) => (
              <MenuCard
                key={child.id}
                item={child}
                path={[...path, i]}
                depth={depth + 1}
                siblings={item.children.length}
                numbers={numbers}
                selectedId={selectedId}
                collapsed={collapsed}
                drag={drag}
                onSelect={onSelect}
                onToggle={onToggle}
                onEdit={onEdit}
                onAddSub={onAddSub}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function findById(items: MenuItem[], id: string | null, path: Path = []): { item: MenuItem; path: Path; depth: number } | null {
  if (!id) return null
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].id === id) return { item: items[i], path: [...path, i], depth: path.length + 1 }
    const found = findById(items[i].children, id, [...path, i])
    if (found) return found
  }
  return null
}

/** 끌어 놓기 결과를 트리에 적용한다. 4단계를 넘거나 자기 하위로 넣으려 하면 false. */
function moveByDrop(copy: MenuItem[], dragId: string, drop: DropTarget): boolean {
  const moving = findById(copy, dragId)
  const target = findById(copy, drop.id)
  if (!moving || !target || findById(moving.item.children, drop.id)) return false
  const targetDepth = drop.pos === 'inside' ? target.depth + 1 : target.depth
  if (targetDepth + menuDepth(moving.item) - 1 > MENU_MAX_DEPTH) return false
  getList(copy, moving.path.slice(0, -1)).splice(moving.path[moving.path.length - 1], 1)
  // 빼낸 뒤 대상 위치를 다시 찾는다 (앞에서 빠지면 번호가 당겨지므로).
  const again = findById(copy, drop.id)!
  if (drop.pos === 'inside') {
    again.item.children.push(moving.item)
  } else {
    const list = getList(copy, again.path.slice(0, -1))
    const at = again.path[again.path.length - 1]
    list.splice(drop.pos === 'before' ? at : at + 1, 0, moving.item)
  }
  return true
}

export function MenuScreen() {
  const [saved, setSaved] = useState<string | null>(null)
  const [items, setItems] = useState<MenuItem[]>([])
  const [pages, setPages] = useState<SavedPage[]>([])
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingPath, setEditingPath] = useState<Path | null>(null)
  const [addingSubPath, setAddingSubPath] = useState<Path | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

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
  const numbers = numberMenus(items)
  const selected = findById(items, selectedId)
  const itemAt = (path: Path | null) => (path ? getList(items, path.slice(0, -1))[path[path.length - 1]] : null)
  const editing = itemAt(editingPath)
  const addingSubTo = itemAt(addingSubPath)

  const expand = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    next.delete(id)
    return next
  })

  const drag: DragApi = {
    dragId,
    drop,
    start: (id) => setDragId(id),
    over: (target) => setDrop((prev) => (prev?.id === target?.id && prev?.pos === target?.pos ? prev : target)),
    end: () => {
      setDragId(null)
      setDrop(null)
    },
    commit: () => {
      if (dragId && drop) {
        const next = structuredClone(items)
        if (moveByDrop(next, dragId, drop)) {
          setItems(next)
          if (drop.pos === 'inside') expand(drop.id)
        } else {
          toast.error('메뉴는 최대 4단계까지 구성할 수 있습니다.')
        }
      }
      setDragId(null)
      setDrop(null)
    },
  }

  function createMenu(item: MenuItem, asMain: boolean) {
    // 메인 메뉴로 만들지 않으면 목록에서 선택한 메뉴의 하위로 넣는다 (4단계를 넘으면 메인으로).
    if (!asMain && selected && selected.depth < MENU_MAX_DEPTH) {
      change((copy) => getList(copy, selected.path.slice(0, -1))[selected.path[selected.path.length - 1]].children.push(item))
      expand(selected.item.id)
    } else {
      setItems((prev) => [...prev, item])
    }
    toast.success(`"${item.label}" 메뉴를 만들었습니다. [저장]을 눌러야 홈페이지에 적용됩니다.`)
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-0">
      <div className="max-w-[1280px] mx-auto p-6 md:p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold">메뉴 관리</h1>
          <div className="text-[13px] text-text-2"><span className="text-green font-medium">대시보드</span> / 메뉴 / 메뉴 관리</div>
        </div>

        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-1.5 rounded-full bg-green" />
            <h2 className="text-[17px] font-semibold">메뉴 관리</h2>
          </div>
          <p className="text-text-1 text-[14px] mt-1.5 ml-8">홈페이지 상단에 출력되는 메뉴(최대 4단계)를 설정합니다.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
          <div className="flex flex-col gap-6">
            <CreateMenuCard pages={pages} selected={selected?.item ?? null} onCreate={createMenu} />
            <QuickCreateCard onCreate={(item) => setItems((prev) => [...prev, item])} />
          </div>

          <div className="flex flex-col gap-4">
            {saved !== null && items.length > 0 && (
              <Card
                title="메뉴 목록"
                action={
                  <PillButton onClick={save} disabled={!dirty || busy}>
                    <Save size={14} />
                    {dirty ? '저장' : '저장됨'}
                  </PillButton>
                }
              >
                <div className="-m-5" onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node) && setDrop(null)}>
                  {items.map((item, i) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      path={[i]}
                      depth={1}
                      siblings={items.length}
                      numbers={numbers}
                      selectedId={selectedId}
                      collapsed={collapsed}
                      drag={drag}
                      onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                      onToggle={(id) => setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(id)) next.delete(id)
                        else next.add(id)
                        return next
                      })}
                      onEdit={setEditingPath}
                      onAddSub={setAddingSubPath}
                      onChange={change}
                    />
                  ))}
                </div>
              </Card>
            )}
            {saved === null && <div className="py-10 text-center text-text-3 text-[14px]">불러오는 중…</div>}
            {/* 저장된 메뉴를 모두 지운 경우에도 저장할 수 있게 한다. */}
            {saved !== null && items.length === 0 && dirty && (
              <div className="flex justify-end">
                <PillButton onClick={save} disabled={busy}><Save size={14} />저장</PillButton>
              </div>
            )}
            <ul className="text-[13px] text-text-1 leading-relaxed list-disc pl-5">
              <li>항목을 드래그하여 순서를 변경할 수 있습니다.</li>
              <li>드래그하여 상·하위 관계를 변경할 수 있으며 (메뉴 가운데에 놓으면 하위로), 메뉴는 최대 4단계(메인 &gt; 서브 &gt; 서브 &gt; 서브)까지 구성할 수 있습니다.</li>
              <li>하위 메뉴가 있는 경우 상위 메뉴의 링크는 메뉴 수정에서 '링크 사용'을 켠 경우에만 작동합니다.</li>
              <li>메뉴 생성 시 저장하지 않은 메뉴 순서는 유지되지 않습니다. (Ctrl+S 로도 저장)</li>
            </ul>
          </div>
        </div>
      </div>

      {editing && editingPath && (
        <MenuEditModal
          key={editing.id}
          item={editing}
          pages={pages}
          onClose={() => setEditingPath(null)}
          onSave={(changes) => {
            change((copy) => Object.assign(getList(copy, editingPath.slice(0, -1))[editingPath[editingPath.length - 1]], changes))
            setEditingPath(null)
          }}
        />
      )}

      {addingSubTo && addingSubPath && (
        <SubQuickCreateModal
          parent={addingSubTo}
          onClose={() => setAddingSubPath(null)}
          onCreate={(names) => {
            change((copy) => getList(copy, addingSubPath.slice(0, -1))[addingSubPath[addingSubPath.length - 1]].children.push(...names.map((name) => newMenuItem(name))))
            expand(addingSubTo.id)
            setAddingSubPath(null)
          }}
        />
      )}
    </div>
  )
}
