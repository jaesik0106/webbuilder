import { useContext, type CSSProperties, type ReactNode } from 'react'
import { ElementEditorContext, type ElementItemProps, type ElementListProps } from './editorContext'
import { ImageIcon } from 'lucide-react'
import type { BlockConfig } from '../types'
import { boxStyle, cssSize, fillsHeight, hasPadding, paddingStyle, sizingStyle, typographyStyle } from './elementStyle'

/**
 * 기본 요소 렌더러: section > container > text / image / button / spacer.
 * 레이아웃은 flex 만 쓰고(Grid, absolute 없음), 너비는 % 와 max-width 중심이라 미리보기 크기에 맞춰 흐른다.
 *
 * 편집 화면은 ElementEditorContext 로 각 요소를 감싸는 Item 과 컨테이너 목록(List)을 바꿔 끼워
 * 선택 표시와 끌어 놓기를 붙인다. 방문자 화면은 기본 Item/List 를 쓰므로 똑같은 배치로 보인다.
 */

function PlainItem({ node, style, children }: ElementItemProps) {
  return <div data-element={node.type} style={style}>{children}</div>
}

function PlainList({ children }: ElementListProps) {
  return <>{children}</>
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const str = (value: unknown, fallback = '') => (typeof value === 'string' && value !== '' ? value : fallback)
/** 숫자는 px, 문자열(예: "50%", "auto")은 그대로 */
const size = (value: unknown, fallback: string) =>
  typeof value === 'number' ? `${value}px` : str(value, fallback)

/**
 * flex 항목 감싸개 스타일.
 * 가로 배치는 줄바꿈 없이 한 줄에 놓는다(피그마 가로 오토 레이아웃처럼).
 * - 텍스트·이미지·그룹은 남은 너비를 나눠 갖고, 버튼·여백은 제 크기만큼만 차지한다.
 * - 이미지 너비를 px 숫자로 정하면 그 너비로 고정된다.
 * - "비율로 나누기"면 비율(2 1 → 2fr 1fr)대로 나눈다.
 * 좁은 화면에서 위아래로 쌓는 것은 index.css 의 .el-row 가 맡는다.
 */
/** 컨테이너의 "칸 비율" 입력값("2 1", "1:1:1", "2,1")을 숫자 목록으로 바꾼다. */
function parseRatios(value: unknown): number[] {
  return String(value ?? '')
    .split(/[\s:,/]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
}

function itemStyle(node: BlockConfig, direction: string, ratio?: number): CSSProperties {
  // 비율 나누기 칸은 비율이 너비를 정하므로 너비 방식은 무시하고 높이·여백·최소/최대만 적용한다.
  const p = node.props
  const container = node.type === 'container'
  if (ratio !== undefined) return sizingStyle({ ...p, widthMode: undefined }, direction, legacyItemStyle(node, direction, ratio), container)
  return sizingStyle(p, direction, legacyItemStyle(node, direction), container)
}

function legacyItemStyle(node: BlockConfig, direction: string, ratio?: number): CSSProperties {
  const p = node.props
  if (direction === 'row' && ratio !== undefined) {
    return { flex: `${ratio} 1 0`, minWidth: 0 }
  }
  if (direction === 'row') {
    if (node.type === 'image' && typeof p.width === 'number') return { flex: `0 1 ${p.width}px`, minWidth: 0 }
    if (node.type === 'spacer') return { flex: `0 0 ${num(p.height, 40)}px` }
    if (node.type === 'button') return { flex: '0 0 auto' }
    return { flex: '1 1 0', minWidth: 0 }
  }
  return { minWidth: 0, maxWidth: '100%' }
}

function TextEl({ node }: { node: BlockConfig }) {
  const p = node.props
  return (
    <div
      style={{
        ...boxStyle(p),
        ...paddingStyle(p),
        height: fillsHeight(p) ? '100%' : undefined,
        boxSizing: 'border-box',
        fontSize: num(p.fontSize, 18),
        fontWeight: num(p.fontWeight, 400),
        color: str(p.color, 'var(--color-text-0)'),
        textAlign: str(p.textAlign, 'left') as CSSProperties['textAlign'],
        lineHeight: num(p.lineHeight, 1.6),
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        ...typographyStyle(p),
      }}
    >
      {str(p.content, '')}
    </div>
  )
}

function ImageEl({ node }: { node: BlockConfig }) {
  const p = node.props
  const src = str(p.src)
  const radius = num(p.borderRadius, 0)
  // 크기 방식을 정했으면 감싸개가 크기를 맡고 이미지는 감싸개를 채운다. 아니면 예전처럼 width/height 를 이미지에 쓴다.
  const sized = !!p.widthMode
  const width = sized ? '100%' : size(p.width, '100%')
  const height = p.heightMode === 'fixed' || p.heightMode === 'fill' ? '100%' : p.heightMode === 'hug' ? 'auto' : size(p.height, 'auto')
  const box = boxStyle(p, { defaultRadius: radius })
  if (!src) {
    return (
      <div
        data-image-placeholder
        style={{ width, maxWidth: '100%', minHeight: 160, height: height === 'auto' ? undefined : height, borderRadius: box.borderRadius }}
        className="bg-bg-3 border border-dashed border-border-default flex flex-col items-center justify-center gap-1 text-text-3 text-[12px]"
      >
        <ImageIcon size={24} />
        이미지
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={str(p.alt)}
      style={{
        display: 'block',
        ...box,
        width,
        maxWidth: '100%',
        height,
        boxSizing: 'border-box',
        objectFit: str(p.objectFit, 'cover') as CSSProperties['objectFit'],
        objectPosition: str(p.objectPosition, 'center'),
      }}
    />
  )
}

function ButtonEl({ node }: { node: BlockConfig }) {
  const p = node.props
  // 너비를 채우기/고정으로 정하면 버튼이 감싸개를 채우고 글자는 가운데에 둔다.
  const stretch = p.widthMode === 'fill' || p.widthMode === 'fixed' || fillsHeight(p)
  return (
    <a
      href={str(p.href, '#')}
      style={{
        display: stretch ? 'flex' : 'inline-block',
        alignItems: 'center',
        justifyContent: 'center',
        width: p.widthMode === 'fill' || p.widthMode === 'fixed' ? '100%' : undefined,
        height: fillsHeight(p) ? '100%' : undefined,
        boxSizing: 'border-box',
        ...boxStyle(p, { fallbackColor: 'var(--color-green)', defaultRadius: 8 }),
        color: str(p.color, '#ffffff'),
        padding: hasPadding(p) ? undefined : str(p.padding, '12px 24px'),
        ...(hasPadding(p) ? paddingStyle(p, [12, 24, 12, 24]) : {}),
        fontSize: typeof p.fontSize === 'number' ? p.fontSize : undefined,
        fontWeight: num(p.fontWeight, 600),
        textDecoration: 'none',
        textAlign: 'center',
        maxWidth: '100%',
        ...typographyStyle(p),
      }}
    >
      {str(p.text, '버튼')}
    </a>
  )
}

/** 격자 칸 입력("1fr 2fr", "3", "200px 1fr")을 grid-template-columns 값으로 바꾼다. 숫자 하나면 그 개수만큼 같은 칸. */
function gridColumns(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (/^\d+$/.test(raw)) return `repeat(${Math.min(Number(raw), 12)}, minmax(0, 1fr))`
  // 허용 문자만 남긴다 (스타일 주입 방지)
  const safe = raw.replace(/[^0-9a-z%.()\s,-]/gi, '').trim()
  return safe || 'repeat(2, minmax(0, 1fr))'
}

function ContainerEl({ node }: { node: BlockConfig }) {
  const p = node.props
  const editor = useContext(ElementEditorContext)
  const List = editor?.List ?? PlainList
  const direction = str(p.flexDirection, 'column')
  const children = node.children ?? []
  // 칸 나누기: 컨테이너에 적은 비율을 순서대로 쓰고, 모자라면 요소의 flexRatio(없으면 1)를 쓴다.
  const split = str(p.columns, 'auto') === 'equal'
  const ratios = parseRatios(p.ratios)
  const ratioFor = (child: BlockConfig, index: number) =>
    split ? ratios[index] ?? (num(child.props.flexRatio, 1) > 0 ? num(child.props.flexRatio, 1) : 1) : undefined
  // 격자(grid): 칸은 CSS 변수로 넘기고, 좁은 화면에서 한 줄로 쌓는 규칙은 index.css 의 .el-grid 가 맡는다.
  const grid = str(p.display, 'flex') === 'grid'
  const layoutStyle: CSSProperties = grid
    ? ({ display: 'grid', '--el-grid-cols': gridColumns(p.gridColumns), alignItems: str(p.alignItems, 'stretch') } as CSSProperties)
    : {
        display: 'flex',
        flexDirection: direction === 'row' ? 'row' : 'column',
        flexWrap: 'nowrap',
        justifyContent: str(p.justifyContent, 'flex-start'),
        alignItems: str(p.alignItems, 'stretch'),
      }
  return (
    <div
      className={grid ? 'el-grid' : direction === 'row' ? 'el-row' : undefined}
      data-stack-mobile={(grid || direction === 'row') && p.stackOnMobile !== false ? 'true' : undefined}
      style={{
        ...layoutStyle,
        gap: num(p.gap, 16),
        width: '100%',
        maxWidth: size(p.maxWidth, '1700px'),
        marginLeft: 'auto',
        marginRight: 'auto',
        ...paddingStyle(p, [0, 15, 0, 15]),
        height: fillsHeight(p) ? '100%' : undefined,
        minHeight: cssSize(p.minHeight) ?? (children.length === 0 ? 80 : undefined),
        maxHeight: cssSize(p.maxHeight),
        boxSizing: 'border-box',
        ...boxStyle(p),
      }}
    >
      <List container={node}>
        {children.map((child, index) => (
          <ElementNode key={child.id} node={child} direction={grid ? 'grid' : direction} ratio={grid ? undefined : ratioFor(child, index)} />
        ))}
      </List>
    </div>
  )
}

function SectionEl({ node }: { node: BlockConfig }) {
  const p = node.props
  return (
    <section
      style={{
        ...boxStyle(p),
        ...paddingStyle(p, [80, undefined, 80, undefined]),
        minHeight: num(p.minHeight, 0) || undefined,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {(node.children ?? []).map((child) => (
        <ElementNode key={child.id} node={child} direction="column" />
      ))}
    </section>
  )
}

function renderContent(node: BlockConfig): ReactNode {
  switch (node.type) {
    case 'section': return <SectionEl node={node} />
    case 'container': return <ContainerEl node={node} />
    case 'text': return <TextEl node={node} />
    case 'image': return <ImageEl node={node} />
    case 'button': return <ButtonEl node={node} />
    case 'spacer': return <div style={{ height: num(node.props.height, 40) }} />
    default: return null
  }
}

/** section 의 하위 노드 하나 (컨테이너 또는 요소) */
function ElementNode({ node, direction, ratio }: { node: BlockConfig; direction: string; ratio?: number }) {
  const editor = useContext(ElementEditorContext)
  const Item = editor?.Item ?? PlainItem
  return (
    <Item node={node} style={itemStyle(node, direction, ratio)}>
      {renderContent(node)}
    </Item>
  )
}

/** 최상위 section 블록 렌더러 (registry 의 RenderBlock 이 type 'section' 일 때 부른다). */
export function SectionRenderer({ block }: { block: BlockConfig }) {
  return <SectionEl node={block} />
}
