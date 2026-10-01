import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUp, ArrowDown, CopyPlus, Trash2, GripHorizontal, MousePointerClick, PanelRight, Sparkles, Undo2, Redo2, Pencil, LayoutDashboard, LogOut, X,
} from 'lucide-react'
import { RenderBlock } from '@/blocks/registry'
import type { BlockConfig } from '@/blocks/types'
import { blockMetadata } from '@/lib/block-metadata'
import { clearToken } from '@/lib/builderApi'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { RightSidebar } from './RightSidebar'
import { ReviseBar } from './ReviseBar'
import { useAutoSaveToProject } from './useAutoSaveToProject'
import { findTextPath, patchForPath } from './inlineText'
import { useDraggablePosition } from './useDraggablePosition'

const blockLabels = new Map(blockMetadata.map((m) => [m.type, m.label]))

// 클릭한 곳에서 글자만 들어 있는 가장 안쪽 요소를 찾는다.
function textLeaf(target: HTMLElement, root: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target
  while (el && el !== root) {
    if (el.childElementCount === 0 && el.textContent?.trim()) return el
    el = el.parentElement
  }
  return null
}

function SectionButton({
  label, disabled, onClick, children,
}: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-7 h-7 rounded-md flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function EditableBlock({
  block, selected, index, total,
}: { block: BlockConfig; selected: boolean; index: number; total: number }) {
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const removeBlock = useConfigStore((s) => s.removeBlock)
  const duplicateBlock = useConfigStore((s) => s.duplicateBlock)
  const moveBlock = useConfigStore((s) => s.moveBlock)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function startInlineEdit(leaf: HTMLElement) {
    const original = leaf.textContent?.trim() ?? ''
    const path = findTextPath(block.props, original)
    if (!path) return false

    leaf.contentEditable = 'plaintext-only'
    leaf.dataset.inlineEditing = 'true'
    leaf.focus()
    const range = document.createRange()
    range.selectNodeContents(leaf)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    let cancelled = false
    let done = false
    const finish = () => {
      if (done) return
      done = true
      leaf.removeEventListener('keydown', onKey)
      leaf.removeEventListener('blur', finish)
      leaf.contentEditable = 'false'
      delete leaf.dataset.inlineEditing
      const next = leaf.textContent?.trim() ?? ''
      if (cancelled || !next || next === original) {
        leaf.textContent = original
        return
      }
      updateBlockProps(block.id, patchForPath(block.props, path, next))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelled = true
        finish()
        leaf.blur()
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        finish()
        leaf.blur()
      }
    }
    leaf.addEventListener('keydown', onKey)
    leaf.addEventListener('blur', finish)
    return true
  }

  return (
    <div
      data-block-id={block.id}
      className={`relative group/edit cursor-pointer outline-offset-[-2px] ${
        selected ? 'outline outline-2 outline-[#22c55e]' : 'hover:outline hover:outline-2 hover:outline-[#22c55e]/50'
      }`}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement
        if (target.dataset.inlineEditing || target.closest('[data-section-actions]')) return
        // 편집 중에는 링크와 버튼이 이동하거나 제출되지 않게 막는다.
        event.preventDefault()
        event.stopPropagation()
        selectBlock(block.id)
        const leaf = textLeaf(target, event.currentTarget)
        if (leaf) startInlineEdit(leaf)
      }}
    >
      <span
        className={`absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-[#22c55e] text-[#09090b] text-[10px] font-semibold pointer-events-none ${
          selected ? 'opacity-100' : 'opacity-0 group-hover/edit:opacity-100'
        }`}
      >
        {blockLabels.get(block.type) ?? block.type}
      </span>
      {selected && (
        <div
          data-section-actions
          className="absolute top-1 right-1 z-20 flex items-center gap-0.5 p-0.5 rounded-lg bg-[#09090b]/90 border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <SectionButton label="위로 옮기기" disabled={index === 0} onClick={() => moveBlock(index, index - 1)}>
            <ArrowUp size={13} />
          </SectionButton>
          <SectionButton label="아래로 옮기기" disabled={index === total - 1} onClick={() => moveBlock(index, index + 1)}>
            <ArrowDown size={13} />
          </SectionButton>
          <SectionButton label="섹션 복제" onClick={() => duplicateBlock(block.id)}>
            <CopyPlus size={13} />
          </SectionButton>
          <button
            type="button"
            aria-label="섹션 삭제"
            title="섹션 삭제"
            onClick={() => {
              if (!confirmingDelete) {
                setConfirmingDelete(true)
                return
              }
              removeBlock(block.id)
              selectBlock(null)
            }}
            onMouseLeave={() => setConfirmingDelete(false)}
            className={`h-7 rounded-md flex items-center justify-center gap-1 text-[11.5px] font-medium ${
              confirmingDelete ? 'px-2 bg-red-500 text-white' : 'w-7 text-white/80 hover:text-red-400 hover:bg-white/10'
            }`}
          >
            <Trash2 size={13} />
            {confirmingDelete && '삭제'}
          </button>
        </div>
      )}
      <RenderBlock block={block} />
    </div>
  )
}

