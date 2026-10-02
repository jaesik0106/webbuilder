import { describe, expect, it } from 'vitest'
import { borderStyle, boxStyle, effectStyle, fillStyle, gradientCss, paddingStyle, sizingStyle, typographyStyle } from '../src/blocks/elements/elementStyle'

describe('element style (A단계)', () => {
  it('old data without style props renders as before', () => {
    expect(boxStyle({ backgroundColor: '' })).toEqual({})
    expect(boxStyle({ backgroundColor: '#fff' })).toEqual({ backgroundColor: '#fff' })
    expect(borderStyle({}, 8)).toEqual({ borderRadius: 8 })
    expect(paddingStyle({ paddingLeft: 15, paddingRight: 15 }, [0, 15, 0, 15])).toEqual({ paddingTop: 0, paddingRight: 15, paddingBottom: 0, paddingLeft: 15 })
    const legacy = { flex: '1 1 0', minWidth: 0 }
    expect(sizingStyle({ width: '100%', height: 'auto' }, 'row', legacy)).toEqual(legacy)
    expect(typographyStyle({ fontSize: 18 })).toEqual({})
  })

  it('stacks overlay, image, color in Figma order', () => {
    const style = fillStyle({
      backgroundColor: '#111111', bgType: 'image', bgImage: '/uploads/main/a.jpg', bgSize: 'contain', bgPosition: 'top',
      overlayType: 'gradient', overlayAngle: 0, overlayStops: [{ color: '#000000cc', at: 0 }, { color: '#00000000', at: 60 }],
    })
    expect(style.backgroundColor).toBe('#111111')
    expect(style.backgroundImage).toBe('linear-gradient(0deg, #000000cc 0%, #00000000 60%), url("/uploads/main/a.jpg")')
    expect(style.backgroundSize).toBe('100% 100%, contain')
    expect(style.backgroundPosition).toBe('center, top')
  })

  it('gradient sorts stops and defaults to 180deg', () => {
    expect(gradientCss(undefined, [{ color: '#fff', at: 100 }, { color: '#000', at: 0 }])).toBe('linear-gradient(180deg, #000 0%, #fff 100%)')
  })

  it('per-side border and per-corner radius', () => {
    const style = borderStyle({ borderWidth: 0, borderSides: 'custom', borderTopWidth: 4, borderColor: '#1c54e4', radiusMode: 'custom', borderRadius: 10, radiusTL: 0 })
    expect(style.borderWidth).toBe('4px 0px 0px 0px')
    expect(style.borderColor).toBe('#1c54e4')
    expect(style.borderRadius).toBe('0px 10px 10px 10px')
  })

  it('shadow, opacity, overflow', () => {
    expect(effectStyle({ shadowEnabled: true, shadowY: 8, shadowColor: '#0003', opacity: 50, overflow: 'hidden' })).toEqual({
      boxShadow: '0px 8px 12px 0px #0003', opacity: 0.5, overflow: 'hidden',
    })
  })

  it('hug / fill / fixed sizing by parent direction', () => {
    expect(sizingStyle({ widthMode: 'fixed', width: 560 }, 'row', {})).toMatchObject({ flex: '0 1 auto', width: '560px' })
    expect(sizingStyle({ widthMode: 'hug' }, 'column', {})).toMatchObject({ width: 'fit-content' })
    expect(sizingStyle({ widthMode: 'fill', heightMode: 'fixed', height: 600, maxWidth: 800 }, 'column', {})).toMatchObject({ alignSelf: 'stretch', height: '600px', maxWidth: '800px' })
    // 컨테이너의 maxWidth 는 감싸개가 아니라 안쪽 상자에 쓴다
    expect(sizingStyle({ maxWidth: 1200 }, 'column', {}, true).maxWidth).toBeUndefined()
  })

  it('typography: letter spacing, uppercase, underline, line clamp', () => {
    expect(typographyStyle({ letterSpacing: -0.5, textTransform: 'uppercase', textDecoration: 'underline', lineClamp: 2 })).toMatchObject({
      letterSpacing: '-0.5px', textTransform: 'uppercase', textDecoration: 'underline', WebkitLineClamp: 2, overflow: 'hidden',
    })
  })
})
