/**
 * 사이트 메뉴 (10PAGE 메뉴 관리 참고). 사이트 설정의 'menu' 칸에 JSON 문자열로 저장한다.
 * 최대 4단계(메인 > 서브 > 서브 > 서브). 상단 메뉴 블록이 이 메뉴를 보여 준다.
 * 서버(siteSettingsService.js, settings.php)도 같은 규칙으로 정리한다.
 */
export interface MenuItem {
  id: string
  label: string
  href: string
  target: '_self' | '_blank'
  hidden?: boolean
  /** 서브 메뉴 출력 숨김: 이 메뉴의 하위 메뉴를 보여 주지 않는다. */
  hideChildren?: boolean
  /** 하위 메뉴가 있어도 이 메뉴를 누르면 링크로 이동한다. 없으면 # (펼치기만). */
  linkEnabled?: boolean
  children: MenuItem[]
}

export const MENU_MAX_DEPTH = 4

let counter = 0
export function newMenuId() {
  counter += 1
  return `m-${Date.now().toString(36)}-${counter}`
}

export function newMenuItem(label: string, href = '#'): MenuItem {
  return { id: newMenuId(), label, href, target: '_self', children: [] }
}

/** javascript: 같은 주소는 막고, 사이트 안 주소(/…), #, http(s), mailto, tel 만 받는다. */
export function safeHref(href: string): string {
  const value = href.trim()
  if (/^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(value)) return value
  return '#'
}

function clean(items: unknown, depth: number): MenuItem[] {
  if (!Array.isArray(items) || depth > MENU_MAX_DEPTH) return []
  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .slice(0, 50)
    .map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : newMenuId(),
      label: String(item.label ?? '').slice(0, 60),
      href: safeHref(String(item.href ?? '#')),
      target: item.target === '_blank' ? '_blank' : '_self',
      hidden: item.hidden === true || undefined,
      hideChildren: item.hideChildren === true || undefined,
      linkEnabled: item.linkEnabled === true || undefined,
      children: clean(item.children, depth + 1),
    }))
}

export function parseMenu(json: string | undefined): MenuItem[] {
  if (!json) return []
  try {
    return clean(JSON.parse(json), 1)
  } catch {
    return []
  }
}

export function visibleMenu(items: MenuItem[]): MenuItem[] {
  return items
    .filter((item) => !item.hidden && item.label.trim())
    .map((item) => ({ ...item, children: item.hideChildren ? [] : visibleMenu(item.children) }))
}

/** 알럿창 링크: '#alert:문구' 로 저장하고, 누르면 문구를 띄운다 (10PAGE 링크 선택의 알럿창). */
export const ALERT_PREFIX = '#alert:'

export function alertHref(message: string): string {
  return ALERT_PREFIX + message.trim()
}

/** 알럿창 링크면 띄울 문구, 아니면 null. 문구가 비어 있으면 '준비중입니다'. */
export function menuAlertText(href: string): string | null {
  return href.startsWith(ALERT_PREFIX) ? href.slice(ALERT_PREFIX.length).trim() || '준비중입니다' : null
}

/** 하위 메뉴가 있는 메뉴는 '링크 사용'을 켠 경우에만 이동한다. */
export function menuHref(item: MenuItem): string | undefined {
  return item.children.length && !item.linkEnabled ? undefined : item.href
}

/** 홈페이지 메뉴 링크(<a>)에 넣을 속성. 알럿창 링크는 이동하지 않고 문구만 띄운다. */
export function menuLinkProps(item: MenuItem) {
  const href = menuHref(item)
  const alertText = href ? menuAlertText(href) : null
  if (alertText) {
    return {
      href: '#',
      onClick: (event: { preventDefault: () => void }) => {
        event.preventDefault()
        window.alert(alertText)
      },
    }
  }
  return { href, target: item.target, rel: item.target === '_blank' ? 'noreferrer' : undefined }
}

export function menuDepth(item: MenuItem): number {
  return 1 + Math.max(0, ...item.children.map(menuDepth))
}
