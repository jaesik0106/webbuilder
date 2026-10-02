import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, CopyPlus, GripVertical, Trash2, Group, Ungroup, X, Type, ImageIcon, MousePointerClick, SquareDashed } from 'lucide-react'
import { ElementEditorContext, type ElementEditorApi, type ElementItemProps, type ElementListProps } from '@/blocks/elements/editorContext'
import { createAddable, findNode, isLeafType, type AddableType } from '@/lib/element-tree'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { FileManagerModal } from './FileManager'

/**
 * 페이지 위 편집에서 기본 요소(section > container > text/image/button/spacer)를 다루는 부분.
 * - 요소를 누르면 선택되고 속성 패널이 그 요소로 바뀐다
 * - 텍스트는 더블클릭해서 바로 고치고, 이미지는 더블클릭하면 파일관리자가 열린다
 * - 손잡이(⋮⋮)를 끌어 같은 컨테이너 안 순서를 바꾸거나 다른 컨테이너로 옮긴다 (@dnd-kit)
 */

const LABELS: Record<string, string> = {
  section: '섹션', container: '컨테이너', text: '텍스트', image: '이미지', button: '버튼', spacer: '여백',
}

// 컨테이너(그룹, 영역) 선택 막대의 추가 버튼. "영역"은 안쪽 컨테이너(div)를 만든다.
const QUICK_ADD: { type: AddableType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: '텍스트', icon: Type },
  { type: 'image', label: '이미지', icon: ImageIcon },
  { type: 'button', label: '버튼', icon: MousePointerClick },
  { type: 'area', label: '영역', icon: SquareDashed },
]

const DROP_PREFIX = 'drop:'

// 포인터 아래에 요소가 있으면 그 요소를, 없으면 포인터가 있는 컨테이너 빈 곳을, 둘 다 없으면 가장 가까운 것을 고른다.
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  const items = within.filter((hit) => !String(hit.id).startsWith(DROP_PREFIX))
  if (items.length > 0) return items
  if (within.length > 0) return within
  return closestCenter(args)
}

function BarButton({ label, onClick, disabled, children, danger }: {
  label: string; onClick: () => void; disabled?: boolean; children: ReactNode; danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`h-8 min-w-8 px-1.5 rounded-md flex items-center justify-center gap-1 text-[14.5px] text-[#4b5563] hover:bg-[#eef3ff] hover:text-[#1c54e4] disabled:opacity-30 ${danger ? 'hover:!text-red-500 hover:!bg-red-50' : ''}`}
    >
      {children}
    </button>
  )
}

