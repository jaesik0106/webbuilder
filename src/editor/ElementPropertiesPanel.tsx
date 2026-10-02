import { useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Plus, X, Trash2 } from 'lucide-react'
import type { BlockConfig, ElementType } from '@/blocks/types'
import { readStops, type GradientStop } from '@/blocks/elements/elementStyle'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { FileManagerModal } from './FileManager'

/**
 * 기본 요소(section/container/text/image/button/spacer) 속성 패널. 프리셋 블록은 기존 PropertiesPanel 을 쓴다.
 * 피그마처럼 묶음(내용 / 레이아웃 / 크기 / 채우기 / 테두리 / 효과 / 글자)으로 나눠 보여 준다.
 * 스타일 속성의 의미는 src/blocks/elements/elementStyle.ts 에 정리되어 있다.
 */

type Props = Record<string, unknown>
type Option = { value: string | number | boolean; label: string }
type Field = { when?: (p: Props) => boolean } & (
  | { key: string; label: string; type: 'text' | 'textarea' | 'color' | 'image' }
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; unit?: string; placeholder?: string }
  | { key: string; label: string; type: 'select'; options: Option[] }
  | { key: string; label: string; type: 'size'; hint: string }
  /** 숫자 네 칸 (여백 상우하좌, 면별 테두리, 모서리별 둥글기, 그림자 X/Y/흐림/퍼짐). 키가 '' 인 칸은 숨긴다. */
  | { key: string; label: string; type: 'quad'; keys: [string, string, string, string]; labels: [string, string, string, string]; defaults?: (number | undefined)[]; min?: number }
  /** 선형 그라데이션: 각도 + 색 지점 2개 이상 */
  | { key: string; label: string; type: 'gradient'; angleKey: string }
)
type Group = { title: string; fields: Field[] }

const isGrid = (p: Props) => p.display === 'grid'
const isRow = (p: Props) => !isGrid(p) && p.flexDirection === 'row'

const ELEMENT_LABELS: Record<ElementType, string> = {
  section: '섹션', container: '컨테이너', text: '텍스트', image: '이미지', button: '버튼', spacer: '여백',
}

/* ---------- 묶음별 공통 필드 ---------- */

const sizeModeOptions: Option[] = [
  { value: '', label: '기본' },
  { value: 'fill', label: '채우기 (Fill)' },
  { value: 'hug', label: '내용 맞춤 (Hug)' },
  { value: 'fixed', label: '고정 (px, %)' },
]

const padding = (defaults: (number | undefined)[]): Field => ({
  key: 'padding', label: '안쪽 여백 (위 · 오른쪽 · 아래 · 왼쪽)', type: 'quad',
  keys: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'], labels: ['위', '오른쪽', '아래', '왼쪽'], defaults, min: 0,
})

const margins: Field = {
  key: 'margin', label: '바깥 여백 (위 · 아래)', type: 'quad',
  keys: ['marginTop', 'marginBottom', '', ''], labels: ['위', '아래', '', ''],
}

/** 크기 방식. 이미지는 예전 width/height 키를 그대로 쓰므로 방식이 '기본'일 때도 너비/높이 칸을 보인다. */
function sizing(options: { legacyImage?: boolean; containerMaxWidth?: boolean } = {}): Field[] {
  const showWidth = (p: Props) => p.widthMode === 'fixed' || (!!options.legacyImage && !p.widthMode)
  const showHeight = (p: Props) => p.heightMode === 'fixed' || (!!options.legacyImage && !p.heightMode)
  return [
    { key: 'widthMode', label: '너비 방식', type: 'select', options: sizeModeOptions },
    { key: 'width', label: '너비', type: 'size', hint: '예: 320, 50%', when: showWidth },
    { key: 'heightMode', label: '높이 방식', type: 'select', options: sizeModeOptions },
    { key: 'height', label: '높이', type: 'size', hint: '예: 240, auto', when: showHeight },
    { key: 'minWidth', label: '최소 너비', type: 'size', hint: '비움 = 없음' },
    { key: 'maxWidth', label: '최대 너비', type: 'size', hint: options.containerMaxWidth ? '예: 1200, 100%' : '비움 = 없음' },
    { key: 'minHeight', label: '최소 높이', type: 'size', hint: '비움 = 없음' },
    { key: 'maxHeight', label: '최대 높이', type: 'size', hint: '비움 = 없음' },
  ]
}

