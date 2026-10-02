import { useEffect } from 'react'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'
import { getToken, recordVisit } from '@/lib/builderApi'

/**
 * 사이트 설정을 방문자 화면의 <head>/<body> 에 적용한다.
 * - 제목: 메인은 사이트 제목, 서브는 "페이지 이름 + 연결 문자 + 사이트 제목"
 * - 설명, 키워드, 오픈그래프, 파비콘, 네이버·구글 소유확인, 추가 메타태그(<meta>/<link> 만)
 * - 추가 CSS (편집 중에도 적용해 화면이 같게 보이게 한다)
 * - HEAD/BODY 상단·하단 스크립트 (편집 중에는 넣지 않는다)
 * 넣은 요소에는 data-site-head / data-site-script 를 붙여 두고, 바뀌거나 페이지를 떠나면 지운다.
 */

const MARK = 'data-site-head'
const SCRIPT_MARK = 'data-site-script'

function addMeta(attrs: Record<string, string>) {
  const el = document.createElement('meta')
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  el.setAttribute(MARK, '')
  document.head.appendChild(el)
}

function addLink(rel: string, href: string) {
  const el = document.createElement('link')
  el.rel = rel
  el.href = href
  el.setAttribute(MARK, '')
  document.head.appendChild(el)
}

/** HTML 조각을 넣는다. createContextualFragment 로 만든 <script> 는 넣을 때 실행된다. */
function insertHtml(html: string, parent: HTMLElement, atStart: boolean) {
  if (!html.trim()) return
  const fragment = document.createRange().createContextualFragment(html)
  for (const node of Array.from(fragment.childNodes)) {
    if (node instanceof Element) node.setAttribute(SCRIPT_MARK, '')
  }
  if (atStart) parent.insertBefore(fragment, parent.firstChild)
  else parent.appendChild(fragment)
}

/** 추가 메타태그 칸에서는 <meta>, <link> 만 받는다. */
function insertExtraMeta(html: string) {
  if (!html.trim()) return
  const doc = new DOMParser().parseFromString(`<head>${html}</head>`, 'text/html')
  for (const el of Array.from(doc.head.querySelectorAll('meta, link'))) {
    const copy = document.createElement(el.tagName.toLowerCase())
    for (const attr of Array.from(el.attributes)) copy.setAttribute(attr.name, attr.value)
    copy.setAttribute(MARK, '')
    document.head.appendChild(copy)
  }
}

export function SiteHead({ pageName, isHome, editing }: { pageName?: string; isHome: boolean; editing: boolean }) {
  const settings = useSiteSettingsStore((s) => s.settings)
  const load = useSiteSettingsStore((s) => s.load)

  useEffect(() => {
    load()
    // 방문자 수 (관리자로 로그인한 사람은 세지 않는다)
    if (!getToken()) recordVisit(window.location.pathname)
  }, [load])

  // 제목
  useEffect(() => {
    const siteTitle = settings?.siteTitle?.trim() ?? ''
    const separator = settings?.titleSeparator || ' | '
    const name = pageName?.trim() ?? ''
    document.title = isHome ? siteTitle || name || '웹빌더' : [name, siteTitle].filter(Boolean).join(separator) || '웹빌더'
  }, [settings, pageName, isHome])

  // 메타, 파비콘, 추가 CSS
  useEffect(() => {
    if (!settings) return
    const s = settings
    const title = document.title
    if (s.siteDescription) addMeta({ name: 'description', content: s.siteDescription })
    if (s.keywords) addMeta({ name: 'keywords', content: s.keywords })
    addMeta({ property: 'og:type', content: 'website' })
    addMeta({ property: 'og:title', content: title })
    if (s.siteDescription) addMeta({ property: 'og:description', content: s.siteDescription })
    if (s.ogImage) addMeta({ property: 'og:image', content: new URL(s.ogImage, window.location.origin).href })
    if (s.siteUrl) addMeta({ property: 'og:url', content: s.siteUrl })
    if (s.naverVerification) addMeta({ name: 'naver-site-verification', content: s.naverVerification })
    if (s.googleVerification) addMeta({ name: 'google-site-verification', content: s.googleVerification })
    if (s.favicon) addLink('icon', s.favicon)
    if (s.siteUrl) addLink('canonical', s.siteUrl.replace(/\/+$/, '') + window.location.pathname)
    insertExtraMeta(s.extraMeta ?? '')
    if (s.customCss?.trim()) {
      const style = document.createElement('style')
      style.setAttribute(MARK, '')
      style.textContent = s.customCss
      document.head.appendChild(style)
    }
    return () => document.querySelectorAll(`[${MARK}]`).forEach((el) => el.remove())
  }, [settings, pageName])

  // 스크립트 (GA, GTM 등). 편집 중에는 넣지 않는다.
  useEffect(() => {
    if (!settings || editing) return
    insertHtml(settings.headTop ?? '', document.head, true)
    insertHtml(settings.headBottom ?? '', document.head, false)
    insertHtml(settings.bodyTop ?? '', document.body, true)
    insertHtml(settings.bodyBottom ?? '', document.body, false)
    return () => document.querySelectorAll(`[${SCRIPT_MARK}]`).forEach((el) => el.remove())
  }, [settings, editing])

  return null
}
