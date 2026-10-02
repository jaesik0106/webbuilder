import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Group, Layers } from 'lucide-react'
import type { BlockConfig, BlockType } from '@/blocks/types'
import { findNode, layerDropTarget, type LayerDropPlace } from '@/lib/element-tree'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'

const DROP_PREFIX = 'layer-drop:'

const typeLabels: Partial<Record<BlockType, string>> = {
  navbar: '상단 메뉴', hero: '메인 배너', features: '특징 소개', pricing: '가격표', cta: '행동 유도',
  footer: '하단 정보', testimonials: '고객 후기', stats: '숫자 통계', faq: '자주 묻는 질문', team: '팀 소개',
  contact: '문의하기', newsletter: '소식 받기', logocloud: '로고 모음', divider: '구분선', banner: '띠 배너',
  content: '글 내용', image: '이미지', video: '동영상', gallery: '갤러리',
  section: '섹션', container: '컨테이너', text: '텍스트', button: '버튼', spacer: '여백',
}

function layerName(node: BlockConfig) {
  if (node.type === 'text') {
    const content = String(node.props.content ?? '').replace(/\s+/g, ' ').trim()
    return content ? content.slice(0, 28) : '텍스트'
  }
  if (node.type === 'button') return String(node.props.text || '버튼')
  if (node.type === 'image') return String(node.props.alt || '이미지')
  if (node.type === 'container' && node.props.maxWidth === '100%') return '영역'
  return typeLabels[node.type] ?? node.type
}

function parentIds(blocks: BlockConfig[]): string[] {
  const ids: string[] = []
  const walk = (nodes: BlockConfig[]) => {
    for (const node of nodes) {
      if (node.children?.length) {
        ids.push(node.id)
        walk(node.children)
      }
    }
  }
  walk(blocks)
  return ids
}

function ancestorIds(blocks: BlockConfig[], id: string): string[] {
  const found = findNode(blocks, id)
  if (!found?.parent) return []
  return [...ancestorIds(blocks, found.parent.id), found.parent.id]
}

function visibleIds(blocks: BlockConfig[], openIds: Set<string>): string[] {
  const ids: string[] = []
  const walk = (nodes: BlockConfig[]) => {
    for (const node of nodes) {
      ids.push(node.id)
      if (node.children?.length && openIds.has(node.id)) walk(node.children)
    }
  }
  walk(blocks)
  return ids
}

/** 포인터가 행의 위·가운데·아래 중 어디인지. 컨테이너가 아니면 위/아래만 있다. */
function placeOnRow(event: DragOverEvent | DragEndEvent, canHoldChildren: boolean): LayerDropPlace {
  const rect = event.over?.rect
  const translated = event.active.rect.current.translated
  if (!rect || !translated || rect.height <= 0) return canHoldChildren ? 'inside' : 'before'
  const y = translated.top + translated.height / 2
  const ratio = (y - rect.top) / rect.height
  if (!canHoldChildren) return ratio > 0.5 ? 'after' : 'before'
  if (ratio < 0.28) return 'before'
  if (ratio > 0.72) return 'after'
  return 'inside'
}

