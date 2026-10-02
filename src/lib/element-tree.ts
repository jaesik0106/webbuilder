import type { BlockConfig, ElementType } from '@/blocks/types'

/**
 * 기본 요소(Section > Container > Text/Image/Button/Spacer) 트리 도우미.
 *
 * 페이지의 최상위 blocks 배열은 그대로 두고, type 이 'section' 인 블록만 children 을 가진다.
 * - 최상위에서 'section' → 새 요소 렌더러, 그 밖의 type → 기존 프리셋 렌더러
 * - children 안의 노드는 항상 기본 요소로 렌더링한다
 *   (그래서 children 안의 'image' 는 기본 이미지 요소, 최상위 'image' 는 기존 이미지 프리셋 블록이다)
 */

export const ELEMENT_TYPES: ElementType[] = ['section', 'container', 'text', 'image', 'button', 'spacer']
export const LEAF_TYPES: ElementType[] = ['text', 'image', 'button', 'spacer']

let counter = 0
export function newElementId(type: string) {
  counter += 1
  return `${type}-${Date.now().toString(36)}-${counter}`
}

export function isLeafType(type: string): boolean {
  return (LEAF_TYPES as string[]).includes(type)
}

const defaults: Record<ElementType, () => Record<string, unknown>> = {
  section: () => ({ backgroundColor: '', paddingTop: 80, paddingBottom: 80, minHeight: 0 }),
  container: () => ({
    maxWidth: 1700, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
    alignItems: 'stretch', gap: 16, paddingLeft: 15, paddingRight: 15, columns: 'auto', ratios: '', gridColumns: '1fr 1fr', stackOnMobile: true,
  }),
  text: () => ({ content: '텍스트를 입력하세요', fontSize: 18, fontWeight: 400, color: '', textAlign: 'left', lineHeight: 1.6, flexRatio: 1 }),
  image: () => ({ src: '', alt: '', width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 8, flexRatio: 1 }),
  button: () => ({ text: '버튼', href: '#', backgroundColor: '', color: '', borderRadius: 8, padding: '12px 24px', flexRatio: 1 }),
  spacer: () => ({ height: 40 }),
}

export function createElement(type: ElementType, children?: BlockConfig[]): BlockConfig {
  const node: BlockConfig = { id: newElementId(type), type, variant: 'default', props: defaults[type]() }
  if (type === 'section' || type === 'container') node.children = children ?? []
  return node
}

/**
 * 영역(div): 컨테이너 안에 넣는 안쪽 컨테이너. 안에 텍스트·이미지를 넣고 세로/가로로 배치한다.
 * 섹션의 바깥 컨테이너와 달리 최대 너비와 좌우 여백 없이 부모 폭을 그대로 쓴다.
 */
export function createArea(): BlockConfig {
  const area = createElement('container')
  area.props = { ...area.props, maxWidth: '100%', paddingLeft: 0, paddingRight: 0, gap: 12 }
  return area
}

/** 추가 목록에서 고르는 항목: 기본 요소 + 영역 */
export type AddableType = 'text' | 'image' | 'button' | 'area'

export function createAddable(type: AddableType): BlockConfig {
  return type === 'area' ? createArea() : createElement(type)
}

/** 빈 섹션: section > container(빈 children) */
export function createBlankSection(): BlockConfig {
  return createElement('section', [createElement('container')])
}

/** 트리에서 id 로 노드와 부모를 찾는다. 부모가 null 이면 최상위 블록이다. */
export function findNode(
  blocks: BlockConfig[],
  id: string,
  parent: BlockConfig | null = null,
): { node: BlockConfig; parent: BlockConfig | null; index: number } | null {
  for (let index = 0; index < blocks.length; index++) {
    const node = blocks[index]
    if (node.id === id) return { node, parent, index }
    if (node.children) {
      const found = findNode(node.children, id, node)
      if (found) return found
    }
  }
  return null
}

/** 기본 요소 노드인지 (최상위 'image' 는 기존 이미지 프리셋 블록이라 제외). */
export function isElementNode(blocks: BlockConfig[], id: string): boolean {
  const found = findNode(blocks, id)
  if (!found) return false
  if (found.parent) return true
  return found.node.type === 'section'
}

/** 복제할 때 자신과 모든 하위 노드에 새 id 를 붙인다. */
export function cloneWithNewIds(node: BlockConfig): BlockConfig {
  return {
    ...structuredClone(node),
    id: newElementId(node.type),
    children: node.children?.map(cloneWithNewIds),
  }
}

/** 노드가 다른 노드의 하위에 있는지 (자기 안으로 옮기는 것을 막기 위해). */
export function containsNode(node: BlockConfig, id: string): boolean {
  return !!node.children?.some((child) => child.id === id || containsNode(child, id))
}

/** 요소를 넣을 컨테이너: 선택한 것이 컨테이너면 그것, 섹션이면 첫 컨테이너, 요소면 그 부모 컨테이너. */
export function targetContainerFor(blocks: BlockConfig[], selectedId: string | null): BlockConfig | null {
  if (!selectedId) return null
  const found = findNode(blocks, selectedId)
  if (!found) return null
  const { node, parent } = found
  if (node.type === 'container') return node
  if (node.type === 'section' && (found.parent || isElementNode(blocks, node.id))) {
    return node.children?.find((child) => child.type === 'container') ?? null
  }
  if (parent?.type === 'container') return parent
  return null
}

export type LayerDropPlace = 'before' | 'inside' | 'after'

/**
 * 레이어에 놓았을 때의 도착 위치.
 * 줄의 위·아래는 그 항목과 같은 단계(부모의 형제)이고, 컨테이너 한가운데는 그 안이다.
 * 그래서 자식을 부모 행의 위나 아래에 놓으면 부모와 같은 높이로 빠진다.
 */
export function layerDropTarget(
  blocks: BlockConfig[],
  activeId: string,
  overId: string,
  place: LayerDropPlace,
): { parentId: string; index: number } | null {
  const moving = findNode(blocks, activeId)
  const target = findNode(blocks, overId)
  if (!moving?.parent || !target || activeId === overId || containsNode(moving.node, overId)) return null

  const canHoldChildren = target.node.type === 'container' || target.node.type === 'section'
  const spot: LayerDropPlace = canHoldChildren ? place : place === 'after' ? 'after' : 'before'

  if (spot === 'inside') {
    const container = target.node.type === 'container'
      ? target.node
      : target.node.children?.find((child) => child.type === 'container')
    if (!container || container.id === activeId || containsNode(moving.node, container.id)) return null
    return { parentId: container.id, index: container.children?.length ?? 0 }
  }

  if (!target.parent?.children || containsNode(moving.node, target.parent.id)) return null
  let index = spot === 'before' ? target.index : target.index + 1
  if (moving.parent.id === target.parent.id && moving.index < index) index -= 1
  if (moving.parent.id === target.parent.id && index === moving.index) return null
  return { parentId: target.parent.id, index }
}
