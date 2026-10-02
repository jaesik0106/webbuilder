import type { BlockConfig, BlockType, ThemeConfig } from '@/blocks/types'
import { blockMetadata } from '@/lib/block-metadata'
import { themePresets } from '@/lib/theme-presets'

/**
 * Structured edit operations the AI assistant proposes against a page.
 * The assistant never writes raw JSON for the whole site; it emits these
 * small operations, which are validated here before anything is applied.
 */
export type SiteOperation =
  | { op: 'update_props'; blockId: string; props: Record<string, unknown> }
  | { op: 'set_variant'; blockId: string; variant: string }
  | { op: 'add_block'; type: BlockType; variant?: string; props?: Record<string, unknown>; afterBlockId?: string | null }
  | { op: 'remove_block'; blockId: string }
  | { op: 'move_block'; blockId: string; toIndex: number }
  | { op: 'update_theme'; theme: Partial<ThemeConfig> }
  | { op: 'apply_preset'; presetId: string }

export interface PageState {
  blocks: BlockConfig[]
  theme?: Partial<ThemeConfig>
}

export interface ValidationResult {
  valid: SiteOperation[]
  rejected: { op: unknown; reason: string }[]
}

const META = new Map(blockMetadata.map((m) => [m.type, m]))
const PRESET_IDS = new Set(themePresets.map((p) => p.id))
const COLOR_KEYS = new Set<keyof ThemeConfig>([
  'bg0', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'text0', 'text1', 'text2', 'text3',
  'accent', 'accentDim', 'borderDefault', 'borderSubtle', 'borderHover',
])
const FONT_KEYS = new Set<keyof ThemeConfig>(['fontSans', 'fontDisplay', 'fontMono'])

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function findBlock(blocks: BlockConfig[], id: string): BlockConfig | null {
  for (const block of blocks) {
    if (block.id === id) return block
    if (block.children) {
      const found = findBlock(block.children, id)
      if (found) return found
    }
  }
  return null
}

function indexBlocks(blocks: BlockConfig[], ids: Set<string>, typeById: Map<string, BlockType>) {
  for (const block of blocks) {
    ids.add(block.id)
    typeById.set(block.id, block.type)
    if (block.children) indexBlocks(block.children, ids, typeById)
  }
}

function updateInTree(blocks: BlockConfig[], id: string, change: (block: BlockConfig) => BlockConfig): BlockConfig[] {
  return blocks.map((block) => {
    if (block.id === id) return change(block)
    if (!block.children) return block
    return { ...block, children: updateInTree(block.children, id, change) }
  })
}

function removeFromTree(blocks: BlockConfig[], id: string): BlockConfig[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) => (block.children ? { ...block, children: removeFromTree(block.children, id) } : block))
}

function moveInTree(blocks: BlockConfig[], id: string, toIndex: number): BlockConfig[] {
  const from = blocks.findIndex((block) => block.id === id)
  if (from >= 0) {
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    next.splice(Math.min(toIndex, next.length), 0, moved)
    return next
  }
  return blocks.map((block) => (block.children ? { ...block, children: moveInTree(block.children, id, toIndex) } : block))
}

function sanitizeTheme(raw: Record<string, unknown>): Partial<ThemeConfig> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (COLOR_KEYS.has(k as keyof ThemeConfig) && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v
    else if (FONT_KEYS.has(k as keyof ThemeConfig) && typeof v === 'string' && v.trim()) out[k] = v.trim()
    else if (k === 'radius' && typeof v === 'number' && v >= 0 && v <= 24) out[k] = v
    else if (k === 'radiusLg' && typeof v === 'number' && v >= 0 && v <= 32) out[k] = v
  }
  return out as Partial<ThemeConfig>
}

/**
 * Checks each operation against the current page, in order: once a block is
 * removed, later operations can no longer reference it.
 */
