import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FolderOpen, MessageSquare, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { fetchSiteSettings, saveSiteSettings } from '@/lib/builderApi'
import { FileManagerModal } from '@/editor/FileManager'
import { PopupCard } from '@/lib/PopupLayer'
import { POSITION_LABELS, isPopupLive, newPopup, parsePopups, type Popup, type PopupPosition } from '@/lib/site-popups'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'

/**
 * 팝업 관리 (10PAGE 팝업 관리 참고). 메인 페이지에 뜨는 팝업을 만든다.
 * 켜져 있어도 기간 밖이면 보이지 않는다. 방문자는 "오늘 하루 보지 않기"로 닫을 수 있다.
 */

const inputClass = 'w-full h-9 px-2.5 rounded-md border border-border-default bg-bg-1 text-[14px] outline-none focus:border-green'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-text-1 font-semibold mb-1">{label}</span>
      {children}
    </label>
  )
}

function formatRange(popup: Popup) {
  if (popup.permanent) return '기간 없음 (계속)'
  const fmt = (v: string) => (v ? v.replace('T', ' ') : '-')
  return `${fmt(popup.startAt)} ~ ${fmt(popup.endAt)}`
}

function PopupEditor({ popup, onChange, onClose }: { popup: Popup; onChange: (next: Popup) => void; onClose: () => void }) {
  const [picking, setPicking] = useState(false)
  const set = <K extends keyof Popup>(key: K, value: Popup[K]) => onChange({ ...popup, [key]: value })
  const numberInput = (key: 'offsetX' | 'offsetY' | 'width', label: string) => (
    <Field label={label}>
      <input type="number" value={popup[key]} onChange={(e) => set(key, Number(e.target.value) || 0)} className={inputClass} />
    </Field>
  )
  return (
    <div className="rounded-lg border border-green bg-bg-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[15px] font-semibold">팝업 수정</div>
        <button type="button" aria-label="닫기" onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-text-2 hover:bg-bg-2"><X size={15} /></button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Field label="제목 (관리용, 이미지 대체 글)"><input value={popup.title} onChange={(e) => set('title', e.target.value)} className={inputClass} /></Field></div>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={popup.active} onChange={(e) => set('active', e.target.checked)} />켜기</label>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={popup.permanent} onChange={(e) => set('permanent', e.target.checked)} />기간 없이 계속 보이기</label>
          {!popup.permanent && (
            <>
              <Field label="시작"><input type="datetime-local" value={popup.startAt} onChange={(e) => set('startAt', e.target.value)} className={inputClass} /></Field>
              <Field label="끝"><input type="datetime-local" value={popup.endAt} onChange={(e) => set('endAt', e.target.value)} className={inputClass} /></Field>
            </>
          )}
          <Field label="위치">
            <select value={popup.position} onChange={(e) => set('position', e.target.value as PopupPosition)} className={`${inputClass} cursor-pointer`}>
              {Object.entries(POSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          {numberInput('width', '너비 (px)')}
          {popup.position !== 'center' && numberInput('offsetX', '가로 거리 (px)')}
          {popup.position !== 'center' && numberInput('offsetY', '세로 거리 (px)')}
          <div className="sm:col-span-2">
            <Field label="이미지">
              <div className="flex gap-2">
                <input value={popup.image} onChange={(e) => set('image', e.target.value)} placeholder="파일관리자에서 고르거나 주소 입력" className={inputClass} />
                <button type="button" onClick={() => setPicking(true)} className="h-9 px-3 shrink-0 rounded-md border border-border-default text-[13.5px] hover:border-green hover:text-green inline-flex items-center gap-1"><FolderOpen size={14} />파일</button>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="글자 (이미지 아래에 보임)">
              <textarea value={popup.text} rows={3} onChange={(e) => set('text', e.target.value)} className={`${inputClass} h-auto py-2 resize-y`} />
            </Field>
          </div>
          <Field label="누르면 이동할 주소"><input value={popup.link} onChange={(e) => set('link', e.target.value)} placeholder="/notice 또는 https://" className={inputClass} /></Field>
          <Field label="여는 방식">
            <select value={popup.linkTarget} onChange={(e) => set('linkTarget', e.target.value as Popup['linkTarget'])} className={`${inputClass} cursor-pointer`}>
              <option value="_self">현재 창</option>
              <option value="_blank">새 창</option>
            </select>
          </Field>
        </div>
        <div>
          <div className="text-[13px] text-text-2 mb-1.5">미리보기</div>
          <div className="p-3 rounded-lg bg-bg-3 overflow-auto max-w-full lg:max-w-[440px]">
            <div className="origin-top-left" style={{ transform: popup.width > 400 ? `scale(${400 / popup.width})` : undefined }}>
              <PopupCard popup={popup} />
            </div>
          </div>
        </div>
      </div>
      {picking && (
        <FileManagerModal
          initialFolder="main"
          onClose={() => setPicking(false)}
          onPick={(url) => {
            set('image', url)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

export function PopupsScreen() {
  const [saved, setSaved] = useState<string | null>(null)
  const [popups, setPopups] = useState<Popup[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchSiteSettings()
      .then((data) => {
        setSaved(data.settings.popups ?? '')
        setPopups(parsePopups(data.settings.popups))
      })
      .catch((error) => toast.error(error.message))
  }, [])

  const json = JSON.stringify(popups)
  const dirty = saved !== null && json !== (saved || '[]')

  async function save() {
    setBusy(true)
    try {
      const data = await saveSiteSettings({ popups: json })
      setSaved(data.settings.popups)
      setPopups(parsePopups(data.settings.popups))
      const store = useSiteSettingsStore.getState()
      if (store.settings) store.set({ ...store.settings, popups: data.settings.popups })
      toast.success('팝업을 저장했습니다.')
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

  const editing = popups.find((popup) => popup.id === editingId)
  const now = new Date()

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 md:p-8 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold flex items-center gap-2"><MessageSquare size={20} />팝업 관리</h1>
            <p className="text-text-2 text-[14px] mt-1">메인 페이지에 뜨는 팝업을 만듭니다. 켜져 있어도 기간 밖이면 보이지 않습니다.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const popup = newPopup()
                setPopups((prev) => [...prev, popup])
                setEditingId(popup.id)
              }}
              className="h-9 px-3 rounded-md border border-green text-green text-[14px] font-semibold inline-flex items-center gap-1.5 hover:bg-green-glow"
            >
              <Plus size={15} />
              팝업 만들기
            </button>
            <button type="button" onClick={save} disabled={!dirty || busy} className="h-9 px-4 rounded-md bg-green text-white text-[14px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40">
              <Save size={15} />
              {dirty ? '저장 (Ctrl+S)' : '저장됨'}
            </button>
          </div>
        </div>

        {editing && (
          <PopupEditor
            popup={editing}
            onChange={(next) => setPopups((prev) => prev.map((popup) => (popup.id === next.id ? next : popup)))}
            onClose={() => setEditingId(null)}
          />
        )}

        <div className="rounded-lg border border-border-default bg-bg-1 overflow-x-auto">
          <table className="w-full text-[14px] min-w-[640px]">
            <thead className="bg-bg-2 text-text-2 text-[13px]">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 w-12">번호</th>
                <th className="text-left font-medium px-4 py-2.5">제목</th>
                <th className="text-left font-medium px-4 py-2.5">출력 기간</th>
                <th className="text-left font-medium px-4 py-2.5">위치</th>
                <th className="text-left font-medium px-4 py-2.5">상태</th>
                <th className="text-right font-medium px-4 py-2.5">관리</th>
              </tr>
            </thead>
            <tbody>
              {popups.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-3">등록된 팝업이 없습니다.</td></tr>
              ) : popups.map((popup, i) => {
                const live = isPopupLive(popup, now)
                return (
                  <tr key={popup.id} className={`border-t border-border-subtle ${editingId === popup.id ? 'bg-green-glow2' : ''}`}>
                    <td className="px-4 py-2.5 text-text-2">{i + 1}</td>
                    <td className="px-4 py-2.5">{popup.title || '(제목 없음)'}</td>
                    <td className="px-4 py-2.5 text-text-2 text-[13px]">{formatRange(popup)}</td>
                    <td className="px-4 py-2.5 text-text-2">{POSITION_LABELS[popup.position]}</td>
                    <td className="px-4 py-2.5">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={popup.active} onChange={(e) => setPopups((prev) => prev.map((item) => (item.id === popup.id ? { ...item, active: e.target.checked } : item)))} />
                        <span className={`text-[12.5px] ${live ? 'text-green font-semibold' : 'text-text-3'}`}>{live ? '보이는 중' : popup.active ? '기간 밖' : '꺼짐'}</span>
                      </label>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setEditingId(popup.id)} className="h-8 px-2 rounded-md text-[13px] text-text-1 hover:bg-bg-3 inline-flex items-center gap-1"><Pencil size={13} />수정</button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`"${popup.title}" 팝업을 지울까요? 저장해야 반영됩니다.`)) return
                            setPopups((prev) => prev.filter((item) => item.id !== popup.id))
                            if (editingId === popup.id) setEditingId(null)
                          }}
                          className="h-8 px-2 rounded-md text-[13px] text-text-1 hover:text-red-500 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <Trash2 size={13} />
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-text-3">기간은 이 컴퓨터의 시간 기준입니다. 좁은 화면(휴대폰)에서는 위치와 상관없이 위쪽에 보입니다.</p>
      </div>
    </div>
  )
}
