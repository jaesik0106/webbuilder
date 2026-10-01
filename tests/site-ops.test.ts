import { describe, expect, it } from 'vitest'
import { applyOperations, validateOperations, type PageState } from '../src/lib/site-ops'

const page: PageState = {
  blocks: [
    { id: 'nav', type: 'navbar', variant: 'default', props: { logo: 'Cafe', links: ['Menu'], ctaText: 'Visit' } },
    { id: 'hero', type: 'hero', variant: 'centered', props: { headline: 'Old', subheadline: 'Sub' } },
    { id: 'foot', type: 'footer', variant: 'simple', props: { copyright: '2026' } },
  ],
  theme: { accent: '#22c55e' },
}

describe('validateOperations', () => {
  it('keeps valid operations and rejects unknown blocks, variants and types', () => {
    const { valid, rejected } = validateOperations(
      [
        { op: 'update_props', blockId: 'hero', props: { headline: 'New' } },
        { op: 'update_props', blockId: 'nope', props: { headline: 'x' } },
        { op: 'set_variant', blockId: 'hero', variant: 'split' },
        { op: 'set_variant', blockId: 'hero', variant: 'carousel' },
        { op: 'add_block', type: 'faq' },
        { op: 'add_block', type: 'checkout' },
      ],
      page,
    )
    expect(valid.map((o) => o.op)).toEqual(['update_props', 'set_variant', 'add_block'])
    expect(rejected).toHaveLength(3)
  })

  it('rejects references to a block removed earlier in the same batch', () => {
    const { valid, rejected } = validateOperations(
      [
        { op: 'remove_block', blockId: 'hero' },
        { op: 'update_props', blockId: 'hero', props: { headline: 'x' } },
      ],
      page,
    )
    expect(valid).toHaveLength(1)
    expect(rejected).toHaveLength(1)
  })

  it('drops invalid theme values', () => {
    const { valid } = validateOperations([{ op: 'update_theme', theme: { accent: 'red', bg0: '#000000', radius: 99 } }], page)
    expect(valid).toEqual([{ op: 'update_theme', theme: { bg0: '#000000' } }])
  })
})

describe('applyOperations', () => {
  it('applies operations without mutating the input', () => {
    const { valid } = validateOperations(
      [
        { op: 'update_props', blockId: 'hero', props: { headline: 'New' } },
        { op: 'add_block', type: 'faq', props: { title: 'FAQ' } },
        { op: 'move_block', blockId: 'nav', toIndex: 1 },
        { op: 'apply_preset', presetId: 'ocean' },
      ],
      page,
    )
    const next = applyOperations(page, valid, (t) => `new-${t}`)
    expect(next.blocks.map((b) => b.id)).toEqual(['hero', 'nav', 'new-faq', 'foot'])
    expect(next.blocks[0].props.headline).toBe('New')
    expect(next.blocks[2].props.title).toBe('FAQ')
    expect(next.theme?.accent).not.toBe('#22c55e')
    expect(page.blocks[1].props.headline).toBe('Old')
    expect(page.blocks.map((b) => b.id)).toEqual(['nav', 'hero', 'foot'])
  })

  it('inserts a new block before a trailing footer by default, or after afterBlockId', () => {
    const before = applyOperations(page, [{ op: 'add_block', type: 'cta' }], () => 'c1')
    expect(before.blocks.map((b) => b.id)).toEqual(['nav', 'hero', 'c1', 'foot'])
    const after = applyOperations(page, [{ op: 'add_block', type: 'cta', afterBlockId: 'nav' }], () => 'c2')
    expect(after.blocks.map((b) => b.id)).toEqual(['nav', 'c2', 'hero', 'foot'])
  })
})