/** 홈페이지 화면 그대로 블록을 그리되, 클릭하면 선택되고 글자는 바로 고칠 수 있다. */
export function EditableBlocks() {
  const blocks = useConfigStore((s) => s.getActivePageBlocks())
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  useAutoSaveToProject()

  return (
    <main>
      {blocks.map((block, index) => (
        <EditableBlock
          key={block.id}
          block={block}
          selected={selectedBlockId === block.id}
          index={index}
          total={blocks.length}
        />
      ))}
    </main>
  )
}

function ToolButton({
  label, active, disabled, onClick, children,
}: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${
        active ? 'bg-green text-black' : 'text-text-1 hover:bg-bg-3 hover:text-text-0'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * 로그인한 관리자에게만 보이는 왼쪽 편집 도구 막대.
 * 테마 CSS 변수가 걸린 사이트 영역 밖에 두어야 관리자 다크 테마가 유지된다.
 */
export function OnPageToolbar({
  editing, onToggleEditing, onOpenEditor,
}: { editing: boolean; onToggleEditing: () => void; onOpenEditor: () => void }) {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(true)
  const { ref: toolbarRef, position: toolbarPos, onHandlePointerDown } = useDraggablePosition('webbuilder-toolbar-pos')
  const [aiOpen, setAiOpen] = useState(false)
  const undo = useConfigStore((s) => s.undo)
  const redo = useConfigStore((s) => s.redo)
  const canUndo = useConfigStore((s) => s.undoStack.length > 0)
  const canRedo = useConfigStore((s) => s.redoStack.length > 0)
  const selectBlock = useEditorStore((s) => s.selectBlock)

  return (
    <>
      <nav
        ref={toolbarRef}
        aria-label="관리자 편집 도구"
        style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y } : undefined}
        className={`fixed z-[60] flex flex-col items-center gap-1 p-1.5 rounded-xl bg-bg-1/95 border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur ${
          toolbarPos ? '' : 'left-4 bottom-4'
        }`}
      >
        <button
          type="button"
          title="끌어서 옮기기"
          aria-label="도구 막대 옮기기"
          onPointerDown={onHandlePointerDown}
          className="w-9 h-5 flex items-center justify-center text-text-3 hover:text-text-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripHorizontal size={14} />
        </button>
        <ToolButton label={editing ? '편집 끝내기' : '이 페이지 바로 수정'} active={editing} onClick={onToggleEditing}>
          <MousePointerClick size={16} />
        </ToolButton>
        {editing && (
          <>
            <ToolButton label="속성, 디자인 패널" active={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
              <PanelRight size={16} />
            </ToolButton>
            <ToolButton label="AI 수정" active={aiOpen} onClick={() => setAiOpen(!aiOpen)}>
              <Sparkles size={16} />
            </ToolButton>
            <ToolButton label="실행 취소" disabled={!canUndo} onClick={undo}>
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton label="다시 실행" disabled={!canRedo} onClick={redo}>
              <Redo2 size={16} />
            </ToolButton>
          </>
        )}
        <div className="w-6 h-px bg-border-default my-1" />
        <ToolButton label="이 페이지 수정 (전체 에디터)" onClick={onOpenEditor}>
          <Pencil size={16} />
        </ToolButton>
        <ToolButton label="대시보드" onClick={() => navigate('/admin')}>
          <LayoutDashboard size={16} />
        </ToolButton>
        <ToolButton
          label="로그아웃"
          onClick={() => {
            clearToken()
            window.location.href = '/'
          }}
        >
          <LogOut size={16} />
        </ToolButton>
      </nav>

      {editing && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-1/95 border border-border-default text-[12px] text-text-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <span className="w-1.5 h-1.5 rounded-full bg-green" />
          편집 모드 · 글자를 눌러 바로 고치고, 고친 내용은 자동 저장됩니다
        </div>
      )}

      {editing && aiOpen && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[60] w-[min(640px,calc(100vw-120px))] rounded-xl overflow-hidden border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <ReviseBar />
        </div>
      )}

      {editing && panelOpen && (
        <div className="fixed right-3 top-14 bottom-3 z-[60] flex rounded-xl overflow-hidden border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            aria-label="패널 닫기"
            onClick={() => {
              setPanelOpen(false)
              selectBlock(null)
            }}
            className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-md flex items-center justify-center text-text-3 hover:text-text-0 hover:bg-bg-3"
          >
            <X size={13} />
          </button>
          <RightSidebar />
        </div>
      )}
    </>
  )
}

export function VisitorLoginButton() {
  return (
    <Link
      to="/login"
      title="관리자 로그인"
      aria-label="관리자 로그인"
      className="fixed left-4 bottom-4 z-50 w-9 h-9 rounded-lg flex items-center justify-center bg-[#09090b]/85 text-white/80 border border-white/10 hover:text-white hover:border-[#22c55e]/60 transition-all"
    >
      <LogOut size={15} className="rotate-180" />
    </Link>
  )
}
