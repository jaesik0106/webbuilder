import type { CSSProperties } from 'react'

/**
 * 기본 요소 공통 스타일(피그마 A단계): 채우기, 테두리, 모서리, 효과, 여백, 크기 방식, 글자.
 * 모든 속성은 선택값이다. 값이 없으면 예전과 똑같이 그려지므로 기존 데이터는 변환할 필요가 없다.
 *
 * 속성 이름 (props)
 * - 채우기: backgroundColor, bgType('' | 'gradient' | 'image'), gradientAngle, gradientStops,
 *           bgImage, bgSize, bgPosition, bgRepeat, overlayType('none' | 'color' | 'gradient'), overlayColor, overlayAngle, overlayStops
 * - 테두리: borderWidth, borderColor, borderStyle, borderSides('all' | 'custom'), borderTop/Right/Bottom/LeftWidth
 * - 모서리: borderRadius, radiusMode('all' | 'custom'), radiusTL/TR/BR/BL
 * - 효과: shadowEnabled, shadowX, shadowY, shadowBlur, shadowSpread, shadowColor, opacity(0~100), overflow
 * - 여백: paddingTop/Right/Bottom/Left, marginTop, marginBottom
 * - 크기: widthMode/heightMode('fill' | 'hug' | 'fixed'), width, height, minWidth, maxWidth, minHeight, maxHeight
 *         (이미지의 width/height 는 예전부터 쓰던 키라 그대로 쓰고, widthMode 가 없으면 예전 방식으로 그린다)
 * - 글자: fontFamily, letterSpacing(px), textTransform, lineClamp, textDecoration
 */

type Props = Record<string, unknown>
export type GradientStop = { color: string; at: number }

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isStr = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** 숫자는 px, 문자열("50%", "auto")은 그대로. 비어 있으면 undefined */
export function cssSize(value: unknown): string | undefined {
  if (isNum(value)) return `${value}px`
  if (isStr(value)) return value
  return undefined
}

export const DEFAULT_STOPS: GradientStop[] = [
  { color: '#000000', at: 0 },
  { color: '#00000000', at: 100 },
]

export function readStops(value: unknown): GradientStop[] {
  if (!Array.isArray(value)) return DEFAULT_STOPS
  const stops = value
    .filter((s): s is GradientStop => !!s && typeof s === 'object' && isStr((s as GradientStop).color))
    .map((s) => ({ color: s.color, at: isNum(s.at) ? s.at : 0 }))
  return stops.length >= 2 ? stops : DEFAULT_STOPS
}

export function gradientCss(angle: unknown, stops: unknown): string {
  const list = readStops(stops)
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((s) => `${s.color} ${s.at}%`)
  return `linear-gradient(${isNum(angle) ? angle : 180}deg, ${list.join(', ')})`
}

/** 채우기: 덮개(위) > 이미지 > 그라데이션 > 단색(맨 아래) 순서로 겹친다. */
export function fillStyle(p: Props, fallbackColor?: string): CSSProperties {
  const style: CSSProperties = {}
  const color = isStr(p.backgroundColor) ? p.backgroundColor : fallbackColor
  if (color) style.backgroundColor = color

  const images: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  const repeats: string[] = []
  const layer = (image: string, size = '100% 100%', position = 'center', repeat = 'no-repeat') => {
    images.push(image)
    sizes.push(size)
    positions.push(position)
    repeats.push(repeat)
  }

  const type = p.bgType
  if (type === 'image' && isStr(p.bgImage)) {
    if (p.overlayType === 'color' && isStr(p.overlayColor)) layer(`linear-gradient(${p.overlayColor}, ${p.overlayColor})`)
    if (p.overlayType === 'gradient') layer(gradientCss(p.overlayAngle, p.overlayStops))
    layer(
      `url(${JSON.stringify(p.bgImage)})`,
      isStr(p.bgSize) ? p.bgSize : 'cover',
      isStr(p.bgPosition) ? p.bgPosition : 'center',
      p.bgRepeat === true ? 'repeat' : 'no-repeat',
    )
  } else if (type === 'gradient') {
    layer(gradientCss(p.gradientAngle, p.gradientStops))
  }

  if (images.length) {
    style.backgroundImage = images.join(', ')
    style.backgroundSize = sizes.join(', ')
    style.backgroundPosition = positions.join(', ')
    style.backgroundRepeat = repeats.join(', ')
  }
  return style
}

/** 테두리 + 모서리. defaultRadius 는 예전 기본값(버튼 8 등)을 지키기 위한 값. */
export function borderStyle(p: Props, defaultRadius = 0): CSSProperties {
  const style: CSSProperties = {}
  const width = isNum(p.borderWidth) ? p.borderWidth : 0
  const custom = p.borderSides === 'custom'
  const side = (key: string) => (isNum(p[key]) ? (p[key] as number) : width)
  const widths = custom
    ? [side('borderTopWidth'), side('borderRightWidth'), side('borderBottomWidth'), side('borderLeftWidth')]
    : [width, width, width, width]
  if (widths.some((w) => w > 0)) {
    style.borderStyle = isStr(p.borderStyle) ? (p.borderStyle as CSSProperties['borderStyle']) : 'solid'
    style.borderColor = isStr(p.borderColor) ? p.borderColor : '#d1d5db'
    style.borderWidth = widths.map((w) => `${w}px`).join(' ')
  }

  const all = isNum(p.borderRadius) ? p.borderRadius : defaultRadius
  if (p.radiusMode === 'custom') {
    const corner = (key: string) => (isNum(p[key]) ? (p[key] as number) : all)
    style.borderRadius = `${corner('radiusTL')}px ${corner('radiusTR')}px ${corner('radiusBR')}px ${corner('radiusBL')}px`
  } else if (all) {
    style.borderRadius = all
  }
  return style
}

