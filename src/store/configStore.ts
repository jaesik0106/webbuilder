import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { produce } from 'immer'
import type { BlockConfig, SiteConfig, ThemeConfig, PageConfig } from '@/blocks/types'
import { cloneWithNewIds, containsNode, createElement, findNode } from '@/lib/element-tree'

function ensurePages(config: SiteConfig): PageConfig[] {
  if (config.pages && config.pages.length > 0) return config.pages
  return [{ id: 'page-home', name: 'Home', path: '/', blocks: config.blocks }]
}

function getPageBlocks(config: SiteConfig, pageId: string): BlockConfig[] {
  const pages = ensurePages(config)
  const page = pages.find((p) => p.id === pageId)
  return page?.blocks ?? pages[0]?.blocks ?? []
}

interface UndoEntry {
  pages?: PageConfig[]
  blocks: BlockConfig[]
  theme?: Partial<ThemeConfig>
  label: string
  timestamp: number
}

interface ConfigState {
  config: SiteConfig
  activePageId: string
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  setConfig: (config: SiteConfig) => void
  setActivePage: (id: string) => void
  getActivePageBlocks: () => BlockConfig[]
  updateBlock: (id: string, updates: Partial<BlockConfig>) => void
  updateBlockProps: (id: string, props: Record<string, unknown>) => void
  addBlock: (block: BlockConfig, index?: number) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  moveBlock: (fromIndex: number, toIndex: number) => void
  /** 기본 요소: 부모(section/container)의 children 에 노드를 넣는다. index 가 없으면 맨 뒤. */
  addChild: (parentId: string, node: BlockConfig, index?: number) => void
  /** 기본 요소: 노드를 다른(또는 같은) 부모의 index 위치로 옮긴다. */
  moveNode: (id: string, toParentId: string, toIndex: number) => void
  /** 같은 부모 아래의 요소들을 새 그룹(컨테이너)으로 묶는다. 묶은 그룹의 id 를 돌려준다. */
  groupNodes: (ids: string[]) => string | null
  /** 그룹(컨테이너)을 풀어 안의 요소들을 그 자리에 꺼내 놓는다. */
  ungroupNode: (id: string) => void
  addPage: (name: string, path: string) => string
  removePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  setTheme: (theme: Partial<ThemeConfig>) => void
  applyPageEdit: (blocks: BlockConfig[], theme: Partial<ThemeConfig> | undefined, label: string) => void
  updateTheme: (partial: Partial<ThemeConfig>) => void
  previewTheme: (partial: Partial<ThemeConfig>) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

const defaultBlocks: BlockConfig[] = [
  {
    id: 'block-navbar',
    type: 'navbar',
    variant: 'default',
    props: {
      logo: 'Acme Inc',
      links: ['Features', 'Pricing', 'About', 'Contact'],
      ctaText: 'Get Started',
    },
  },
  {
    id: 'block-hero',
    type: 'hero',
    variant: 'centered',
    props: {
      badge: 'Now in Beta',
      headline: 'Build websites with JSON',
      subheadline: 'The visual editor that agents and humans both understand. Structured config, beautiful output.',
      primaryCta: 'Start Building',
      secondaryCta: 'View Demo',
    },
  },
  {
    id: 'block-features',
    type: 'features',
    variant: 'grid',
    props: {
      label: 'Features',
      title: 'Everything you need',
      subtitle: 'Powerful building blocks for your next website',
      items: [
        { icon: 'Blocks', title: 'Visual Editor', description: 'Drag and drop blocks to build your layout' },
        { icon: 'Code', title: 'JSON Config', description: 'Every change is a clean JSON mutation' },
        { icon: 'Bot', title: 'Agent Ready', description: 'AI agents can read and write your config' },
      ],
    },
  },
  {
    id: 'block-cta',
    type: 'cta',
    variant: 'simple',
    props: {
      headline: 'Ready to get started?',
      subheadline: 'Create your first site in minutes.',
      buttonText: 'Start Free',
    },
  },
  {
    id: 'block-footer',
    type: 'footer',
    variant: 'simple',
    props: {
      logo: 'OpenPage',
      copyright: '2026 OpenPage. All rights reserved.',
      links: ['Privacy', 'Terms', 'Contact'],
    },
  },
]

export const defaultConfig: SiteConfig = {
  name: 'My Website',
  pages: [{ id: 'page-home', name: 'Home', path: '/', blocks: defaultBlocks }],
  blocks: defaultBlocks,
}

function snapshot(state: ConfigState): { pages?: PageConfig[]; blocks: BlockConfig[]; theme?: Partial<ThemeConfig> } {
  return {
    pages: state.config.pages ? JSON.parse(JSON.stringify(state.config.pages)) : undefined,
    blocks: JSON.parse(JSON.stringify(state.config.blocks)),
    theme: state.config.theme ? JSON.parse(JSON.stringify(state.config.theme)) : undefined,
  }
}

const MAX_UNDO = 50

function pushUndo(state: ConfigState, label: string): Partial<ConfigState> {
  const snap = snapshot(state)
  return {
    undoStack: [...state.undoStack, { ...snap, label, timestamp: Date.now() }].slice(-MAX_UNDO),
    redoStack: [],
  }
}

function withPages(config: SiteConfig): SiteConfig {
  const pages = ensurePages(config)
  return { ...config, pages }
}

function mutateActivePageBlocks(
  config: SiteConfig,
  activePageId: string,
  mutator: (blocks: BlockConfig[]) => BlockConfig[],
): SiteConfig {
  const pages = ensurePages(config)
  const newPages = pages.map((p) =>
    p.id === activePageId ? { ...p, blocks: mutator([...p.blocks]) } : p,
  )
  // Keep top-level blocks synced with first page for backward compat
  const activeBlocks = newPages.find((p) => p.id === activePageId)?.blocks ?? []
  return { ...config, pages: newPages, blocks: activeBlocks }
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      activePageId: 'page-home',
      undoStack: [],
      redoStack: [],

      setConfig: (config) => {
        const pages = ensurePages(config)
        set({ config: { ...config, pages }, activePageId: pages[0]?.id ?? 'page-home', undoStack: [], redoStack: [] })
      },

      setActivePage: (id) => set({ activePageId: id }),

      getActivePageBlocks: () => {
        const state = get()
        return getPageBlocks(state.config, state.activePageId)
      },

      updateBlock: (id, updates) =>
        set((state) => ({
          ...pushUndo(state, 'Update block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            // 최상위 블록뿐 아니라 section 안의 기본 요소도 id 로 찾는다.
            const block = findNode(page.blocks, id)?.node
            if (block) Object.assign(block, updates)
            draft.blocks = page.blocks
          }),
        })),

