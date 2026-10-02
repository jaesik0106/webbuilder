import { safeHref } from './site-menu'

/**
 * 메인 팝업 (10PAGE 팝업 관리 참고). 사이트 설정의 'popups' 칸에 JSON 문자열로 저장한다.
 * 내용은 HTML 대신 이미지 + 글자 + 링크로 만든다 (고객도 안전하게 쓰도록).
 * 서버(siteSettingsService.js, settings.php)도 같은 규칙으로 정리한다.
 */
export type PopupPosition = 'center' | 'left-top' | 'right-top' | 'left-bottom' | 'right-bottom'

export interface Popup {
  id: string
  title: string
  active: boolean
  /** 기간 (YYYY-MM-DDTHH:mm, 한국 시간). permanent 면 기간을 보지 않는다. */
  startAt: string
  endAt: string
  permanent: boolean
  position: PopupPosition
  offsetX: number
  offsetY: number
  width: number
  image: string
  text: string
  link: string
  linkTarget: '_self' | '_blank'
}

export const POSITION_LABELS: Record<PopupPosition, string> = {
  center: '가운데',
  'left-top': '왼쪽 위',
  'right-top': '오른쪽 위',
  'left-bottom': '왼쪽 아래',
  'right-bottom': '오른쪽 아래',
}

function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function newPopup(): Popup {
  const now = new Date()
  const week = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  return {
    id: `p-${Date.now().toString(36)}`,
    title: '새 팝업',
    active: true,
    startAt: localInput(now),
    endAt: localInput(week),
    permanent: false,
    position: 'left-top',
    offsetX: 40,
    offsetY: 120,
    width: 400,
    image: '',
    text: '',
    link: '',
    linkTarget: '_self',
  }
}

const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

export function parsePopups(json: string | undefined): Popup[] {
  if (!json) return []
  try {
    const list = JSON.parse(json)
    if (!Array.isArray(list)) return []
    return list.filter((item) => item && typeof item === 'object').slice(0, 20).map((item) => ({
      id: String(item.id || `p-${Math.random().toString(36).slice(2, 8)}`),
      title: String(item.title ?? '').slice(0, 100),
      active: item.active === true,
      startAt: String(item.startAt ?? ''),
      endAt: String(item.endAt ?? ''),
      permanent: item.permanent === true,
      position: (Object.keys(POSITION_LABELS) as PopupPosition[]).includes(item.position) ? item.position : 'left-top',
      offsetX: num(item.offsetX, 40, 0, 2000),
      offsetY: num(item.offsetY, 120, 0, 2000),
      width: num(item.width, 400, 200, 1200),
      image: typeof item.image === 'string' ? item.image : '',
      text: String(item.text ?? '').slice(0, 2000),
      link: item.link ? safeHref(String(item.link)) : '',
      linkTarget: item.linkTarget === '_blank' ? '_blank' : '_self',
    }))
  } catch {
    return []
  }
}

/** 지금 보여 줄 팝업인지: 켜져 있고, 영구이거나 기간 안 */
export function isPopupLive(popup: Popup, now = new Date()) {
  if (!popup.active) return false
  if (popup.permanent) return true
  const start = popup.startAt ? new Date(popup.startAt) : null
  const end = popup.endAt ? new Date(popup.endAt) : null
  if (start && !Number.isNaN(start.getTime()) && now < start) return false
  if (end && !Number.isNaN(end.getTime()) && now > end) return false
  return true
}
