import type { BlockConfig } from '@/blocks/types'
import { blockMetadata } from '@/lib/block-metadata'

/**
 * 상단 메뉴(navbar)는 모든 페이지 맨 위에 고정된다. 삭제·이동·복제할 수 없고, 하나만 둔다.
 * 메뉴 항목은 관리자 > 메뉴 에서 고치고, 로고·버튼 글자는 페이지 위에서 고친다.
 */
export const FIXED_BLOCK_TYPE = 'navbar'

export function isFixedBlock(block: BlockConfig | undefined): boolean {
  return block?.type === FIXED_BLOCK_TYPE
}

function defaultNavbar(logo?: string): BlockConfig {
  const meta = blockMetadata.find((m) => m.type === FIXED_BLOCK_TYPE)!
  const props = structuredClone(meta.defaultProps)
  if (logo) props.logo = logo
  return { id: `block-navbar-${Date.now().toString(36)}`, type: FIXED_BLOCK_TYPE, variant: meta.variants[0], props }
}

/** 첫 상단 메뉴를 맨 위로 올리고 나머지 상단 메뉴는 뺀다. 없으면 기본 메뉴를 넣는다. */
export function pinNavbar(blocks: BlockConfig[], logo?: string): BlockConfig[] {
  const navbar = blocks.find(isFixedBlock)
  const rest = blocks.filter((block) => !isFixedBlock(block))
  if (navbar && blocks[0] === navbar && rest.length === blocks.length - 1) return blocks
  return [navbar ?? defaultNavbar(logo), ...rest]
}