export function validateOperations(rawOps: unknown, page: PageState): ValidationResult {
  const valid: SiteOperation[] = []
  const rejected: ValidationResult['rejected'] = []
  if (!Array.isArray(rawOps)) return { valid, rejected: [{ op: rawOps, reason: 'operations must be an array' }] }

  const ids = new Set<string>()
  const typeById = new Map<string, BlockType>()
  indexBlocks(page.blocks, ids, typeById)
  const reject = (op: unknown, reason: string) => rejected.push({ op, reason })

  for (const raw of rawOps) {
    if (!isObject(raw)) { reject(raw, 'not an object'); continue }
    switch (raw.op) {
      case 'update_props': {
        if (typeof raw.blockId !== 'string' || !ids.has(raw.blockId)) { reject(raw, 'unknown blockId'); break }
        if (!isObject(raw.props) || Object.keys(raw.props).length === 0) { reject(raw, 'props must be a non-empty object'); break }
        valid.push({ op: 'update_props', blockId: raw.blockId, props: raw.props })
        break
      }
      case 'set_variant': {
        if (typeof raw.blockId !== 'string' || !ids.has(raw.blockId)) { reject(raw, 'unknown blockId'); break }
        const meta = META.get(typeById.get(raw.blockId)!)
        if (typeof raw.variant !== 'string' || !meta?.variants.includes(raw.variant)) { reject(raw, 'variant not available for this block'); break }
        valid.push({ op: 'set_variant', blockId: raw.blockId, variant: raw.variant })
        break
      }
      case 'add_block': {
        const meta = typeof raw.type === 'string' ? META.get(raw.type as BlockType) : undefined
        if (!meta) { reject(raw, 'unknown block type'); break }
        const variant = typeof raw.variant === 'string' && meta.variants.includes(raw.variant) ? raw.variant : meta.variants[0]
        const after = typeof raw.afterBlockId === 'string' ? raw.afterBlockId : null
        if (after && !ids.has(after)) { reject(raw, 'unknown afterBlockId'); break }
        const op: SiteOperation = {
          op: 'add_block', type: meta.type, variant,
          props: isObject(raw.props) ? raw.props : undefined,
          afterBlockId: after,
        }
        valid.push(op)
        break
      }
      case 'remove_block': {
        if (typeof raw.blockId !== 'string' || !ids.has(raw.blockId)) { reject(raw, 'unknown blockId'); break }
        const target = findBlock(page.blocks, raw.blockId)
        const drop = new Set<string>([raw.blockId])
        if (target) indexBlocks([target], drop, new Map())
        for (const id of drop) ids.delete(id)
        valid.push({ op: 'remove_block', blockId: raw.blockId })
        break
      }
      case 'move_block': {
        if (typeof raw.blockId !== 'string' || !ids.has(raw.blockId)) { reject(raw, 'unknown blockId'); break }
        if (typeof raw.toIndex !== 'number' || !Number.isInteger(raw.toIndex) || raw.toIndex < 0) { reject(raw, 'toIndex must be a non-negative integer'); break }
        valid.push({ op: 'move_block', blockId: raw.blockId, toIndex: raw.toIndex })
        break
      }
      case 'update_theme': {
        const theme = isObject(raw.theme) ? sanitizeTheme(raw.theme) : {}
        if (Object.keys(theme).length === 0) { reject(raw, 'no valid theme fields'); break }
        valid.push({ op: 'update_theme', theme })
        break
      }
      case 'apply_preset': {
        if (typeof raw.presetId !== 'string' || !PRESET_IDS.has(raw.presetId)) { reject(raw, 'unknown presetId'); break }
        valid.push({ op: 'apply_preset', presetId: raw.presetId })
        break
      }
      default:
        reject(raw, 'unknown op')
    }
  }
  return { valid, rejected }
}

let idCounter = 0
function newBlockId(type: string): string {
  idCounter += 1
  return `block-${type}-${Date.now().toString(36)}-${idCounter}`
}

/**
 * Applies already-validated operations and returns a new page state.
 * Never mutates the input.
 */
export function applyOperations(page: PageState, ops: SiteOperation[], makeId: (type: string) => string = newBlockId): PageState {
  let blocks: BlockConfig[] = page.blocks.map((b) => ({ ...b, props: { ...b.props } }))
  let theme: Partial<ThemeConfig> | undefined = page.theme ? { ...page.theme } : undefined

  for (const op of ops) {
    switch (op.op) {
      case 'update_props':
        blocks = updateInTree(blocks, op.blockId, (block) => ({ ...block, props: { ...block.props, ...op.props } }))
        break
      case 'set_variant':
        blocks = updateInTree(blocks, op.blockId, (block) => ({ ...block, variant: op.variant }))
        break
      case 'add_block': {
        const meta = META.get(op.type)!
        const block: BlockConfig = {
          id: makeId(op.type),
          type: op.type,
          variant: op.variant ?? meta.variants[0],
          props: { ...meta.defaultProps, ...(op.props ?? {}) },
        }
        const afterIdx = op.afterBlockId ? blocks.findIndex((b) => b.id === op.afterBlockId) : -1
        // Default insertion point: before a trailing footer, otherwise at the end.
        let insertAt = afterIdx >= 0 ? afterIdx + 1 : blocks.length
        if (afterIdx < 0 && blocks.length > 0 && blocks[blocks.length - 1].type === 'footer') insertAt = blocks.length - 1
        blocks = [...blocks.slice(0, insertAt), block, ...blocks.slice(insertAt)]
        break
      }
      case 'remove_block':
        blocks = removeFromTree(blocks, op.blockId)
        break
      case 'move_block':
        blocks = moveInTree(blocks, op.blockId, op.toIndex)
        break
      case 'update_theme':
        theme = { ...(theme ?? {}), ...op.theme }
        break
      case 'apply_preset': {
        const preset = themePresets.find((p) => p.id === op.presetId)
        if (preset) theme = { ...preset.theme }
        break
      }
    }
  }
  return { blocks, theme }
}

/** Short Korean description of an operation, for the preview list shown to the customer. */
export function describeOperation(op: SiteOperation, page: PageState): string {
  const label = (id: string) => {
    const b = findBlock(page.blocks, id)
    const meta = b ? META.get(b.type) : undefined
    if (meta) return `${meta.label} 섹션`
    if (b?.type === 'text') {
      const content = String(b.props.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 18)
      return content ? `텍스트 "${content}"` : '텍스트'
    }
    if (b?.type === 'image') return '이미지'
    if (b?.type === 'button') return `버튼 "${String(b.props.text || '버튼')}"`
    if (b?.type === 'container') return '영역'
    if (b?.type === 'section') return '섹션'
    return b ? b.type : '새로 추가한 섹션'
  }
  switch (op.op) {
    case 'update_props': return `${label(op.blockId)} 내용 수정 (${Object.keys(op.props).join(', ')})`
    case 'set_variant': return `${label(op.blockId)} 레이아웃을 '${op.variant}'(으)로 변경`
    case 'add_block': return `${META.get(op.type)?.label ?? op.type} 섹션 추가`
    case 'remove_block': return `${label(op.blockId)} 삭제`
    case 'move_block': return `${label(op.blockId)} 위치를 ${op.toIndex + 1}번째로 이동`
    case 'update_theme': return `디자인 색상/글꼴 변경 (${Object.keys(op.theme).join(', ')})`
    case 'apply_preset': return `'${themePresets.find((p) => p.id === op.presetId)?.name ?? op.presetId}' 테마 적용`
  }
}
