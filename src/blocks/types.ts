export type BlockType =
  | 'navbar'
  | 'hero'
  | 'features'
  | 'pricing'
  | 'cta'
  | 'footer'
  | 'testimonials'
  | 'stats'
  | 'faq'
  | 'team'
  | 'contact'
  | 'newsletter'
  | 'logocloud'
  | 'divider'
  | 'banner'
  | 'content'
  | 'image'
  | 'video'
  | 'gallery'
  // 기본 요소 (Section > Container > Text/Image/Button/Spacer). 'image' 는 위 프리셋과 이름이 같지만,
  // section 의 children 안에서는 기본 이미지 요소로 렌더링한다.
  | 'section'
  | 'container'
  | 'text'
  | 'button'
  | 'spacer'

export type ElementType = 'section' | 'container' | 'text' | 'image' | 'button' | 'spacer'

export type BlockVariant = string

export interface BlockConfig {
  id: string
  type: BlockType
  variant: BlockVariant
  props: Record<string, unknown>
  /** section / container 만 가진다. 기존 프리셋 블록에는 없다 (하위 호환). */
  children?: BlockConfig[]
}

export interface ThemeConfig {
  // Backgrounds
  bg0: string
  bg1: string
  bg2: string
  bg3: string
  bg4: string
  bg5: string
  // Text
  text0: string
  text1: string
  text2: string
  text3: string
  // Accent
  accent: string
  accentDim: string
  // Borders
  borderDefault: string
  borderSubtle: string
  borderHover: string
  // Fonts
  fontSans: string
  fontDisplay: string
  fontMono: string
  // Radius
  radius: number
  radiusLg: number
}

export interface PageConfig {
  id: string
  name: string
  path: string
  blocks: BlockConfig[]
}

export interface SiteConfig {
  name: string
  pages?: PageConfig[]
  blocks: BlockConfig[]
  theme?: Partial<ThemeConfig>
}
