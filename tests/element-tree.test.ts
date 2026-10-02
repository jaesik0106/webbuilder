import { beforeEach, describe, expect, it } from 'vitest'
import type { BlockConfig } from '../src/blocks/types'
import { createBlankSection, createElement, findNode, isElementNode, layerDropTarget, targetContainerFor } from '../src/lib/element-tree'
import { useConfigStore } from '../src/store/configStore'

const hero: BlockConfig = { id: 'hero-1', type: 'hero', variant: 'centered', props: { headline: 'Hi' } }
const presetImage: BlockConfig = { id: 'image-1', type: 'image', variant: 'hero-image', props: {} }

function page(): BlockConfig[] {
  const section = createBlankSection()
  section.id = 'sec'
  const [container] = section.children!
  container.id = 'c1'
  const second = createElement('container')
  second.id = 'c2'
  section.children!.push(second)
  container.children = [
    { ...createElement('text'), id: 't1' },
    { ...createElement('image'), id: 'i1' },
    { ...createElement('button'), id: 'b1' },
  ]
  return [hero, section, presetImage]
}

function blocks() {
  return useConfigStore.getState().getActivePageBlocks()
}

describe('element tree', () => {
  it('blank section is section > container with empty children', () => {
    const section = createBlankSection()
    expect(section.type).toBe('section')
    expect(section.children).toHaveLength(1)
    expect(section.children![0].type).toBe('container')
    expect(section.children![0].children).toEqual([])
  })

  it('finds nested nodes and tells preset image apart from element image', () => {
    const tree = page()
    expect(findNode(tree, 'i1')?.parent?.id).toBe('c1')
    expect(isElementNode(tree, 'i1')).toBe(true)
    expect(isElementNode(tree, 'image-1')).toBe(false)
    expect(isElementNode(tree, 'hero-1')).toBe(false)
    expect(isElementNode(tree, 'sec')).toBe(true)
  })

  it('picks the container to add into', () => {
    const tree = page()
    expect(targetContainerFor(tree, 'sec')?.id).toBe('c1')
    expect(targetContainerFor(tree, 'c2')?.id).toBe('c2')
    expect(targetContainerFor(tree, 't1')?.id).toBe('c1')
    expect(targetContainerFor(tree, 'hero-1')).toBeNull()
  })
})

describe('config store with nested elements', () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig({ name: 'test', blocks: page() })
  })

  it('updates nested props and undoes it', () => {
    useConfigStore.getState().updateBlockProps('t1', { content: '안녕하세요' })
    expect(findNode(blocks(), 't1')?.node.props.content).toBe('안녕하세요')
    useConfigStore.getState().undo()
    expect(findNode(blocks(), 't1')?.node.props.content).not.toBe('안녕하세요')
  })

  it('adds, reorders and moves elements between containers with undo', () => {
    const { addChild, moveNode, undo } = useConfigStore.getState()
    addChild('c1', { ...createElement('spacer'), id: 's1' })
    expect(findNode(blocks(), 'c1')?.node.children?.map((c) => c.id)).toEqual(['t1', 'i1', 'b1', 's1'])

    moveNode('b1', 'c1', 0)
    expect(findNode(blocks(), 'c1')?.node.children?.map((c) => c.id)).toEqual(['b1', 't1', 'i1', 's1'])

    moveNode('i1', 'c2', 0)
    expect(findNode(blocks(), 'c2')?.node.children?.map((c) => c.id)).toEqual(['i1'])

    undo()
    expect(findNode(blocks(), 'i1')?.parent?.id).toBe('c1')
  })

  it('does not move a container into itself', () => {
    useConfigStore.getState().moveNode('c1', 'c1', 0)
    expect(findNode(blocks(), 'c1')?.parent?.id).toBe('sec')
  })

  it('removing a section removes its children; presets stay untouched', () => {
    useConfigStore.getState().removeBlock('sec')
    expect(findNode(blocks(), 't1')).toBeNull()
    expect(blocks().map((b) => b.id)).toEqual(['hero-1', 'image-1'])
    useConfigStore.getState().undo()
    expect(findNode(blocks(), 't1')).not.toBeNull()
  })

  it('duplicates a nested element with a new id', () => {
    useConfigStore.getState().duplicateBlock('t1')
    const ids = findNode(blocks(), 'c1')?.node.children?.map((c) => c.id) ?? []
    expect(ids).toHaveLength(4)
    expect(ids[0]).toBe('t1')
    expect(ids[1]).not.toBe('t1')
  })
})

describe('grouping', () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig({ name: 'test', blocks: page() })
  })

  it('groups siblings into a new container at the first position and undoes it', () => {
    const groupId = useConfigStore.getState().groupNodes(['i1', 'b1'])
    expect(groupId).toBeTruthy()
    const c1 = findNode(blocks(), 'c1')!.node
    expect(c1.children!.map((c) => c.id)).toEqual(['t1', groupId])
    expect(findNode(blocks(), groupId!)!.node.children!.map((c) => c.id)).toEqual(['i1', 'b1'])
    useConfigStore.getState().undo()
    expect(findNode(blocks(), 'c1')!.node.children!.map((c) => c.id)).toEqual(['t1', 'i1', 'b1'])
  })

  it('refuses to group elements from different parents', () => {
    useConfigStore.getState().addChild('c2', { ...createElement('text'), id: 't2' })
    expect(useConfigStore.getState().groupNodes(['t1', 't2'])).toBeNull()
  })

  it('ungroups back into the parent in place', () => {
    const groupId = useConfigStore.getState().groupNodes(['t1', 'i1'])!
    useConfigStore.getState().ungroupNode(groupId)
    expect(findNode(blocks(), 'c1')!.node.children!.map((c) => c.id)).toEqual(['t1', 'i1', 'b1'])
  })
})

describe('layer drop beside a parent', () => {
  beforeEach(() => {
    useConfigStore.getState().setConfig({ name: 'test', blocks: page() })
    const area = createElement('container')
    area.id = 'area'
    useConfigStore.getState().addChild('c1', area)
    useConfigStore.getState().moveNode('i1', 'area', 0)
  })

  it('lifts a child to the same level as its parent when dropped after that parent', () => {
    const tree = blocks()
    const dest = layerDropTarget(tree, 'i1', 'area', 'after')
    expect(dest).toEqual({ parentId: 'c1', index: 3 })
    useConfigStore.getState().moveNode('i1', dest!.parentId, dest!.index)
    expect(findNode(blocks(), 'c1')!.node.children!.map((c) => c.id)).toEqual(['t1', 'b1', 'area', 'i1'])
    expect(findNode(blocks(), 'i1')?.parent?.id).toBe('c1')
  })

  it('keeps a drop in the middle of a container inside that container', () => {
    const dest = layerDropTarget(blocks(), 't1', 'area', 'inside')
    expect(dest?.parentId).toBe('area')
    useConfigStore.getState().moveNode('t1', dest!.parentId, dest!.index)
    expect(findNode(blocks(), 'area')!.node.children!.map((c) => c.id)).toEqual(['i1', 't1'])
  })
})
