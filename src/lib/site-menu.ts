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
  return items.filter((item) => !item.hidden && item.label.trim()).map((item) => ({ ...item, children: visibleMenu(item.children) }))
}

export function menuDepth(item: MenuItem): number {
  return 1 + Math.max(0, ...item.children.map(menuDepth))
}