const isImageFill = (p: Props) => p.bgType === 'image'
const fill: Field[] = [
  { key: 'backgroundColor', label: '배경색', type: 'color' },
  {
    key: 'bgType', label: '배경 종류', type: 'select',
    options: [{ value: '', label: '색만' }, { value: 'gradient', label: '선형 그라데이션' }, { value: 'image', label: '이미지' }],
  },
  { key: 'gradientStops', label: '그라데이션', type: 'gradient', angleKey: 'gradientAngle', when: (p) => p.bgType === 'gradient' },
  { key: 'bgImage', label: '배경 이미지', type: 'image', when: isImageFill },
  {
    key: 'bgSize', label: '이미지 맞춤', type: 'select', when: isImageFill,
    options: [{ value: 'cover', label: '꽉 채우기 (cover)' }, { value: 'contain', label: '전체 보이기 (contain)' }, { value: 'auto', label: '원래 크기' }],
  },
  {
    key: 'bgPosition', label: '이미지 위치', type: 'select', when: isImageFill,
    options: [
      { value: 'center', label: '가운데' }, { value: 'top', label: '위' }, { value: 'bottom', label: '아래' },
      { value: 'left', label: '왼쪽' }, { value: 'right', label: '오른쪽' },
      { value: 'left top', label: '왼쪽 위' }, { value: 'right top', label: '오른쪽 위' },
      { value: 'left bottom', label: '왼쪽 아래' }, { value: 'right bottom', label: '오른쪽 아래' },
    ],
  },
  { key: 'bgRepeat', label: '반복', type: 'select', when: isImageFill, options: [{ value: false, label: '반복 안 함' }, { value: true, label: '바둑판 반복' }] },
  {
    key: 'overlayType', label: '이미지 위 덮개', type: 'select', when: isImageFill,
    options: [{ value: 'none', label: '없음' }, { value: 'color', label: '색' }, { value: 'gradient', label: '그라데이션' }],
  },
  { key: 'overlayColor', label: '덮개 색 (투명도 조절)', type: 'color', when: (p) => isImageFill(p) && p.overlayType === 'color' },
  { key: 'overlayStops', label: '덮개 그라데이션', type: 'gradient', angleKey: 'overlayAngle', when: (p) => isImageFill(p) && p.overlayType === 'gradient' },
]

function border(defaultRadius = 0): Field[] {
  return [
    { key: 'borderWidth', label: '두께', type: 'number', min: 0, max: 40, unit: 'px', placeholder: '0' },
    { key: 'borderSides', label: '적용 면', type: 'select', options: [{ value: 'all', label: '네 면 모두' }, { value: 'custom', label: '면별로 따로' }] },
    {
      key: 'borderSidesWidth', label: '면별 두께 (비우면 위 두께)', type: 'quad', when: (p) => p.borderSides === 'custom',
      keys: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'], labels: ['위', '오른쪽', '아래', '왼쪽'], min: 0,
    },
    { key: 'borderColor', label: '색', type: 'color' },
    {
      key: 'borderStyle', label: '스타일', type: 'select',
      options: [{ value: 'solid', label: '실선' }, { value: 'dashed', label: '긴 점선' }, { value: 'dotted', label: '점선' }, { value: 'double', label: '이중선' }],
    },
    { key: 'borderRadius', label: '모서리 둥글기', type: 'number', min: 0, max: 999, unit: 'px', placeholder: String(defaultRadius) },
    { key: 'radiusMode', label: '모서리 적용', type: 'select', options: [{ value: 'all', label: '모두 같게' }, { value: 'custom', label: '모서리별로 따로' }] },
    {
      key: 'radii', label: '모서리별 (왼위 · 오위 · 오아래 · 왼아래)', type: 'quad', when: (p) => p.radiusMode === 'custom',
      keys: ['radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'], labels: ['↖', '↗', '↘', '↙'], min: 0,
    },
  ]
}

