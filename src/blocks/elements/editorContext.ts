import { createContext, type CSSProperties, type ReactNode } from 'react'
import type { BlockConfig } from '../types'

// 편집 화면이 기본 요소 렌더러에 선택 표시와 끌어 놓기를 끼워 넣는 통로.
// 방문자 화면에서는 null 이라 렌더러가 기본 감싸개를 쓴다.

export interface ElementItemProps {
  node: BlockConfig
  style: CSSProperties
  children: ReactNode
}

export interface ElementListProps {
  container: BlockConfig
  children: ReactNode
}

export interface ElementEditorApi {
  Item: (props: ElementItemProps) => ReactNode
  List: (props: ElementListProps) => ReactNode
}

export const ElementEditorContext = createContext<ElementEditorApi | null>(null)
