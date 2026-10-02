import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowUp, ArrowDown, CopyPlus, Trash2, GripHorizontal, MousePointerClick, PanelRight, Sparkles, Undo2, Redo2, Plus, Save, LayoutDashboard, LogOut, X,
} from 'lucide-react'
import { RenderBlock } from '@/blocks/registry'
import type { BlockConfig, BlockType } from '@/blocks/types'
import { createAddable, createBlankSection, findNode, targetContainerFor, type AddableType } from '@/lib/element-tree'
import { ElementEditorProvider } from './ElementEditor'
import { blockMetadata } from '@/lib/block-metadata'
import { clearToken } from '@/lib/builderApi'
import { useConfigStore } from '@/store/configStore'
import { EDITOR_PANEL, useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { RightSidebar } from './RightSidebar'
import { LayersPanel } from './LayersPanel'
import { ReviseBar } from './ReviseBar'
import { isDirty, saveCurrentPage, useIsDirty } from './manualSave'
import { findTextPath, parsePropPath, patchForPath, type PropPath } from './inlineText'
import { FileManagerModal } from './FileManager'
import { uploadImages } from '@/lib/uploadImages'
import { useDraggablePosition } from './useDraggablePosition'

const blockLabelsKo: Partial<Record<BlockType, string>> = {
  navbar: '상단 메뉴', hero: '메인 배너', features: '특징 소개', pricing: '가격표', cta: '행동 유도',
  footer: '하단 정보', testimonials: '고객 후기', stats: '숫자 통계', faq: '자주 묻는 질문', team: '팀 소개',
  contact: '문의하기', newsletter: '소식 받기', logocloud: '로고 모음', divider: '구분선', banner: '띠 배너',
  content: '글 내용', image: '이미지', video: '동영상', gallery: '갤러리',
}
const blockLabels = new Map(blockMetadata.map((m) => [m.type, blockLabelsKo[m.type] ?? m.label]))

function newBlockId(type: string) {
  return `block-${type}-${Date.now().toString(36)}`
}

/** 새 섹션을 고르는 목록. 선택한 섹션 바로 아래, 없으면 하단 정보 위에 넣는다. */
const BASIC_ELEMENTS: { type: AddableType; label: string; english: string }[] = [
  { type: 'text', label: '텍스트', english: 'Text' },
  { type: 'image', label: '이미지', english: 'Image' },
  { type: 'button', label: '버튼', english: 'Button' },
  { type: 'area', label: '영역', english: 'Area (div)' },
]

function AddSectionPanel({ onClose }: { onClose: () => void }) {
  const addBlock = useConfigStore((s) => s.addBlock)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)

  const addChild = useConfigStore((s) => s.addChild)
  const blocks = useConfigStore((s) => s.getActivePageBlocks())
  const targetContainer = targetContainerFor(blocks, selectedBlockId)

  // 새 블록을 넣을 최상위 위치: 선택한 블록(또는 선택한 요소가 들어 있는 섹션) 바로 아래, 없으면 하단 정보 위.
  function insertIndex() {
    const current = useConfigStore.getState().getActivePageBlocks()
    const selectedIndex = current.findIndex((b) => b.id === selectedBlockId || (selectedBlockId && b.children && findNode(b.children, selectedBlockId)))
    const footerIndex = current.findIndex((b) => b.type === 'footer')
    return selectedIndex >= 0 ? selectedIndex + 1 : footerIndex >= 0 ? footerIndex : current.length
  }

  function finish(id: string) {
    selectBlock(id)
    onClose()
    requestAnimationFrame(() => {
      document.querySelector(`[data-block-id="${id}"], [data-element-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function add(type: BlockType) {
    const meta = blockMetadata.find((m) => m.type === type)
    if (!meta) return
    const block: BlockConfig = {
      id: newBlockId(type),
      type,
      variant: meta.variants[0],
      props: structuredClone(meta.defaultProps),
    }
    addBlock(block, insertIndex())
    finish(block.id)
  }

  function addBlankSection() {
    const section = createBlankSection()
    addBlock(section, insertIndex())
    finish(section.id)
  }

  // 기본 요소: 선택한 컨테이너(또는 섹션의 첫 컨테이너)에 넣고, 없으면 새 빈 섹션을 만들어 그 안에 넣는다.
  function addElement(type: AddableType) {
    const element = createAddable(type)
    if (targetContainer) {
      addChild(targetContainer.id, element)
    } else {
      const section = createBlankSection()
      section.children![0].children!.push(element)
      addBlock(section, insertIndex())
    }
    finish(element.id)
  }

  return (
    <div className="admin-light fixed left-1/2 top-14 -translate-x-1/2 z-[61] w-[min(560px,calc(100vw-32px))] max-h-[70vh] overflow-y-auto rounded-xl bg-bg-1 border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-text-0 text-[16px] font-semibold">섹션 추가</h2>
        <button type="button" aria-label="닫기" onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-text-3 hover:text-text-0 hover:bg-bg-3">
          <X size={14} />
        </button>
      </div>
      <div className="text-[13px] font-semibold tracking-wide text-text-3 mb-1">기본 요소 · BASIC ELEMENTS</div>
      <p className="text-text-2 text-[14px] mb-2">
        {targetContainer
          ? '선택한 컨테이너 안에 추가됩니다.'
          : '텍스트·이미지·버튼·여백은 새 빈 섹션 안에 추가됩니다. 섹션이나 컨테이너를 먼저 선택하면 그 안에 들어갑니다.'}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
        <button type="button" onClick={addBlankSection} className="rounded-lg p-3 bg-bg-2 border border-dashed border-green/60 hover:border-green text-left">
          <div className="text-text-0 text-[15px] font-medium">빈 섹션</div>
          <div className="text-text-3 text-[13px]">Blank Section</div>
        </button>
        {BASIC_ELEMENTS.map(({ type, label, english }) => (
          <button key={type} type="button" onClick={() => addElement(type)} className="rounded-lg p-3 bg-bg-2 border border-border-default hover:border-green text-left">
            <div className="text-text-0 text-[15px] font-medium">{label}</div>
            <div className="text-text-3 text-[13px]">{english}</div>
          </button>
        ))}
      </div>

      <div className="text-[13px] font-semibold tracking-wide text-text-3 mb-1">프리셋 블록 · PRESET BLOCKS</div>
      <p className="text-text-2 text-[14px] mb-2">
        {selectedBlockId ? '선택한 섹션 바로 아래에 추가됩니다.' : '페이지 맨 아래(하단 정보 위)에 추가됩니다.'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {blockMetadata.map((meta) => (
          <button
            key={meta.type}
            type="button"
            onClick={() => add(meta.type)}
            className="text-left rounded-lg p-3 bg-bg-2 border border-border-default hover:border-green"
          >
            <div className="text-text-0 text-[15px] font-medium">{blockLabels.get(meta.type)}</div>
            <div className="text-text-3 text-[13px] leading-snug line-clamp-2">{meta.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

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
      className="w-7 h-7 rounded-md flex items-center justify-center text-[#4b5563] hover:text-[#1c54e4] hover:bg-[#eef3ff] disabled:opacity-30"
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
  const [imagePath, setImagePath] = useState<PropPath | null>(null)
  // 메인 페이지를 고칠 때는 메인 폴더, 서브 페이지는 서브 폴더에 올린다.
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const folder = useProjectsStore((s) =>
    s.projects.find((project) => project.id === activeProjectId)?.isHome === false ? 'sub' : 'main',
  )
  const [dropActive, setDropActive] = useState(false)
  // 블록 안의 묶음(예: 상단 메뉴 링크 묶음, data-drag-prop)을 끌어서 왼쪽/가운데/오른쪽으로 옮기기
  const [dragZone, setDragZone] = useState<'left' | 'center' | 'right' | null>(null)
  const suppressClick = useRef(false)

  function startZoneDrag(event: React.PointerEvent<HTMLDivElement>) {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-drag-prop]')
    if (!handle || event.button !== 0 || (event.target as HTMLElement).isContentEditable) return
    const prop = handle.dataset.dragProp!
    const wrapper = event.currentTarget
    const startX = event.clientX
    let moved = false
    let zone: 'left' | 'center' | 'right' = 'center'

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < 6) return
      moved = true
      handle.style.transform = `translateX(${dx}px)`
      handle.style.opacity = '0.7'
      const rect = wrapper.getBoundingClientRect()
      const ratio = (move.clientX - rect.left) / rect.width
      zone = ratio < 1 / 3 ? 'left' : ratio > 2 / 3 ? 'right' : 'center'
      setDragZone(zone)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      handle.style.transform = ''
      handle.style.opacity = ''
      setDragZone(null)
      if (!moved) return
      // 끈 뒤 손을 뗄 때 생기는 클릭이 글자 편집을 시작하지 않게 한 번 막는다.
      suppressClick.current = true
      selectBlock(block.id)
      updateBlockProps(block.id, { [prop]: zone })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 더블클릭하거나 파일을 놓은 곳이 어떤 이미지 prop 인지 찾는다.
  // 이미 있는 이미지는 src 값으로, 빈 이미지 칸은 블록이 붙여 둔 data-image-prop 으로 찾는다.
  function imagePathAt(target: HTMLElement): PropPath | null {
    if (target.closest('[data-editor-ui]')) return null
    const el = target.closest<HTMLElement>('[data-image-prop], img')
    if (!el) return null
    if (el.dataset.imageProp) return parsePropPath(el.dataset.imageProp)
    const src = el.getAttribute('src')
    return src ? findTextPath(block.props, src) : null
  }

  function setImage(path: PropPath, url: string) {
    updateBlockProps(block.id, patchForPath(block.props, path, url))
  }

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
      className={`relative group/edit cursor-pointer outline-offset-[-2px] [&_[data-drag-prop]]:cursor-grab [&_[data-drag-prop]:hover]:outline-1 [&_[data-drag-prop]:hover]:outline-dashed [&_[data-drag-prop]:hover]:outline-[#1c54e4] [&_[data-drag-prop]]:transition-none ${
        selected ? 'outline outline-2 outline-[#1c54e4]' : 'hover:outline hover:outline-1 hover:outline-[#1c54e4]/60'
      }`}
      onPointerDown={startZoneDrag}
      onDoubleClick={(event) => {
        const path = imagePathAt(event.target as HTMLElement)
        if (!path) return
        event.preventDefault()
        selectBlock(block.id)
        setImagePath(path)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        if (!imagePathAt(event.target as HTMLElement)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropActive(true)
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={async (event) => {
        setDropActive(false)
        const path = imagePathAt(event.target as HTMLElement)
        if (!path || event.dataTransfer.files.length === 0) return
        event.preventDefault()
        selectBlock(block.id)
        const [file] = await uploadImages([event.dataTransfer.files[0]], folder)
        if (file) setImage(path, file.url)
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          event.stopPropagation()
          return
        }
        const target = event.target as HTMLElement
        if (target.dataset.inlineEditing || target.closest('[data-section-actions], [data-editor-ui], [data-element-id]')) return
        // 편집 중에는 링크와 버튼이 이동하거나 제출되지 않게 막는다.
        event.preventDefault()
        event.stopPropagation()
        selectBlock(block.id)
        const leaf = textLeaf(target, event.currentTarget)
        if (leaf) startInlineEdit(leaf)
      }}
    >
      <span
        className={`absolute top-1 left-1 z-10 px-2 py-0.5 rounded-md bg-[#1c54e4] text-white text-[13px] font-medium shadow-sm pointer-events-none ${
          selected ? 'opacity-100' : 'opacity-0 group-hover/edit:opacity-100'
        }`}
      >
        {blockLabels.get(block.type) ?? block.type}
      </span>
      {selected && (
        <div
          data-section-actions
          className="absolute top-1 right-1 z-20 flex items-center gap-0.5 p-0.5 rounded-lg bg-white border border-[#e3e6ea] shadow-[0_4px_14px_rgba(15,23,42,0.14)]"
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
            className={`h-7 rounded-md flex items-center justify-center gap-1 text-[13.5px] font-medium ${
              confirmingDelete ? 'px-2 bg-red-500 text-white' : 'w-7 text-[#4b5563] hover:text-red-500 hover:bg-red-50'
            }`}
          >
            <Trash2 size={13} />
            {confirmingDelete && '삭제'}
          </button>
        </div>
      )}
      <RenderBlock block={block} />
      {dragZone && (
        <div className="absolute inset-0 z-10 pointer-events-none grid grid-cols-3">
          {(['left', 'center', 'right'] as const).map((zone) => (
            <div
              key={zone}
              className={`flex items-end justify-center pb-1 text-[13px] font-semibold border-x border-dashed border-[#1c54e4]/40 ${
                dragZone === zone ? 'bg-[#1c54e4]/10 text-[#1c54e4]' : 'text-transparent'
              }`}
            >
              {zone === 'left' ? '왼쪽' : zone === 'center' ? '가운데' : '오른쪽'}
            </div>
          ))}
        </div>
      )}
      {dropActive && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-[#1c54e4]/15 outline-2 outline-dashed outline-[#1c54e4] -outline-offset-4">
          <span className="px-3 py-1.5 rounded-full bg-[#1c54e4] text-white text-[14px] font-semibold">여기에 놓으면 이미지가 바뀝니다</span>
        </div>
      )}
      {imagePath && (
        <FileManagerModal
          initialFolder={folder}
          onClose={() => setImagePath(null)}
          onPick={(url) => {
            setImage(imagePath, url)
            setImagePath(null)
          }}
        />
      )}
    </div>
  )
}

/** 홈페이지 화면 그대로 블록을 그리되, 클릭하면 선택되고 글자는 바로 고칠 수 있다. */
export function EditableBlocks() {
  const blocks = useConfigStore((s) => s.getActivePageBlocks())
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)

  return (
    <ElementEditorProvider>
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
    </ElementEditorProvider>
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
      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 ${
        active ? 'bg-green/10 text-green' : 'text-text-2 hover:bg-bg-2 hover:text-text-0'
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
  editing, canEdit, onToggleEditing,
}: { editing: boolean; canEdit: boolean; onToggleEditing: () => void }) {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  const selectionSeq = useEditorStore((s) => s.selectionSeq)
  const [layersHiddenAt, setLayersHiddenAt] = useState(-1)
  const showLayers = !!selectedBlockId && layersHiddenAt !== selectionSeq

  // 요소를 누르면 레이어와 함께 디자인 패널도 연다. 같은 요소를 다시 눌러도 다시 열린다.
  useEffect(() => {
    if (selectedBlockId) setPanelOpen(true)
  }, [selectedBlockId, selectionSeq])
  const setCanvasInset = useEditorStore((s) => s.setCanvasInset)
  const leftInset = showLayers ? EDITOR_PANEL.layer : 0
  const rightInset = panelOpen ? EDITOR_PANEL.design : 0

  // 펼친 패널 너비만큼 페이지를 안쪽으로 밀어, 편집 중에도 홈페이지 전체가 보이게 한다.
  useEffect(() => {
    setCanvasInset(leftInset, rightInset)
  }, [leftInset, rightInset, setCanvasInset])
  const [addOpen, setAddOpen] = useState(false)
  const { ref: toolbarRef, position: toolbarPos, onHandlePointerDown } = useDraggablePosition('webbuilder-toolbar-pos')
  const [aiOpen, setAiOpen] = useState(false)
  const undo = useConfigStore((s) => s.undo)
  const redo = useConfigStore((s) => s.redo)
  const canUndo = useConfigStore((s) => s.undoStack.length > 0)
  const canRedo = useConfigStore((s) => s.redoStack.length > 0)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const dirty = useIsDirty()
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving || !isDirty()) return
    setSaving(true)
    await saveCurrentPage()
    setSaving(false)
  }

  function ensureEditing() {
    if (!editing) onToggleEditing()
  }

  // Ctrl+S(⌘S)로 저장. 저장하지 않은 채 새로고침하거나 창을 닫으면 브라우저가 한 번 묻는다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })

  // 관리자 화면으로 나갈 때 저장하지 않은 변경이 있으면 확인한다.
  function leave(go: () => void) {
    if (editing && isDirty() && !window.confirm('저장하지 않은 변경이 있습니다. 저장하지 않고 나가면 변경 내용이 사라집니다. 나갈까요?')) return
    go()
  }

  return (
    <>
      <nav
        ref={toolbarRef}
        aria-label="관리자 편집 도구"
        style={toolbarPos ? {
          left: Math.min(
            Math.max(toolbarPos.x, leftInset + 12),
            Math.max(16, window.innerWidth - rightInset - 72),
          ),
          top: toolbarPos.y,
        } : undefined}
        className={`admin-light fixed z-[61] flex max-h-[calc(100dvh-2rem)] flex-col items-center gap-1 overflow-y-auto p-1.5 rounded-xl bg-bg-1 border border-border-default shadow-[0_8px_28px_rgba(15,23,42,0.16)] backdrop-blur ${
          toolbarPos ? '' : showLayers ? 'left-[272px] bottom-4' : 'left-4 bottom-4'
        }`}
      >
        <button
          type="button"
          title="끌어서 옮기기"
          aria-label="도구 막대 옮기기"
          onPointerDown={onHandlePointerDown}
          className="w-9 h-5 flex items-center justify-center text-text-3 hover:text-text-0 cursor-grab active:cursor-grabbing touch-none"
        >
          <GripHorizontal size={16} strokeWidth={2.5} />
        </button>
        {editing && (
          <div className="px-1 pb-0.5 text-center text-[12px] font-bold leading-tight text-[#1c54e4]">편집 모드</div>
        )}
        <ToolButton label={editing ? '편집 끝내기' : '이 페이지 바로 수정'} active={editing} disabled={!canEdit} onClick={onToggleEditing}>
          <MousePointerClick size={18} strokeWidth={2.5} />
        </ToolButton>
        <div className="relative">
          <ToolButton label={dirty ? '저장 (Ctrl+S)' : '저장됨'} active={dirty} disabled={!dirty || saving} onClick={save}>
            <Save size={18} strokeWidth={2.5} />
          </ToolButton>
          {dirty && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-orange-400 ring-2 ring-bg-1" />}
        </div>
        <ToolButton label="섹션 추가" active={addOpen} onClick={() => { ensureEditing(); setAddOpen(!addOpen) }}>
          <Plus size={18} strokeWidth={2.5} />
        </ToolButton>
        <ToolButton label="속성, 디자인 패널" active={panelOpen} onClick={() => { ensureEditing(); setPanelOpen(!panelOpen) }}>
          <PanelRight size={18} strokeWidth={2.5} />
        </ToolButton>
        <ToolButton label="AI 수정" active={aiOpen} onClick={() => { ensureEditing(); setAiOpen(!aiOpen) }}>
          <Sparkles size={18} strokeWidth={2.5} />
        </ToolButton>
        <ToolButton label="실행 취소" disabled={!canUndo} onClick={() => { ensureEditing(); undo() }}>
          <Undo2 size={18} strokeWidth={2.5} />
        </ToolButton>
        <ToolButton label="다시 실행" disabled={!canRedo} onClick={() => { ensureEditing(); redo() }}>
          <Redo2 size={18} strokeWidth={2.5} />
        </ToolButton>
        <div className="w-6 h-px bg-border-default my-1" />
        <ToolButton label="대시보드" onClick={() => leave(() => navigate('/admin'))}>
          <LayoutDashboard size={18} strokeWidth={2.5} />
        </ToolButton>
        <ToolButton
          label="로그아웃"
          onClick={() => leave(() => {
            clearToken()
            window.location.href = '/'
          })}
        >
          <LogOut size={18} strokeWidth={2.5} />
        </ToolButton>
      </nav>

      {showLayers && <LayersPanel open onToggle={() => setLayersHiddenAt(selectionSeq)} />}

      {addOpen && <AddSectionPanel onClose={() => setAddOpen(false)} />}

      {aiOpen && (
        <div
          className="admin-light fixed bottom-4 -translate-x-1/2 z-[62] max-h-[min(50vh,420px)] w-[min(640px,calc(100vw-120px))] overflow-y-auto rounded-xl border border-border-default shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
          style={{ left: `calc(${leftInset}px + (100vw - ${leftInset + rightInset}px) / 2)` }}
        >
          <ReviseBar />
        </div>
      )}

      {panelOpen && (
        <div className="admin-light fixed right-0 top-0 bottom-0 z-[60] flex border-l border-border-default bg-bg-1">
          <RightSidebar onCollapse={() => setPanelOpen(false)} />
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

/** 편집을 끝낼 때 저장하지 않은 변경이 있으면 묻는 창. */
export function UnsavedChangesDialog({
  onSave, onDiscard, onCancel,
}: { onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  return (
    <div data-editor-ui className="admin-light fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="저장하지 않은 변경"
        onClick={(event) => event.stopPropagation()}
        className="w-[min(400px,100%)] rounded-xl bg-bg-1 border border-border-default p-5 shadow-2xl"
      >
        <h2 className="text-text-0 text-[17px] font-semibold mb-1">저장하지 않은 변경이 있습니다</h2>
        <p className="text-text-2 text-[15px] mb-5">저장해야 홈페이지에 반영됩니다. 어떻게 할까요?</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onSave} className="h-9 rounded-lg bg-green text-black text-[15px] font-semibold">저장하고 끝내기</button>
          <button type="button" onClick={onDiscard} className="h-9 rounded-lg border border-border-default text-text-1 text-[15px] hover:text-red-400">저장하지 않고 끝내기</button>
          <button type="button" onClick={onCancel} className="h-9 rounded-lg text-text-2 text-[15px] hover:text-text-0">계속 편집</button>
        </div>
      </div>
    </div>
  )
}