const effects: Field[] = [
  { key: 'shadowEnabled', label: '그림자', type: 'select', options: [{ value: false, label: '없음' }, { value: true, label: '드롭 그림자' }] },
  {
    key: 'shadow', label: '그림자 (X · Y · 흐림 · 퍼짐)', type: 'quad', when: (p) => p.shadowEnabled === true,
    keys: ['shadowX', 'shadowY', 'shadowBlur', 'shadowSpread'], labels: ['X', 'Y', '흐림', '퍼짐'], defaults: [0, 4, 12, 0],
  },
  { key: 'shadowColor', label: '그림자 색', type: 'color', when: (p) => p.shadowEnabled === true },
  { key: 'opacity', label: '투명도 (100 = 불투명)', type: 'number', min: 0, max: 100, unit: '%', placeholder: '100' },
  { key: 'overflow', label: '넘침', type: 'select', options: [{ value: 'visible', label: '보이기' }, { value: 'hidden', label: '숨기기 (자르기)' }] },
]

const FONT_OPTIONS: Option[] = [
  { value: '', label: '테마 기본' },
  { value: "'Pretendard Variable', Pretendard, sans-serif", label: 'Pretendard' },
  { value: "'Noto Sans KR', sans-serif", label: 'Noto Sans KR' },
  { value: "'Noto Serif KR', serif", label: 'Noto Serif KR (명조)' },
  { value: "'DM Sans', sans-serif", label: 'DM Sans' },
  { value: "'Space Grotesk', sans-serif", label: 'Space Grotesk' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: 'Georgia, serif', label: 'Georgia' },
]

function typography(options: { withAlign?: boolean; colorLabel: string; defaultSize: number }): Field[] {
  const align: Field[] = options.withAlign
    ? [
        {
          key: 'textAlign', label: '정렬', type: 'select',
          options: [{ value: 'left', label: '왼쪽' }, { value: 'center', label: '가운데' }, { value: 'right', label: '오른쪽' }, { value: 'justify', label: '양쪽' }],
        },
        { key: 'lineHeight', label: '줄 간격', type: 'number', min: 0.8, max: 3, step: 0.05 },
      ]
    : []
  const clamp: Field[] = options.withAlign
    ? [{ key: 'lineClamp', label: '줄 수 제한 (0 = 없음)', type: 'number', min: 0, max: 20, placeholder: '0' }]
    : []
  return [
    { key: 'fontFamily', label: '글꼴', type: 'select', options: FONT_OPTIONS },
    { key: 'fontSize', label: '글자 크기', type: 'number', min: 8, max: 200, unit: 'px', placeholder: String(options.defaultSize) },
    {
      key: 'fontWeight', label: '굵기', type: 'select',
      options: [300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: w, label: String(w) })),
    },
    { key: 'color', label: options.colorLabel, type: 'color' },
    ...align,
    { key: 'letterSpacing', label: '자간', type: 'number', min: -10, max: 40, step: 0.1, unit: 'px', placeholder: '0' },
    {
      key: 'textTransform', label: '대소문자', type: 'select',
      options: [{ value: 'none', label: '그대로' }, { value: 'uppercase', label: '모두 대문자' }, { value: 'lowercase', label: '모두 소문자' }, { value: 'capitalize', label: '단어 첫 글자 대문자' }],
    },
    {
      key: 'textDecoration', label: '꾸밈', type: 'select',
      options: [{ value: 'none', label: '없음' }, { value: 'underline', label: '밑줄' }, { value: 'line-through', label: '가운데 줄' }],
    },
    { key: 'fontStyle', label: '기울임', type: 'select', options: [{ value: 'normal', label: '보통' }, { value: 'italic', label: '기울임' }] },
    ...clamp,
  ]
}

