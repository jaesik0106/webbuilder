import type { BlockConfig } from '../types'
import { useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { useSiteSettingsStore } from '@/store/siteSettingsStore'
import { parseMenu, visibleMenu, type MenuItem } from '@/lib/site-menu'

/** 관리자 > 메뉴 에서 만든 사이트 메뉴. 하나도 없으면 null (블록에 적어 둔 메뉴를 쓴다). */
function useSiteMenu(): MenuItem[] | null {
  const json = useSiteSettingsStore((s) => s.settings?.menu)
  const items = visibleMenu(parseMenu(json))
  return items.length ? items : null
}

/** 데스크톱: 메인 메뉴에 마우스를 올리면 하위 메뉴(2단계 이하)가 펼쳐진다. */
function SubMenuList({ items, depth }: { items: MenuItem[]; depth: number }) {
  return (
    <ul className={depth > 2 ? 'pl-3' : ''}>
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={item.children.length ? undefined : item.href}
            target={item.target}
            rel={item.target === '_blank' ? 'noreferrer' : undefined}
            className={`block px-3 py-1.5 rounded-md text-[13px] whitespace-nowrap ${item.children.length ? 'text-text-1 font-semibold' : 'text-text-2 hover:text-text-0 hover:bg-bg-3'}`}
          >
            {item.label}
          </a>
          {item.children.length > 0 && <SubMenuList items={item.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function SiteMenuDesktop({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="relative group/menu">
          <a
            href={item.children.length ? undefined : item.href}
            target={item.target}
            rel={item.target === '_blank' ? 'noreferrer' : undefined}
            className="flex items-center gap-0.5 text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer py-2"
          >
            {item.label}
            {item.children.length > 0 && <ChevronDown size={12} className="opacity-60" />}
          </a>
          {item.children.length > 0 && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 hidden group-hover/menu:block group-focus-within/menu:block pt-1">
              <div className="min-w-[160px] p-1.5 rounded-lg border border-border-default bg-bg-1 shadow-lg">
                <SubMenuList items={item.children} depth={2} />
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

/** 좁은 화면: 메뉴 버튼을 누르면 아래로 전체 메뉴가 펼쳐진다. */
function SiteMenuMobile({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div className="@2xl:hidden absolute left-0 right-0 top-full z-50 border-t border-border-default bg-bg-1 shadow-lg px-6 py-3 max-h-[70vh] overflow-y-auto">
      <div className="flex justify-end">
        <button type="button" aria-label="메뉴 닫기" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-text-2"><X size={16} /></button>
      </div>
      <SubMenuList items={items} depth={1} />
    </div>
  )
}

interface NavbarProps {
  logo: string
  logoImage?: string
  links: string[]
  ctaText: string
  /** 메뉴 묶음 위치. 페이지 위 편집에서 메뉴 묶음을 끌어 놓아도 바뀐다. */
  menuAlign?: 'left' | 'center' | 'right'
}

/**
 * 로고 영역: 하나의 div(flex)로 묶어 왼쪽에 이미지(없으면 기본 아이콘), 오른쪽에 글자를 둔다.
 * 이미지는 높이 32px 안에서 비율대로 줄어들어 글자 영역을 침범하지 않는다.
 * data-image-prop: 페이지 위 편집에서 이미지(또는 아이콘)를 더블클릭하면 파일관리자로 로고 이미지를 넣는다.
 */
function Logo({ logo, logoImage: ownImage }: { logo: string; logoImage?: string }) {
  // 블록에 로고 이미지가 없으면 사이트 설정의 로고 이미지를 쓴다 (로고 종류가 '텍스트만'이면 쓰지 않음).
  const site = useSiteSettingsStore((s) => s.settings)
  const logoImage = ownImage || (site?.logoType !== 'text' ? site?.logoImage : '') || undefined
  return (
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      {logoImage ? (
        <img
          data-image-prop="logoImage"
          src={logoImage}
          alt={logo}
          className="h-8 w-auto max-w-[160px] object-contain shrink-0"
        />
      ) : (
        <div
          data-image-prop="logoImage"
          title="더블클릭해서 로고 이미지 넣기"
          className="w-8 h-8 shrink-0 rounded-lg bg-green/10 flex items-center justify-center"
        >
          <div className="w-4 h-4 rounded-full bg-green" />
        </div>
      )}
      {logo && <span className="font-semibold text-[15px] text-text-0 tracking-tight whitespace-nowrap">{logo}</span>}
    </div>
  )
}

const menuAlignClass = {
  left: 'ml-10 mr-auto',
  center: 'mx-auto',
  right: 'ml-auto mr-6',
}

function NavbarDefault({ props, showCta = true }: { props: NavbarProps; showCta?: boolean }) {
  const { logo, logoImage, links = [], ctaText, menuAlign = 'center' } = props
  const siteMenu = useSiteMenu()
  const [open, setOpen] = useState(false)

  return (
    <nav className="relative px-6 @md:px-10 py-4 flex items-center">
      <Logo logo={logo} logoImage={logoImage} />

      {/* 메뉴 묶음: data-drag-prop 이 있으면 페이지 위 편집에서 끌어서 왼쪽/가운데/오른쪽으로 옮길 수 있다. */}
      <div
        data-drag-prop="menuAlign"
        className={`hidden @2xl:flex items-center gap-6 ${menuAlignClass[menuAlign] ?? menuAlignClass.center}`}
      >
        {siteMenu ? (
          <SiteMenuDesktop items={siteMenu} />
        ) : (
          links.map((link, i) => (
            <span
              key={i}
              className="text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer"
            >
              {link}
            </span>
          ))
        )}
      </div>

      {/* CTA + mobile menu */}
      <div className={`flex items-center gap-3 ${menuAlign === 'right' ? '' : 'ml-auto @2xl:ml-0'}`}>
        {showCta && ctaText && (
          <button className="px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold hover:bg-green-dim transition-colors">
            {ctaText}
          </button>
        )}
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
        >
          <Menu size={16} />
        </button>
      </div>
      {open && siteMenu && <SiteMenuMobile items={siteMenu} onClose={() => setOpen(false)} />}
    </nav>
  )
}

function NavbarCentered({ props }: { props: NavbarProps }) {
  const { logo, logoImage, ctaText } = props
  // 사이트 메뉴가 있으면 메인 메뉴만 좌우로 나눠 보여 준다
  const siteMenu = useSiteMenu()
  const links = siteMenu ? siteMenu.map((item) => item.label) : props.links ?? []
  const mid = Math.ceil(links.length / 2)
  const leftLinks = links.slice(0, mid)
  const rightLinks = links.slice(mid)

  return (
    <nav className="px-6 @md:px-10 py-4 flex items-center justify-between">
      {/* Left links */}
      <div className="hidden @2xl:flex items-center gap-6 flex-1">
        {leftLinks.map((link, i) => (
          <span key={i} className="text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer">
            {link}
          </span>
        ))}
      </div>

      {/* Center logo */}
      <Logo logo={logo} logoImage={logoImage} />

      {/* Right links + CTA */}
      <div className="hidden @2xl:flex items-center gap-6 flex-1 justify-end">
        {rightLinks.map((link, i) => (
          <span key={i} className="text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer">
            {link}
          </span>
        ))}
        {ctaText && (
          <button className="px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold hover:bg-green-dim transition-colors ml-2">
            {ctaText}
          </button>
        )}
      </div>

      {/* Mobile menu */}
      <button className="@2xl:hidden w-9 h-9 rounded-lg border border-border-default flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors">
        <Menu size={16} />
      </button>
    </nav>
  )
}

export function NavbarBlock({ block }: { block: BlockConfig }) {
  const props = block.props as unknown as NavbarProps

  switch (block.variant) {
    case 'centered':
      return <NavbarCentered props={props} />
    case 'no-cta':
      return <NavbarDefault props={props} showCta={false} />
    default:
      return <NavbarDefault props={props} />
  }
}
