import { create } from 'zustand'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

/** 편집 패널이 페이지를 가리지 않도록 화면을 줄일 때 쓰는 너비. 패널 class 와 같게 유지한다. */
export const EDITOR_PANEL = { layer: 260, design: 280, rail: 40 }

interface EditorState {
  selectedBlockId: string | null
  /** 여러 개 선택 (Shift+클릭). 첫 번째는 항상 selectedBlockId 와 같은 흐름으로 관리한다. */
  selectedIds: string[]
  /** 요소를 고를 때마다 증가. 같은 요소를 다시 눌러도 레이어를 다시 연다. */
  selectionSeq: number
  viewport: Viewport
  jsonDrawerOpen: boolean
  historyOpen: boolean
  shortcutsModalOpen: boolean
  previewMode: boolean
  activeProjectId: string | null
  /** 마지막으로 서버에 저장한(또는 불러온) 페이지 JSON. 지금 JSON 과 다르면 "저장 안 됨" */
  savedSnapshot: string | null
  // Generation state
  isGenerating: boolean
  generationPrompt: string | null
  generationError: string | null
  /** 편집 중 좌우 패널이 차지하는 너비. 페이지는 이 만큼 비운 뒤에 축소해서 보여 준다. */
  canvasLeft: number
  canvasRight: number
  selectBlock: (id: string | null) => void
  /** 레이어에서 Shift 로 범위를 고를 때. primary 가 기준 선택이 된다. */
  selectMany: (ids: string[], primary: string) => void
  setCanvasInset: (left: number, right: number) => void
  /** Shift+클릭: 이미 선택돼 있으면 빼고, 아니면 더한다. */
  toggleSelect: (id: string) => void
  setViewport: (vp: Viewport) => void
  toggleJsonDrawer: () => void
  toggleHistory: () => void
  toggleShortcutsModal: () => void
  togglePreview: () => void
  setActiveProject: (id: string | null) => void
  markSaved: (snapshot: string | null) => void
  setGenerating: (prompt: string | null) => void
  setGenerationError: (err: string | null) => void
  clearGeneration: () => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  selectedBlockId: null,
  selectedIds: [],
  selectionSeq: 0,
  viewport: 'desktop',
  jsonDrawerOpen: false,
  historyOpen: false,
  shortcutsModalOpen: false,
  previewMode: false,
  activeProjectId: null,
  savedSnapshot: null,
  isGenerating: false,
  generationPrompt: null,
  generationError: null,
  canvasLeft: 0,
  canvasRight: 0,
  selectBlock: (id) => set((s) => ({ selectedBlockId: id, selectedIds: id ? [id] : [], selectionSeq: s.selectionSeq + 1 })),
  selectMany: (ids, primary) => set((s) => ({ selectedIds: ids, selectedBlockId: primary, selectionSeq: s.selectionSeq + 1 })),
  setCanvasInset: (left, right) => set({ canvasLeft: left, canvasRight: right }),
  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id)
      const selectedIds = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]
      return { selectedIds, selectedBlockId: has ? selectedIds[selectedIds.length - 1] ?? null : id, selectionSeq: s.selectionSeq + 1 }
    }),
  setViewport: (vp) => set({ viewport: vp }),
  toggleJsonDrawer: () => set((s) => ({ jsonDrawerOpen: !s.jsonDrawerOpen })),
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
  toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
  togglePreview: () => set((s) => ({ previewMode: !s.previewMode, ...(!s.previewMode ? { selectedBlockId: null, selectedIds: [] } : {}) })),
  setActiveProject: (id) => set({ activeProjectId: id }),
  markSaved: (snapshot) => set({ savedSnapshot: snapshot }),
  setGenerating: (prompt) => set({ isGenerating: !!prompt, generationPrompt: prompt, generationError: null }),
  setGenerationError: (err) => set({ generationError: err }),
  clearGeneration: () => set({ isGenerating: false, generationPrompt: null }),
}))