const groups: Record<ElementType, Group[]> = {
  section: [
    { title: '레이아웃', fields: [padding([80, 0, 80, 0])] },
    { title: '크기', fields: [{ key: 'minHeight', label: '최소 높이 (0 = 자동)', type: 'number', min: 0, max: 2000, unit: 'px' }] },
    { title: '채우기', fields: fill },
    { title: '테두리', fields: border() },
    { title: '효과', fields: effects },
  ],
  container: [
    {
      title: '레이아웃',
      fields: [
        {
          key: 'display', label: '배치 방식', type: 'select',
          options: [{ value: 'flex', label: '줄 배치 (flex)' }, { value: 'grid', label: '격자 (grid)' }],
        },
        {
          key: 'flexDirection', label: '방향', type: 'select', when: (p) => !isGrid(p),
          options: [{ value: 'column', label: '세로 (Column)' }, { value: 'row', label: '가로 (Row)' }],
        },
        { key: 'gridColumns', label: '격자 칸 (예: 1fr 2fr / 3 / 200px 1fr)', type: 'text', when: isGrid },
        {
          key: 'stackOnMobile', label: '좁은 화면에서', type: 'select', when: (p) => isGrid(p) || isRow(p),
          options: [{ value: true, label: '한 줄로 쌓기' }, { value: false, label: '칸 그대로' }],
        },
        {
          key: 'justifyContent', label: '주축 정렬 (가로 배치일 때 좌우)', type: 'select', when: (p) => !isGrid(p),
          options: [
            { value: 'flex-start', label: '시작 (Start)' }, { value: 'center', label: '가운데 (Center)' },
            { value: 'flex-end', label: '끝 (End)' }, { value: 'space-between', label: '양 끝 (Space Between)' },
          ],
        },
        {
          key: 'alignItems', label: '세로 정렬', type: 'select',
          options: [
            { value: 'flex-start', label: '시작 (Start)' }, { value: 'center', label: '가운데 (Center)' },
            { value: 'flex-end', label: '끝 (End)' }, { value: 'stretch', label: '늘이기 (Stretch)' },
          ],
        },
        {
          key: 'columns', label: '칸 나누기', type: 'select', when: isRow,
          options: [{ value: 'auto', label: '자동 (내용 크기대로)' }, { value: 'equal', label: '비율로 나누기' }],
        },
        { key: 'ratios', label: '칸 비율 (예: 1 1 / 2 1 / 1 1 1)', type: 'text', when: (p) => isRow(p) && p.columns === 'equal' },
        { key: 'gap', label: '요소 간격', type: 'number', min: 0, max: 200, unit: 'px' },
        padding([0, 15, 0, 15]),
        margins,
      ],
    },
    { title: '크기', fields: sizing({ containerMaxWidth: true }) },
    { title: '채우기', fields: fill },
    { title: '테두리', fields: border() },
    { title: '효과', fields: effects },
  ],
  text: [
    { title: '내용', fields: [{ key: 'content', label: '내용', type: 'textarea' }] },
    { title: '글자', fields: typography({ withAlign: true, colorLabel: '글자색 (비우면 테마 색)', defaultSize: 18 }) },
    { title: '레이아웃', fields: [padding([]), margins] },
    { title: '크기', fields: sizing() },
    { title: '채우기', fields: fill },
    { title: '테두리', fields: border() },
    { title: '효과', fields: effects },
  ],
  image: [
    {
      title: '내용',
      fields: [
        { key: 'src', label: '이미지 (더블클릭해도 파일관리자)', type: 'image' },
        { key: 'alt', label: '대체 텍스트', type: 'text' },
        {
          key: 'objectFit', label: '맞춤 (높이를 정했을 때)', type: 'select',
          options: [{ value: 'cover', label: '꽉 채우기 (잘림)' }, { value: 'contain', label: '전체 보이기' }],
        },
        {
          key: 'objectPosition', label: '보일 위치 (잘릴 때)', type: 'select',
          options: [{ value: 'center', label: '가운데' }, { value: 'top', label: '위' }, { value: 'bottom', label: '아래' }, { value: 'left', label: '왼쪽' }, { value: 'right', label: '오른쪽' }],
        },
      ],
    },
    { title: '레이아웃', fields: [margins] },
    { title: '크기', fields: sizing({ legacyImage: true }) },
    { title: '채우기', fields: fill },
    { title: '테두리', fields: border() },
    { title: '효과', fields: effects },
  ],
  button: [
    { title: '내용', fields: [{ key: 'text', label: '버튼 글자', type: 'text' }, { key: 'href', label: '링크', type: 'text' }] },
    { title: '글자', fields: typography({ colorLabel: '글자색', defaultSize: 16 }) },
    { title: '레이아웃', fields: [padding([12, 24, 12, 24]), margins] },
    { title: '크기', fields: sizing() },
    { title: '채우기', fields: fill.map((f) => (f.key === 'backgroundColor' ? { ...f, label: '배경색 (비우면 강조색)' } : f)) },
    { title: '테두리', fields: border(8) },
    { title: '효과', fields: effects },
  ],
  spacer: [
    { title: '내용', fields: [{ key: 'height', label: '높이', type: 'number', min: 0, max: 600, unit: 'px' }] },
    { title: '레이아웃', fields: [margins] },
  ],
}

