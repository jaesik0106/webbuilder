import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MousePointerClick, FolderOpen, FileText, Bot, Settings, ExternalLink, LogOut, Menu, Home,
} from 'lucide-react'
import { clearToken } from '@/lib/builderApi'

type MenuItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

const menu: MenuItem[] = [
  { to: '/admin', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/', label: '홈페이지 바로 수정', icon: MousePointerClick, end: true },
  { to: '/admin/pages', label: '페이지', icon: FileText },
  { to: '/admin/files', label: '파일 관리자', icon: FolderOpen },
  { to: '/settings', label: '사이트 설정', icon: Settings },
  { to: '/admin/ai', label: 'AI 수정 기록', icon: Bot },
]

function logout() {
  clearToken()
  window.location.href = '/'
}

// 기존 10PAGE 관리자처럼 선택된 메뉴는 파란 글자와 왼쪽 파란 선으로 표시한다.
const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 h-11 pl-5 pr-4 text-[14px] border-l-[3px] transition-colors ${
    isActive
      ? 'border-green text-green font-semibold bg-green-glow2'
      : 'border-transparent text-text-1 hover:text-green hover:bg-bg-2'
  }`

function MenuLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {menu.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={itemClass} onClick={onNavigate}>
          <Icon size={16} />
          {label}
        </NavLink>
      ))}
    </>
  )
}

function Logo() {
  return (
    <NavLink to="/admin" className="flex items-center gap-2 select-none">
      <span className="font-display font-extrabold text-[22px] tracking-tight text-green">웹빌더</span>
    </NavLink>
  )
}

/** 관리자 화면 왼쪽 메뉴. */
export function AdminSidebar() {
  return (
    <aside className="hidden md:flex w-[230px] shrink-0 flex-col bg-bg-1 border-r border-border-default">
      <div className="h-14 flex items-center px-6">
        <Logo />
      </div>
      <nav aria-label="관리자 메뉴" className="flex-1 overflow-y-auto py-3">
        <MenuLinks />
      </nav>
      <div className="p-4">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 h-9 rounded-md border border-green text-green text-[13px] font-medium hover:bg-green-glow"
        >
          <ExternalLink size={14} />
          홈페이지 새 창으로 보기
        </a>
      </div>
    </aside>
  )
}

/** 본문 위 파란 상단 바. 좁은 화면에서는 메뉴 버튼으로 왼쪽 메뉴를 펼친다. */
export function AdminTopBar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="relative h-14 shrink-0 flex items-center gap-2 px-4 bg-green text-white">
      <button
        type="button"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded hover:bg-white/10"
      >
        <Menu size={18} />
      </button>
      <div className="ml-auto flex items-center gap-1 text-[13px] font-medium">
        <a href="/" className="h-9 px-3 flex items-center gap-1.5 rounded hover:bg-white/10" title="홈페이지">
          <Home size={15} />
          <span className="hidden sm:inline">홈페이지</span>
        </a>
        <button type="button" onClick={logout} className="h-9 px-3 flex items-center gap-1.5 rounded hover:bg-white/10">
          <LogOut size={15} />
          로그아웃
        </button>
      </div>

      {open && (
        <nav aria-label="관리자 메뉴" className="md:hidden absolute top-14 left-0 right-0 z-50 bg-bg-1 border-b border-border-default py-2 shadow-lg">
          <MenuLinks onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </header>
  )
}