/** 그림자, 투명도, 넘침 숨기기 */
export function effectStyle(p: Props): CSSProperties {
  const style: CSSProperties = {}
  if (p.shadowEnabled === true) {
    const n = (key: string, fallback: number) => (isNum(p[key]) ? (p[key] as number) : fallback)
    const color = isStr(p.shadowColor) ? p.shadowColor : '#00000040'
    style.boxShadow = `${n('shadowX', 0)}px ${n('shadowY', 4)}px ${n('shadowBlur', 12)}px ${n('shadowSpread', 0)}px ${color}`
  }
  if (isNum(p.opacity) && p.opacity < 100) style.opacity = Math.max(0, p.opacity) / 100
  if (p.overflow === 'hidden') style.overflow = 'hidden'
  return style
}

/** 안쪽 여백. defaults 는 요소별 예전 기본값 [위, 오른쪽, 아래, 왼쪽]. 값이 없고 기본값도 없으면 넣지 않는다. */
export function paddingStyle(p: Props, defaults: [number?, number?, number?, number?] = []): CSSProperties {
  const keys = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const
  const style: CSSProperties = {}
  keys.forEach((key, i) => {
    const value = isNum(p[key]) ? (p[key] as number) : defaults[i]
    if (value !== undefined) style[key] = value
  })
  return style
}

export function hasPadding(p: Props): boolean {
  return ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some((key) => isNum(p[key]))
}

/** 상자 스타일 묶음: 채우기 + 테두리/모서리 + 효과 */
export function boxStyle(p: Props, options: { fallbackColor?: string; defaultRadius?: number } = {}): CSSProperties {
  return { ...fillStyle(p, options.fallbackColor), ...borderStyle(p, options.defaultRadius), ...effectStyle(p) }
}

/** 글꼴, 자간, 대소문자, 밑줄, 줄 수 제한 */
export function typographyStyle(p: Props): CSSProperties {
  const style: CSSProperties = {}
  if (isStr(p.fontFamily)) style.fontFamily = p.fontFamily
  if (isNum(p.letterSpacing) && p.letterSpacing !== 0) style.letterSpacing = `${p.letterSpacing}px`
  if (isStr(p.textTransform) && p.textTransform !== 'none') style.textTransform = p.textTransform as CSSProperties['textTransform']
  if (isStr(p.textDecoration) && p.textDecoration !== 'none') style.textDecoration = p.textDecoration
  if (p.fontStyle === 'italic') style.fontStyle = 'italic'
  if (isNum(p.lineClamp) && p.lineClamp > 0) {
    Object.assign(style, {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: p.lineClamp,
      overflow: 'hidden',
    })
  }
  return style
}

/** 높이 방식이 채우기/고정이면 안쪽 요소가 감싸개 높이를 채워야 한다. */
export function fillsHeight(p: Props): boolean {
  return p.heightMode === 'fill' || p.heightMode === 'fixed'
}

/**
 * 크기 방식(감싸개에 적용). 부모 방향(row/column/grid)에 따라 피그마의 hug/fill/fixed 를 flex 값으로 바꾼다.
 * widthMode/heightMode 가 없으면 legacy 값을 그대로 돌려준다(기존 동작 유지).
 */
export function sizingStyle(p: Props, direction: string, legacy: CSSProperties, container = false): CSSProperties {
  const style: CSSProperties = { ...legacy }
  const row = direction === 'row'
  const width = cssSize(p.width)
  const height = cssSize(p.height)

  switch (p.widthMode) {
    case 'fill':
      if (row) Object.assign(style, { flex: '1 1 0', minWidth: 0 })
      else Object.assign(style, { alignSelf: 'stretch', width: 'auto' })
      break
    case 'hug':
      if (row) Object.assign(style, { flex: '0 0 auto' })
      else Object.assign(style, { width: 'fit-content', maxWidth: '100%' })
      break
    case 'fixed':
      if (row) Object.assign(style, { flex: '0 1 auto', width: width ?? 'auto', minWidth: 0 })
      else Object.assign(style, { width: width ?? 'auto', maxWidth: '100%' })
      break
  }

  switch (p.heightMode) {
    case 'fill':
      if (row || direction === 'grid') Object.assign(style, { alignSelf: 'stretch' })
      else Object.assign(style, { flex: '1 1 0' })
      break
    case 'fixed':
      if (height) style.height = height
      break
  }

  // 컨테이너는 최대 너비(가운데 정렬)와 최소/최대 높이를 안쪽 상자에 쓴다 (ContainerEl).
  const minWidth = cssSize(p.minWidth)
  if (minWidth) style.minWidth = minWidth
  if (!container) {
    const maxWidth = cssSize(p.maxWidth)
    const minHeight = cssSize(p.minHeight)
    const maxHeight = cssSize(p.maxHeight)
    if (maxWidth) style.maxWidth = maxWidth
    if (minHeight) style.minHeight = minHeight
    if (maxHeight) style.maxHeight = maxHeight
  }
  if (isNum(p.marginTop)) style.marginTop = p.marginTop
  if (isNum(p.marginBottom)) style.marginBottom = p.marginBottom
  return style
}
