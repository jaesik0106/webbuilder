import { describe, expect, it } from 'vitest'
import { parseMenu, safeHref, visibleMenu } from '../src/lib/site-menu'
import { isPopupLive, parsePopups } from '../src/lib/site-popups'

describe('site menu', () => {
  it('keeps up to 4 levels and blocks unsafe links', () => {
    const deep = [{ label: 'a', href: 'javascript:alert(1)', children: [{ label: 'b', children: [{ label: 'c', children: [{ label: 'd', children: [{ label: 'e' }] }] }] }] }]
    const [a] = parseMenu(JSON.stringify(deep))
    expect(a.href).toBe('#')
    expect(a.children[0].children[0].children[0].label).toBe('d')
    expect(a.children[0].children[0].children[0].children).toEqual([])
    expect(safeHref('//evil.com')).toBe('#')
    expect(safeHref('/about')).toBe('/about')
  })

  it('hides hidden items for visitors', () => {
    const menu = parseMenu(JSON.stringify([{ label: 'show', children: [] }, { label: 'hide', hidden: true, children: [] }]))
    expect(visibleMenu(menu).map((item) => item.label)).toEqual(['show'])
  })
})

describe('site popups', () => {
  const base = { id: 'p', active: true, startAt: '2026-10-01T00:00', endAt: '2026-10-05T00:00', permanent: false }

  it('shows only active popups inside the period unless permanent', () => {
    const [popup] = parsePopups(JSON.stringify([base]))
    expect(isPopupLive(popup, new Date('2026-10-02T12:00'))).toBe(true)
    expect(isPopupLive(popup, new Date('2026-10-06T12:00'))).toBe(false)
    expect(isPopupLive({ ...popup, permanent: true }, new Date('2027-01-01T00:00'))).toBe(true)
    expect(isPopupLive({ ...popup, active: false }, new Date('2026-10-02T12:00'))).toBe(false)
  })

  it('cleans links and sizes', () => {
    const [popup] = parsePopups(JSON.stringify([{ ...base, link: 'javascript:x', width: 5000 }]))
    expect(popup.link).toBe('#')
    expect(popup.width).toBe(1200)
  })
})