function EditorItem({ node, style, children }: ElementItemProps) {
  const selectedId = useEditorStore((s) => s.selectedBlockId)
  const multiSelected = useEditorStore((s) => s.selectedIds.length > 1 && s.selectedIds.includes(node.id))
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const toggleSelect = useEditorStore((s) => s.toggleSelect)
  const { updateBlockProps, removeBlock, duplicateBlock, moveNode, addChild, ungroupNode } = useConfigStore()
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const folder = useProjectsStore((s) =>
    s.projects.find((project) => project.id === activeProjectId)?.isHome === false ? 'sub' : 'main',
  )
  const [pickingImage, setPickingImage] = useState(false)
  const leaf = isLeafType(node.type)
  const isContainer = node.type === 'container'

  const sortable = useSortable({ id: node.id, disabled: !leaf })
  const droppable = useDroppable({ id: `${DROP_PREFIX}${node.id}`, disabled: !isContainer })
  const selected = selectedId === node.id && !multiSelected
  const canvasLeft = useEditorStore((s) => s.canvasLeft)
  const canvasRight = useEditorStore((s) => s.canvasRight)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const pageScale = canvasLeft + canvasRight > 0 ? Math.max(viewportWidth - canvasLeft - canvasRight, 1) / viewportWidth : 1
  const barScale = pageScale < 0.98 ? 1 / pageScale : 1

  function siblings() {
    const blocks = useConfigStore.getState().getActivePageBlocks()
    const found = findNode(blocks, node.id)
    return found?.parent ? { parent: found.parent, index: found.index, count: found.parent.children!.length } : null
  }
  const position = siblings()

  function editTextInline(target: HTMLElement) {
    const el = target.closest<HTMLElement>('[data-element="text"] > div') ?? (target.firstElementChild as HTMLElement | null)
    if (!el) return
    const original = String(node.props.content ?? '')
    el.contentEditable = 'plaintext-only'
    el.focus()
    const finish = () => {
      el.contentEditable = 'false'
      el.removeEventListener('blur', finish)
      el.removeEventListener('keydown', onKey)
      const next = el.innerText.replace(/\n$/, '')
      if (next !== original) updateBlockProps(node.id, { content: next })
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        el.innerText = original
        el.blur()
      }
    }
    el.addEventListener('blur', finish)
    el.addEventListener('keydown', onKey)
  }

  return (
    <div
      ref={(el) => {
        sortable.setNodeRef(el)
        droppable.setNodeRef(el)
      }}
      data-element={node.type}
      data-element-id={node.id}
      style={{
        ...style,
        position: 'relative',
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
        outline: selected
          ? '2px solid #1c54e4'
          : multiSelected
            ? '2px solid #7c3aed'
            : droppable.isOver
            ? '2px dashed #1c54e4'
            : undefined,
        outlineOffset: 2,
      }}
      className={selected ? '' : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#1c54e4]/70'}
      onClick={(event) => {
        if ((event.target as HTMLElement).isContentEditable) return
        event.preventDefault()
        event.stopPropagation()
        // Shift+클릭: 여러 개 선택 (묶기용)
        if (event.shiftKey) toggleSelect(node.id)
        else selectBlock(node.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (node.type === 'text') editTextInline(event.target as HTMLElement)
        if (node.type === 'image') setPickingImage(true)
      }}
    >
      {children}

      {selected && (
        <div
          data-editor-ui
          className="absolute -top-11 left-0 z-30 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-white border border-[#e3e6ea] shadow-[0_4px_14px_rgba(15,23,42,0.14)] whitespace-nowrap"
          style={{ transform: `scale(${barScale})`, transformOrigin: 'bottom left' }}
          onClick={(event) => event.stopPropagation()}
        >
          {leaf && (
            <span
              {...sortable.attributes}
              {...sortable.listeners}
              title="끌어서 옮기기"
              className="h-8 w-6 flex items-center justify-center text-[#9aa0a6] hover:text-[#1c54e4] cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical size={16} />
            </span>
          )}
          <span className="px-2 py-1 mr-0.5 rounded bg-[#1c54e4] text-[14px] font-medium text-white">
            {isContainer && position?.parent.type === 'container' ? '영역' : LABELS[node.type] ?? node.type}
          </span>
          {isContainer && QUICK_ADD.map(({ type, label, icon: Icon }) => (
            <BarButton
              key={type}
              label={`${label} 추가`}
              onClick={() => {
                const child = createAddable(type)
                addChild(node.id, child)
                selectBlock(child.id)
              }}
            >
              <Icon size={16} />
              {label}
            </BarButton>
          ))}
          {position && (
            <>
              <BarButton label="앞으로" disabled={position.index === 0} onClick={() => moveNode(node.id, position.parent.id, position.index - 1)}>
                <ArrowUp size={16} />
              </BarButton>
              <BarButton label="뒤로" disabled={position.index === position.count - 1} onClick={() => moveNode(node.id, position.parent.id, position.index + 1)}>
                <ArrowDown size={16} />
              </BarButton>
            </>
          )}
          {isContainer && position && position.parent.type === 'container' && (
            <BarButton
              label="그룹 풀기 (Ctrl+Shift+G)"
              onClick={() => {
                ungroupNode(node.id)
                selectBlock(null)
              }}
            >
              <Ungroup size={16} />
              풀기
            </BarButton>
          )}
          <BarButton label="복제" onClick={() => duplicateBlock(node.id)}>
            <CopyPlus size={16} />
          </BarButton>
          <BarButton
            label="삭제"
            danger
            onClick={() => {
              removeBlock(node.id)
              selectBlock(null)
            }}
          >
            <Trash2 size={16} />
          </BarButton>
        </div>
      )}

      {pickingImage && (
        <FileManagerModal
          initialFolder={folder}
          onClose={() => setPickingImage(false)}
          onPick={(url) => {
            updateBlockProps(node.id, { src: url })
            setPickingImage(false)
          }}
        />
      )}
    </div>
  )
}

function EditorList({ container, children }: ElementListProps) {
  const ids = useMemo(
    () => (container.children ?? []).filter((child) => isLeafType(child.type)).map((child) => child.id),
    [container.children],
  )
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      {children}
      {(container.children ?? []).length === 0 && (
        <div className="w-full flex items-center justify-center text-[14px] text-text-3 border border-dashed border-border-default rounded-md py-6 pointer-events-none">
          비어 있음 · 선택해서 텍스트, 이미지, 버튼, 영역을 추가하세요
        </div>
      )}
    </SortableContext>
  )
}

