import { useMemo, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'
import { isPopupLive, parsePopups, type Popup } from './site-popups'

/** 방문자 화면의 팝업. "오늘 하루 보지 않기"는 브라우저에 날짜를 적어 둔다. */

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD
const hideKey = (id: string) => `webbuilder-popup-hide-${id}`

function hiddenToday(id: string) {
  try {
    return localStorage.getItem(hideKey(id)) === today()
  } catch {
    return false
  }
}

function positionStyle(popup: Popup): CSSProperties {
  const { offsetX: x, offsetY: y } = popup
  switch (popup.position) {
    case 'center': return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    case 'right-top': return { right: x, top: y }
    case 'left-bottom': return { left: x, bottom: y }
    case 'right-bottom': return { right: x, bottom: y }
    default: return { left: x, top: y }
  }
}

/** 팝업 상자 하나. 관리 화면 미리보기에서도 쓴다. */
export function PopupCard({ popup, onClose, onHideToday }: { popup: Popup; onClose?: () => void; onHideToday?: () => void }) {
  const body = (
    <>
      {popup.image && <img src={popup.image} alt={popup.title} className="block w-full h-auto" />}
      {popup.text && <div className="px-4 py-3 text-[14.5px] leading-relaxed whitespace-pre-wrap text-[#222]">{popup.text}</div>}
    </>
  )
  return (
    <div className="bg-white shadow-[0_10px_40px_rgba(0,0,0,0.25)] rounded-md overflow-hidden text-[#222]" style={{ width: popup.width, maxWidth: 'calc(100vw - 24px)' }}>
      {popup.link ? (
        <a href={popup.link} target={popup.linkTarget} rel={popup.linkTarget === '_blank' ? 'noreferrer' : undefined} className="block">
          {body}
        </a>
      ) : (
        body
      )}
      {!popup.image && !popup.text && <div className="px-4 py-8 text-center text-[13px] text-[#999]">이미지나 글자를 넣어 주세요</div>}
      <div className="flex items-center justify-between bg-[#222] text-white text-[13px]">
        <button type="button" onClick={onHideToday} className="px-3 py-2 hover:bg-white/10">오늘 하루 보지 않기</button>
        <button type="button" onClick={onClose} className="px-3 py-2 hover:bg-white/10 inline-flex items-center gap-1">
          닫기
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

export function PopupLayer() {
  const json = useSiteSettingsStore((s) => s.settings?.popups)
  const [closed, setClosed] = useState<string[]>([])
  const popups = useMemo(
    () => parsePopups(json).filter((popup) => isPopupLive(popup) && !hiddenToday(popup.id)),
    [json],
  )
  const shown = popups.filter((popup) => !closed.includes(popup.id))
  if (shown.length === 0) return null

  return (
    <div className="admin-light" style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      {shown.map((popup) => (
        <div key={popup.id} className="fixed z-[60] max-sm:!left-3 max-sm:!right-auto max-sm:!top-16 max-sm:!bottom-auto max-sm:!transform-none" style={positionStyle(popup)}>
          <PopupCard
            popup={popup}
            onClose={() => setClosed((prev) => [...prev, popup.id])}
            onHideToday={() => {
              try {
                localStorage.setItem(hideKey(popup.id), today())
              } catch {
                // 저장소를 못 쓰면 이번만 닫는다
              }
              setClosed((prev) => [...prev, popup.id])
            }}
          />
        </div>
      ))}
    </div>
  )
}