function LayerRow({
  node, depth, openIds, onToggle, dropHint, onSelect,
}: {
  node: BlockConfig
  depth: number
  openIds: Set<string>
  onToggle: (id: string) => void
  dropHint: { id: string; place: LayerDropPlace } | null
  onSelect: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
}) {
  const selected = useEditorStore((s) => s.selectedIds.includes(node.id))
  const hasChildren = !!node.children?.length
  const open = openIds.has(node.id)
  const canDrag = !!findNode(useConfigStore.getState().getActivePageBlocks(), node.id)?.parent
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: node.id, disabled: !canDrag })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `${DROP_PREFIX}${node.id}` })
  const hint = isOver && dropHint?.id === node.id ? dropHint.place : null

  return (
    <div>
      <button
        type="button"
        ref={(element) => {
          setDragRef(element)
          setDropRef(element)
        }}
        data-layer-id={node.id}
        {...(canDrag ? { ...attributes, ...listeners } : {})}
        onClick={(event) => onSelect(node.id, event)}
        className={`relative w-full flex items-center gap-1 h-8 pr-2 text-left text-[14.5px] touch-none ${
          canDrag ? 'cursor-grab active:cursor-grabbing' : ''
        } ${isDragging ? 'opacity-40' : ''} ${
          hint === 'inside' ? 'bg-green/15 text-green font-semibold' : selected ? 'bg-green-glow2 text-green font-semibold' : 'text-text-1 hover:bg-bg-2 hover:text-text-0'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {hint === 'before' && <span className="absolute left-2 right-2 top-0 h-0.5 bg-green" />}
        {hint === 'after' && <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-green" />}
        {hasChildren ? (
          <span
            role="presentation"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.id)
            }}
            className="w-4 h-4 shrink-0 flex items-center justify-center"
          >
            <ChevronRight size={14} strokeWidth={2.5} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="truncate">{layerName(node)}</span>
      </button>
      {hasChildren && open && node.children!.map((child) => (
        <LayerRow key={child.id} node={child} depth={depth + 1} openIds={openIds} onToggle={onToggle} dropHint={dropHint} onSelect={onSelect} />
      ))}
    </div>
  )
}

/** 편집 중 화면 왼쪽에 붙어서 페이지 구조를 보여 준다. 헤더로 접고 펼친다. */
export function LayersPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages?.length) return s.config.blocks
    return (pages.find((page) => page.id === s.activePageId) ?? pages[0]).blocks
  })
  const pageName = useConfigStore((s) => {
    const pages = s.config.pages
    return pages?.find((page) => page.id === s.activePageId)?.name || s.config.name || '페이지'
  })
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const selectMany = useEditorStore((s) => s.selectMany)
  const toggleSelect = useEditorStore((s) => s.toggleSelect)
  const moveNode = useConfigStore((s) => s.moveNode)
  const groupNodes = useConfigStore((s) => s.groupNodes)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; place: LayerDropPlace } | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(parentIds(blocks)))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const knownParents = useRef<Set<string>>(new Set(parentIds(blocks)))

  const structureKey = useMemo(() => parentIds(blocks).join(','), [blocks])

  useEffect(() => {
    const parents = parentIds(blocks)
    setOpenIds((current) => {
      const next = new Set(current)
      let changed = false
      for (const id of parents) {
        if (!knownParents.current.has(id)) {
          next.add(id)
          changed = true
        }
      }
      knownParents.current = new Set(parents)
      if (selectedBlockId) {
        for (const id of ancestorIds(blocks, selectedBlockId)) {
          if (!next.has(id)) {
            next.add(id)
            changed = true
          }
        }
      }
      return changed ? next : current
    })
  }, [structureKey, selectedBlockId, blocks])

  useEffect(() => {
    if (!selectedBlockId) return
    document.querySelector(`[data-layer-id="${CSS.escape(selectedBlockId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedBlockId])

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSelect(id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    if (event.shiftKey && selectedBlockId) {
      const ids = visibleIds(blocks, openIds)
      const from = ids.indexOf(selectedBlockId)
      const to = ids.indexOf(id)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        selectMany(ids.slice(start, end + 1), id)
        return
      }
    }
    if (event.ctrlKey || event.metaKey) toggleSelect(id)
    else selectBlock(id)
  }

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function hintFor(event: DragOverEvent | DragEndEvent) {
    const overId = event.over ? String(event.over.id) : ''
    if (!overId.startsWith(DROP_PREFIX)) return null
    const id = overId.slice(DROP_PREFIX.length)
    const node = findNode(blocks, id)?.node
    if (!node) return null
    const canHoldChildren = node.type === 'container' || node.type === 'section'
    return { id, place: placeOnRow(event, canHoldChildren) }
  }

  function onDragOver(event: DragOverEvent) {
    const hint = hintFor(event)
    setDropHint(hint)
    if (hint?.place === 'inside') {
      setOpenIds((current) => current.has(hint.id) ? current : new Set(current).add(hint.id))
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    setDropHint(null)
    const hint = hintFor(event)
    if (!hint) return
    const destination = layerDropTarget(blocks, String(event.active.id), hint.id, hint.place)
    if (!destination) return
    moveNode(String(event.active.id), destination.parentId, destination.index)
    setOpenIds((current) => new Set(current).add(destination.parentId))
  }

  function groupSelection() {
    const id = groupNodes(selectedIds)
    if (id) {
      selectBlock(id)
      setOpenIds((current) => new Set(current).add(id))
    }
  }

  const groupParents = new Set(selectedIds.map((id) => findNode(blocks, id)?.parent?.id))
  const canGroup = selectedIds.length > 1 && groupParents.size === 1 && !groupParents.has(undefined)

  const dragging = draggingId ? findNode(blocks, draggingId)?.node : null

  if (!open) return null

  return (
    <aside className="admin-light fixed left-0 top-0 bottom-0 z-[60] w-[260px] flex flex-col border-r border-border-default bg-bg-1">
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-border-default">
        <Layers size={16} strokeWidth={2.5} className="text-green" />
        <h2 className="flex-1 text-text-0 text-[16px] font-semibold">레이어</h2>
        <button type="button" onClick={onToggle} aria-label="레이어 접기" className="w-7 h-7 rounded-md flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-2">
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      </div>
      <div className="px-3 py-2 text-text-2 text-[13.5px] truncate border-b border-border-subtle" title={pageName}>
        {pageName}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {blocks.length === 0 ? (
          <p className="px-3 py-6 text-text-1 text-[14.5px]">아직 섹션이 없습니다.</p>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDraggingId(null)
              setDropHint(null)
            }}
          >
            {blocks.map((block) => (
              <LayerRow key={block.id} node={block} depth={0} openIds={openIds} onToggle={toggle} dropHint={dropHint} onSelect={onSelect} />
            ))}
            <DragOverlay>
              {dragging && (
                <div className="h-8 px-3 flex items-center rounded-md bg-bg-1 border border-green text-green text-[14.5px] font-semibold shadow-md">
                  {layerName(dragging)}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {selectedIds.length > 1 && (
        <div className="shrink-0 border-t border-border-default px-3 py-2 flex items-center gap-2">
          <span className="flex-1 text-[13.5px] text-text-1">{selectedIds.length}개 선택</span>
          <button
            type="button"
            disabled={!canGroup}
            title={canGroup ? '같은 단계의 요소를 하나의 영역으로 묶습니다' : '같은 부모 안의 요소만 묶을 수 있습니다'}
            onClick={groupSelection}
            className="h-8 px-2.5 rounded-md bg-green text-white text-[13.5px] font-semibold inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Group size={14} strokeWidth={2.5} />
            그룹
          </button>
        </div>
      )}
    </aside>
  )
}