      updateBlockProps: (id, props) =>
        set((state) => ({
          ...pushUndo(state, 'Update properties'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            const block = findNode(page.blocks, id)?.node
            if (block) Object.assign(block.props, props)
            draft.blocks = page.blocks
          }),
        })),

      addBlock: (block, index) =>
        set((state) => ({
          ...pushUndo(state, 'Add block'),
          config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (blocks) => {
            if (index !== undefined) {
              blocks.splice(index, 0, block)
            } else {
              blocks.push(block)
            }
            return blocks
          }),
        })),

      removeBlock: (id) =>
        set((state) => ({
          ...pushUndo(state, 'Remove block'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            if (!page) return
            // 하위 children 은 노드와 함께 사라진다.
            const found = findNode(page.blocks, id)
            if (!found) return
            const list = found.parent ? found.parent.children! : page.blocks
            list.splice(found.index, 1)
            draft.blocks = page.blocks
          }),
        })),

      duplicateBlock: (id) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const idx = blocks.findIndex((b) => b.id === id)
          if (idx === -1) {
            // 기본 요소: 같은 부모 안 바로 뒤에 새 id 로 복제한다.
            const found = findNode(blocks, id)
            if (!found?.parent) return state
            return {
              ...pushUndo(state, 'Duplicate element'),
              config: produce(withPages(state.config), (draft) => {
                const page = draft.pages!.find((p) => p.id === state.activePageId)
                const target = page && findNode(page.blocks, id)
                if (!page || !target?.parent) return
                target.parent.children!.splice(target.index + 1, 0, cloneWithNewIds(found.node))
                draft.blocks = page.blocks
              }),
            }
          }
          const original = blocks[idx]
          const clone: BlockConfig = {
            ...JSON.parse(JSON.stringify(original)),
            id: `block-${Date.now()}`,
          }
          return {
            ...pushUndo(state, 'Duplicate block'),
            config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (b) => {
              b.splice(idx + 1, 0, clone)
              return b
            }),
          }
        }),

      moveBlock: (fromIndex, toIndex) =>
        set((state) => ({
          ...pushUndo(state, 'Move block'),
          config: mutateActivePageBlocks(withPages(state.config), state.activePageId, (blocks) => {
            const [moved] = blocks.splice(fromIndex, 1)
            blocks.splice(toIndex, 0, moved)
            return blocks
          }),
        })),

      addChild: (parentId, node, index) =>
        set((state) => ({
          ...pushUndo(state, 'Add element'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            const parent = page && findNode(page.blocks, parentId)?.node
            if (!page || !parent) return
            parent.children = parent.children ?? []
            if (index === undefined) parent.children.push(node)
            else parent.children.splice(index, 0, node)
            draft.blocks = page.blocks
          }),
        })),

      moveNode: (id, toParentId, toIndex) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const moving = findNode(blocks, id)
          const target = findNode(blocks, toParentId)
          // 자기 자신이나 자기 하위로는 옮길 수 없다.
          if (!moving?.parent || !target || !target.node.children || id === toParentId || containsNode(moving.node, toParentId)) return state
          return {
            ...pushUndo(state, 'Move element'),
            config: produce(withPages(state.config), (draft) => {
              const page = draft.pages!.find((p) => p.id === state.activePageId)
              if (!page) return
              const from = findNode(page.blocks, id)
              const to = findNode(page.blocks, toParentId)?.node
              if (!from?.parent || !to) return
              const [node] = from.parent.children!.splice(from.index, 1)
              to.children = to.children ?? []
              to.children.splice(Math.min(toIndex, to.children.length), 0, node)
              draft.blocks = page.blocks
            }),
          }
        }),

      groupNodes: (ids) => {
        const blocks = getPageBlocks(get().config, get().activePageId)
        const found = ids.map((id) => findNode(blocks, id))
        const parentId = found[0]?.parent?.id
        // 모두 같은 부모(섹션이나 그룹) 안에 있어야 묶을 수 있다.
        if (!parentId || found.some((f) => !f || f.parent?.id !== parentId)) return null
        const group = createElement('container')
        group.props = { ...group.props, paddingLeft: 0, paddingRight: 0, maxWidth: '100%' }
        set((state) => ({
          ...pushUndo(state, 'Group elements'),
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === state.activePageId)
            const parent = page && findNode(page.blocks, parentId)?.node
            if (!page || !parent?.children) return
            const picked = parent.children.filter((child) => ids.includes(child.id))
            const firstIndex = parent.children.findIndex((child) => ids.includes(child.id))
            parent.children = parent.children.filter((child) => !ids.includes(child.id))
            parent.children.splice(firstIndex, 0, { ...group, children: picked })
            draft.blocks = page.blocks
          }),
        }))
        return group.id
      },

      ungroupNode: (id) =>
        set((state) => {
          const blocks = getPageBlocks(state.config, state.activePageId)
          const found = findNode(blocks, id)
          // 그룹 안의 그룹은 언제나 풀 수 있다. 섹션 바로 아래의 그룹은 안이 모두 그룹일 때만 푼다
          // (섹션 바로 아래에는 그룹만 두어 요소를 넣을 자리가 늘 있게 한다).
          const parentOk = found?.parent?.type === 'container'
            || (found?.parent?.type === 'section' && (found.node.children ?? []).length > 0 && found.node.children!.every((c) => c.type === 'container'))
          if (!found?.parent || found.node.type !== 'container' || !parentOk) return state
          return {
            ...pushUndo(state, 'Ungroup'),
            config: produce(withPages(state.config), (draft) => {
              const page = draft.pages!.find((p) => p.id === state.activePageId)
              const target = page && findNode(page.blocks, id)
              if (!page || !target?.parent?.children) return
              target.parent.children.splice(target.index, 1, ...(target.node.children ?? []))
              draft.blocks = page.blocks
            }),
          }
        }),

      addPage: (name, path) => {
        const id = `page-${Date.now()}`
        set((state) => ({
          ...pushUndo(state, 'Add page'),
          config: produce(withPages(state.config), (draft) => {
            draft.pages!.push({ id, name, path, blocks: [] })
          }),
          activePageId: id,
        }))
        return id
      },

      removePage: (id) =>
        set((state) => {
          const pages = ensurePages(state.config)
          if (pages.length <= 1) return state
          const newPages = pages.filter((p) => p.id !== id)
          const newActiveId = state.activePageId === id ? newPages[0].id : state.activePageId
          return {
            ...pushUndo(state, 'Remove page'),
            config: { ...state.config, pages: newPages, blocks: newPages[0].blocks },
            activePageId: newActiveId,
          }
        }),

      renamePage: (id, name) =>
        set((state) => ({
          config: produce(withPages(state.config), (draft) => {
            const page = draft.pages!.find((p) => p.id === id)
            if (page) page.name = name
          }),
        })),

      // AI 제안처럼 블록과 테마를 한 번에 바꾸는 수정. 실행 취소 한 번으로 되돌린다.
      applyPageEdit: (blocks, theme, label) =>
        set((state) => ({
          ...pushUndo(state, label),
          config: { ...mutateActivePageBlocks(state.config, state.activePageId, () => blocks), theme },
        })),

      setTheme: (theme) =>
        set((state) => ({
          ...pushUndo(state, 'Change theme'),
          config: { ...state.config, theme },
        })),

      updateTheme: (partial) =>
        set((state) => ({
          ...pushUndo(state, 'Update theme'),
          config: { ...state.config, theme: { ...state.config.theme, ...partial } },
        })),

      previewTheme: (partial) =>
        set((state) => ({
          config: { ...state.config, theme: { ...state.config.theme, ...partial } },
        })),

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return state
          const prev = state.undoStack[state.undoStack.length - 1]
          const snap = snapshot(state)
          return {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, { ...snap, label: prev.label, timestamp: Date.now() }],
            config: { ...state.config, pages: prev.pages, blocks: prev.blocks, theme: prev.theme },
          }
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return state
          const next = state.redoStack[state.redoStack.length - 1]
          const snap = snapshot(state)
          return {
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, { ...snap, label: next.label, timestamp: Date.now() }],
            config: { ...state.config, pages: next.pages, blocks: next.blocks, theme: next.theme },
          }
        }),

      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,
    }),
    {
      name: 'openpage-config',
      version: 2,
      partialize: (state) => ({ config: state.config, activePageId: state.activePageId }),
      migrate: (persisted, version) => {
        const data = persisted as Record<string, unknown>
        if (version === 0 || version === 1 || version === undefined) {
          // v0/v1 -> v2: wrap blocks[] into pages[]
          const config = data.config as SiteConfig | undefined
          if (config && !config.pages) {
            config.pages = [{ id: 'page-home', name: 'Home', path: '/', blocks: config.blocks || [] }]
          }
          data.activePageId = 'page-home'
          return data
        }
        return data
      },
    }
  )
)