const inputClass = 'w-full px-2 py-1.5 rounded border border-border-default bg-bg-2 text-text-0 text-xs outline-none focus:border-green'

/** "320" 처럼 숫자만 쓰면 px 숫자로, "50%"·"auto" 는 문자열로 저장한다. */
function parseSize(raw: string): string | number {
  const trimmed = raw.trim()
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed
}

/** "#rrggbb" 또는 "#rrggbbaa" 를 색과 불투명도(0~100)로 나눈다. 다른 형식(rgba, var)은 null. */
function splitHex(value: unknown): { hex: string; alpha: number } | null {
  if (typeof value !== 'string') return null
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim())
  if (!match) return null
  return { hex: `#${match[1].toLowerCase()}`, alpha: match[2] ? Math.round((parseInt(match[2], 16) / 255) * 100) : 100 }
}

function joinHex(hex: string, alpha: number): string {
  if (alpha >= 100) return hex
  const a = Math.round((Math.max(0, alpha) / 100) * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

/** 색 + 불투명도(%) + 직접 입력. 불투명도는 #rrggbbaa 로 저장한다. */
function ColorInput({ value, onChange, placeholder = '비움 = 기본' }: { value: unknown; onChange: (next: string) => void; placeholder?: string }) {
  const parts = splitHex(value)
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={parts?.hex ?? '#ffffff'}
        onChange={(e) => onChange(joinHex(e.target.value, parts?.alpha ?? 100))}
        className="w-8 h-7 shrink-0 rounded border border-border-default bg-bg-2 cursor-pointer"
      />
      <input type="text" value={String(value ?? '')} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      <div className="flex items-center gap-0.5 shrink-0" title="불투명도">
        <input
          type="number"
          min={0}
          max={100}
          disabled={!parts}
          value={parts ? parts.alpha : ''}
          onChange={(e) => parts && onChange(joinHex(parts.hex, e.target.value === '' ? 100 : Number(e.target.value)))}
          className={`${inputClass} !w-12 disabled:opacity-40`}
        />
        <span className="text-text-3 text-[13px]">%</span>
      </div>
    </div>
  )
}

function QuadInput({ field, node }: { field: Extract<Field, { type: 'quad' }>; node: BlockConfig }) {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  return (
    <div className="grid grid-cols-4 gap-1">
      {field.keys.map((key, i) =>
        key ? (
          <label key={key} className="flex flex-col items-center gap-0.5">
            <input
              type="number"
              min={field.min}
              value={typeof node.props[key] === 'number' ? (node.props[key] as number) : ''}
              placeholder={field.defaults?.[i] !== undefined ? String(field.defaults[i]) : '0'}
              onChange={(e) => updateBlockProps(node.id, { [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
              className={`${inputClass} text-center !px-1`}
            />
            <span className="text-text-3 text-[12px]">{field.labels[i]}</span>
          </label>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  )
}

function GradientInput({ field, node }: { field: Extract<Field, { type: 'gradient' }>; node: BlockConfig }) {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const stops = readStops(node.props[field.key])
  const angle = node.props[field.angleKey]
  const setStops = (next: GradientStop[]) => updateBlockProps(node.id, { [field.key]: next })
  const preview = `linear-gradient(${typeof angle === 'number' ? angle : 180}deg, ${[...stops].sort((a, b) => a.at - b.at).map((s) => `${s.color} ${s.at}%`).join(', ')})`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-5 rounded border border-border-default" style={{ backgroundImage: `${preview}, repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%)`, backgroundSize: 'auto, 10px 10px' }} />
      <div className="flex items-center gap-1.5">
        <span className="text-text-3 text-[13px] shrink-0">각도</span>
        <input
          type="number"
          min={0}
          max={360}
          value={typeof angle === 'number' ? angle : ''}
          placeholder="180"
          onChange={(e) => updateBlockProps(node.id, { [field.angleKey]: e.target.value === '' ? undefined : Number(e.target.value) })}
          className={inputClass}
        />
        <span className="text-text-3 text-[13px]">°</span>
      </div>
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <ColorInput value={stop.color} onChange={(color) => setStops(stops.map((s, j) => (j === i ? { ...s, color } : s)))} placeholder="#000000" />
          </div>
          <input
            type="number"
            min={0}
            max={100}
            title="위치 (%)"
            value={stop.at}
            onChange={(e) => setStops(stops.map((s, j) => (j === i ? { ...s, at: Number(e.target.value) || 0 } : s)))}
            className={`${inputClass} !w-12 shrink-0`}
          />
          <button
            type="button"
            title="색 지점 빼기"
            disabled={stops.length <= 2}
            onClick={() => setStops(stops.filter((_, j) => j !== i))}
            className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-text-3 hover:text-red-500 disabled:opacity-30"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setStops([...stops, { color: stops[stops.length - 1].color, at: 100 }])}
        className="self-start h-6 px-2 rounded text-[13px] text-[#1c54e4] hover:bg-[#eef3ff] inline-flex items-center gap-1"
      >
        <Plus size={11} />
        색 지점 추가
      </button>
    </div>
  )
}

/** 이미지 주소 + 파일관리자에서 고르기 */
function ImagePickInput({ value, onChange }: { value: unknown; onChange: (url: string) => void }) {
  const [picking, setPicking] = useState(false)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const folder = useProjectsStore((s) =>
    s.projects.find((project) => project.id === activeProjectId)?.isHome === false ? 'sub' : 'main',
  )
  return (
    <div className="flex items-center gap-1.5">
      <input type="text" value={String(value ?? '')} placeholder="이미지 주소" onChange={(e) => onChange(e.target.value)} className={inputClass} />
      <button
        type="button"
        title="파일관리자에서 고르기"
        onClick={() => setPicking(true)}
        className="h-7 px-2 shrink-0 rounded border border-border-default text-[13px] text-text-1 hover:border-[#1c54e4] hover:text-[#1c54e4] inline-flex items-center gap-1"
      >
        <FolderOpen size={12} />
        파일
      </button>
      {picking && (
        <FileManagerModal
          initialFolder={folder}
          onClose={() => setPicking(false)}
          onPick={(url) => {
            onChange(url)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

function FieldInput({ field, node }: { field: Field; node: BlockConfig }) {
  const updateBlockProps = useConfigStore((s) => s.updateBlockProps)
  const value = node.props[field.key]
  const set = (next: unknown) => updateBlockProps(node.id, { [field.key]: next })

  let input
  switch (field.type) {
    case 'textarea':
      input = <textarea rows={4} value={String(value ?? '')} onChange={(e) => set(e.target.value)} className={`${inputClass} resize-y`} />
      break
    case 'number':
      input = (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={typeof value === 'number' ? value : ''}
            placeholder={field.placeholder}
            // 비우면 값을 지워 요소의 기본값으로 돌아간다
            onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
            className={inputClass}
          />
          {field.unit && <span className="text-text-3 text-[13px]">{field.unit}</span>}
        </div>
      )
      break
    case 'select': {
      // 저장된 값이 목록에 없으면(예: 직접 넣은 글꼴) 그 값도 고를 수 있게 보여 준다.
      const known = value === undefined || field.options.some((o) => String(o.value) === String(value))
      input = (
        <select
          value={String(value ?? '')}
          onChange={(e) => {
            const option = field.options.find((o) => String(o.value) === e.target.value)
            set(option ? option.value : e.target.value)
          }}
          className={`${inputClass} cursor-pointer`}
        >
          {field.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          {!known && <option value={String(value)}>{String(value)}</option>}
        </select>
      )
      break
    }
    case 'color':
      input = <ColorInput value={value} onChange={set} />
      break
    case 'image':
      input = <ImagePickInput value={value} onChange={set} />
      break
    case 'quad':
      input = <QuadInput field={field} node={node} />
      break
    case 'gradient':
      input = <GradientInput field={field} node={node} />
      break
    case 'size':
      input = <input type="text" value={String(value ?? '')} placeholder={field.hint} onChange={(e) => set(parseSize(e.target.value))} className={inputClass} />
      break
    default:
      input = <input type="text" value={String(value ?? '')} onChange={(e) => set(e.target.value)} className={inputClass} />
  }

  return (
    <div className="mb-2.5">
      <label className="block text-[13.5px] text-text-2 mb-1 font-medium">{field.label}</label>
      {input}
    </div>
  )
}

/** 피그마식 접는 묶음. 접힌 묶음은 요소를 바꿔도 접힌 채로 둔다. */
const collapsedGroups = new Set<string>()

function GroupSection({ group, node }: { group: Group; node: BlockConfig }) {
  const [open, setOpen] = useState(!collapsedGroups.has(group.title))
  const visible = group.fields.filter((field) => !field.when || field.when(node.props))
  if (visible.length === 0) return null
  return (
    <div className="border-t border-border-subtle first:border-t-0">
      <button
        type="button"
        onClick={() => {
          if (open) collapsedGroups.add(group.title)
          else collapsedGroups.delete(group.title)
          setOpen(!open)
        }}
        className="w-full flex items-center gap-1 py-2 text-[14px] font-semibold text-text-0 hover:text-[#1c54e4]"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {group.title}
      </button>
      {open && <div className="pb-1.5">{visible.map((field) => <FieldInput key={field.key} field={field} node={node} />)}</div>}
    </div>
  )
}

export function ElementPropertiesPanel({ node }: { node: BlockConfig }) {
  const removeBlock = useConfigStore((s) => s.removeBlock)
  const selectBlock = useEditorStore((s) => s.selectBlock)
  const type = node.type as ElementType

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-text-0 text-[15px] font-semibold">{ELEMENT_LABELS[type] ?? type}</div>
          <div className="text-text-3 text-[12.5px] font-mono">{node.type}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            removeBlock(node.id)
            selectBlock(null)
          }}
          className="h-7 px-2 rounded-md text-[13.5px] text-text-2 hover:text-red-500 hover:bg-bg-3 inline-flex items-center gap-1"
        >
          <Trash2 size={12} />
          {type === 'section' ? '섹션 삭제' : '삭제'}
        </button>
      </div>
      {(groups[type] ?? []).map((group) => <GroupSection key={group.title} group={group} node={node} />)}
    </div>
  )
}