const editorApi: ElementEditorApi = { Item: EditorItem, List: EditorList }

/** Shift+클릭으로 여러 개를 골랐을 때 화면 아래에 뜨는 막대: 그룹으로 묶기 / 선택 해제 */
function MultiSelectBar() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const groupNodes = useConfigStore((s) => s.groupNodes)
  const blocks = useConfigStore((s) => s.getActivePageBlocks())
  if (selectedIds.length < 2) return null
  const parents = new Set(selectedIds.map((id) => findNode(blocks, id)?.parent?.id))
  const sameParent = parents.size === 1 && !parents.has(undefined)
  return (
    <div data-editor-ui className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#e3e6ea] text-[#363b3f] text-[14.5px] shadow-2xl">
      <span>{selectedIds.length}개 선택</span>
      {sameParent ? (
        <button
          type="button"
          onClick={() => {
            const id = groupNodes(selectedIds)
            selectBlock(id)
          }}
          className="h-8 px-3 rounded-lg bg-[#1c54e4] text-white font-semibold inline-flex items-center gap-1.5"
        >
          <Group size={14} />
          그룹으로 묶기 (Ctrl+G)
        </button>
      ) : (
        <span className="text-[#9aa0a6]">같은 그룹 안의 요소만 묶을 수 있습니다</span>
      )}
      <button type="button" aria-label="선택 해제" onClick={() => selectBlock(null)} className="w-8 h-8 rounded-lg hover:bg-[#f3f4f6] flex items-center justify-center">
        <X size={14} />
      </button>
    </div>
  )
}

/** 편집 중인 페이지 전체를 감싸서, 기본 요소에 선택과 끌어 놓기를 붙인다. */
export function ElementEditorProvider({ children }: { children: ReactNode }) {
  const moveNode = useConfigStore((s) => s.moveNode)

  // Ctrl+G: 고른 요소 묶기, Ctrl+Shift+G: 고른 그룹 풀기
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'g') return
      const target = event.target as HTMLElement
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      const { selectedIds, selectedBlockId, selectBlock } = useEditorStore.getState()
      const { groupNodes, ungroupNode } = useConfigStore.getState()
      if (event.shiftKey) {
        if (selectedBlockId) {
          ungroupNode(selectedBlockId)
          selectBlock(null)
        }
      } else if (selectedIds.length > 1) {
        selectBlock(groupNodes(selectedIds))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const blocks = useConfigStore.getState().getActivePageBlocks()
    const overId = String(over.id)
    if (overId.startsWith(DROP_PREFIX)) {
      // 컨테이너 빈 곳에 놓으면 그 컨테이너 맨 뒤로
      const containerId = overId.slice(DROP_PREFIX.length)
      const container = findNode(blocks, containerId)?.node
      if (container) moveNode(String(active.id), containerId, container.children?.length ?? 0)
      return
    }
    const target = findNode(blocks, overId)
    if (!target) return
    // 컨테이너 위에 놓으면 그 컨테이너 맨 뒤로
    if (target.node.type === 'container') {
      moveNode(String(active.id), target.node.id, target.node.children?.length ?? 0)
      return
    }
    // 다른 요소 위에 놓으면 그 요소 자리로 (같은 컨테이너면 순서 변경, 다른 컨테이너면 이동).
    // 요소는 컨테이너 안에만 들어가므로 부모가 컨테이너가 아니면 무시한다.
    if (target.parent?.type === 'container') moveNode(String(active.id), target.parent.id, target.index)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={onDragEnd}>
      <ElementEditorContext.Provider value={editorApi}>{children}</ElementEditorContext.Provider>
      <MultiSelectBar />
    </DndContext>
  )
}
