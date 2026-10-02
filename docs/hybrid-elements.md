# 하이브리드 블록: 기본 요소(Section > Container > Element) 1차 구현

기존 프리셋 블록(Hero, Features, CTA, Footer 등)은 그대로 두고, 빈 섹션 안에 텍스트, 이미지, 버튼, 여백을 자유롭게 넣을 수 있게 확장했다.

## 0. 시작 전 구조 분석

> 참고: 별도 에디터 화면(/editor, Canvas, LayersPanel, BlockWrapper)은 2026-10-01 에 사용자 요청으로 삭제했다.
> 그래서 이번 기능은 지금의 편집 화면인 "페이지 위 관리자 도구"(OnPageEditor)에 붙였다.

| 항목 | 위치 / 방식 |
| --- | --- |
| BlockConfig 타입 | `src/blocks/types.ts` (`id`, `type`, `variant`, `props`) |
| 렌더러 | `src/blocks/registry.tsx` 의 `RenderBlock` → `blockRenderers[type]` 표 |
| 블록 목록(Block Library) | `src/editor/OnPageEditor.tsx` 의 `AddSectionPanel` (`blockMetadata` 목록) |
| 속성 패널 | `src/editor/RightSidebar.tsx` → 프리셋은 `PropertiesPanel`(타입별 필드 표), 테마는 `DesignPanel` |
| 선택 상태 | `src/store/editorStore.ts` 의 `selectedBlockId` 문자열 하나 |
| 끌어 놓기 | `@dnd-kit` 은 설치되어 있으나, 블록 순서 변경을 쓰던 LayersPanel 이 삭제되어 쓰는 곳이 없었다. 섹션 이동은 위/아래 버튼 |
| 실행 취소 | `src/store/configStore.ts` 의 `pushUndo` 가 매 변경 전 페이지 전체(pages, blocks, theme)를 깊은 복사로 저장 |
| 저장 | `useAutoSaveToProject` 가 config 변경을 감지해 서버에 저장 (변경 없음) |

**구현 전략**
- 데이터: `BlockConfig` 에 선택적 `children` 하나만 추가. 기존 블록 데이터는 변환 없이 그대로 동작.
- 최상위에서 `type: 'section'` 만 새 렌더러로 보내고, 나머지는 기존 렌더러 그대로.
- `children` 안의 노드는 항상 기본 요소로 렌더링. 그래서 최상위 `image`(기존 이미지 프리셋)와 children 안의 `image`(기본 이미지 요소)가 충돌하지 않는다.
- 저장소의 기존 함수(`updateBlockProps`, `updateBlock`, `removeBlock`, `duplicateBlock`)를 트리에서도 id 를 찾도록 확장하고, `addChild`, `moveNode` 두 개만 추가. 모두 기존 `pushUndo` 를 거치므로 실행 취소에 자동 포함.
- 편집 표시(선택 테두리, 끌어 놓기)는 렌더러 안에 넣지 않고, React context 로 끼워 넣는다. 방문자 화면과 편집 화면이 같은 레이아웃 코드를 쓴다.

## 1. 수정한 파일

- `src/blocks/types.ts`: `section`, `container`, `text`, `button`, `spacer` 타입 추가, `ElementType`, `children` 추가
- `src/blocks/registry.tsx`: `section` → `SectionRenderer` 등록
- `src/store/configStore.ts`: 중첩 노드 수정/삭제/복제, `addChild`, `moveNode` (실행 취소 포함)
- `src/editor/RightSidebar.tsx`: 선택된 노드를 트리에서 찾고, 기본 요소면 새 속성 패널 표시
- `src/editor/OnPageEditor.tsx`: 블록 목록을 "기본 요소 / 프리셋 블록" 두 그룹으로, 빈 섹션과 요소 추가, 편집 영역을 `ElementEditorProvider` 로 감쌈

## 2. 새로 추가한 파일

- `src/lib/element-tree.ts`: 트리 도우미 (생성, 찾기, 복제, 넣을 컨테이너 고르기)
- `src/blocks/elements/ElementRenderer.tsx`: section / container / text / image / button / spacer 렌더러 (flex 전용)
- `src/blocks/elements/editorContext.ts`: 편집 화면이 렌더러에 선택, 끌어 놓기를 끼워 넣는 context
- `src/editor/ElementEditor.tsx`: 요소 선택, 요소별 도구 막대, 텍스트 바로 수정, 이미지 파일관리자, dnd-kit 끌어 놓기
- `src/editor/ElementPropertiesPanel.tsx`: 기본 요소 속성 패널
- `tests/element-tree.test.ts`: 트리와 저장소 동작 테스트 8개

## 3. 데이터 구조 변경

```ts
interface BlockConfig {
  id: string
  type: BlockType        // 기존 타입 + 'section' | 'container' | 'text' | 'button' | 'spacer'
  variant: string        // 기본 요소는 'default'
  props: Record<string, unknown>
  children?: BlockConfig[] // section, container 만 가짐
}
```

빈 섹션을 추가하면 이렇게 저장된다.

```json
{
  "id": "section-…", "type": "section", "variant": "default",
  "props": { "backgroundColor": "", "paddingTop": 80, "paddingBottom": 80, "minHeight": 0 },
  "children": [
    {
      "id": "container-…", "type": "container", "variant": "default",
      "props": { "maxWidth": 1700, "display": "flex", "flexDirection": "column", "justifyContent": "flex-start",
                 "alignItems": "stretch", "gap": 16, "paddingLeft": 15, "paddingRight": 15 },
      "children": []
    }
  ]
}
```

요소별 속성: 요청 문서의 목록과 같다 (Text: content, fontSize, fontWeight, color, textAlign, lineHeight 등).
크기 값은 숫자면 px, 문자열이면 그대로(`"50%"`, `"auto"`) 쓴다.

### 추가: 비율로 칸 나누기 (2026-10-02)

컨테이너 속성 "칸 나누기"를 "비율로 나누기"로 두고 가로 배치한 뒤, "칸 비율"에 `2 1`, `1 1 1` 처럼 숫자를 적으면 안의 요소가 순서대로 그 비율로 너비를 나눈다 (`ratios` 속성, `:` `,` 로도 구분 가능).
`2 1` 은 CSS Grid 의 2fr 1fr 과 같다. 비율을 비우거나 숫자가 모자라면 1 로 계산한다. 칸이 240px 보다 좁아지면 줄바꿈되어 모바일에서는 한 줄씩 쌓인다.

### 추가: 디자인 모드 1단계, 그룹과 격자 (2026-10-02)

- Shift+클릭으로 같은 그룹 안의 요소를 여러 개 고르고 [그룹으로 묶기](Ctrl+G). 묶으면 새 컨테이너(그룹)가 생기고 실행 취소된다 (`groupNodes`).
- 그룹 안의 그룹은 [풀기](Ctrl+Shift+G)로 안의 요소를 그 자리에 꺼낸다 (`ungroupNode`).
- 컨테이너 "배치 방식": 줄 배치(flex, 세로/가로) 또는 격자(grid). 격자 칸은 `1fr 2fr`, `3`(같은 칸 3개), `200px 1fr` 처럼 적는다 (`display`, `gridColumns`).
- 격자는 페이지 영역이 640px 보다 좁으면 한 줄로 쌓인다 (`stackOnMobile`, 기본 켜짐, `src/index.css` 의 `.el-grid`).
- 2단계(자유 배치, 절대 위치)는 아직 하지 않았다. 그룹 자체를 끌어서 옮기는 것도 아직 없다 (위/아래 버튼 사용).

### 추가: 스타일 속성, 피그마 A단계 (2026-10-02)

공통 스타일은 `src/blocks/elements/elementStyle.ts` 가 CSS 로 바꾼다. 상자 스타일(채우기, 테두리, 효과, 안쪽 여백)은 요소 자체에, 크기 방식과 바깥 여백은 감싸개(Item)에 붙는다.
속성 이름 목록은 그 파일 맨 위 주석에 있다. 값이 없으면 예전 기본값을 쓰므로 기존 데이터 변환은 없다.
이미지의 `width`/`height`, 컨테이너의 `maxWidth`, 버튼의 `padding` 문자열은 예전 키를 그대로 쓴다 (크기 방식이나 4면 여백을 정하면 그것이 우선).
가로 배치가 좁은 화면에서 쌓일 때는 각 칸을 `flex: 0 0 auto` 로 바꿔 고정 너비가 높이로 바뀌지 않게 했다 (`src/index.css`).

## 4. 기존 프리셋 블록 호환

- 기존 블록 데이터는 변환 없이 그대로 렌더링된다. `children` 이 없는 블록은 예전과 완전히 같은 경로를 탄다.
- 최상위 `image` 는 기존 이미지 프리셋으로, section 안의 `image` 는 기본 이미지 요소로 구분된다 (테스트로 확인).
- 서버(Express, PHP)는 `blocks` 가 배열인지만 확인하므로 백엔드 변경 없이 저장된다.

## 5. 빈 섹션 추가 방법

편집 모드 → 도구 막대 [+ 섹션 추가] → "기본 요소" 그룹의 [빈 섹션].
선택한 섹션 바로 아래(없으면 하단 정보 위)에 들어간다.

## 6. 텍스트 / 이미지 / 버튼 추가 방법

- 방법 1: 컨테이너를 눌러 선택 → 위에 뜨는 막대의 [텍스트] [이미지] [버튼] [여백]
- 방법 2: [+ 섹션 추가] → "기본 요소"의 텍스트/이미지/버튼/여백. 섹션이나 컨테이너(또는 그 안의 요소)를 선택해 두면 그 컨테이너에, 아무것도 선택하지 않았으면 새 빈 섹션을 만들어 그 안에 넣는다.
- 텍스트는 더블클릭해서 바로 고치고, 이미지는 더블클릭하면 파일관리자가 열린다. 나머지 속성은 오른쪽 속성 패널에서 바꾼다.

## 7. 끌어 놓기 범위

- 같은 컨테이너 안에서 텍스트/이미지/버튼/여백 순서 변경: 지원
- 다른 컨테이너로 이동: 지원 (다른 요소 위에 놓으면 그 자리, 컨테이너 빈 곳에 놓으면 맨 뒤). 요소는 컨테이너 안에만 들어가게 막아 두었다
- 요소를 선택하면 나오는 막대의 손잡이(⋮⋮)를 잡고 끈다. 손잡이로만 끌리게 해서 클릭, 더블클릭 편집과 겹치지 않는다.
- 위/아래 버튼으로도 순서를 바꿀 수 있다.
- 컨테이너 자체의 끌어 놓기는 아직 없다 (위/아래 버튼으로 이동).

## 8. 실행 취소 / 다시 실행

추가, 삭제, 순서 변경, 다른 컨테이너 이동, 속성 변경 모두 기존 `pushUndo` 를 거쳐 실행 취소 대상이다.
테스트로 중첩 속성 변경, 이동, 섹션 삭제의 실행 취소를 확인했다.

## 9. 아직 구현하지 않은 것

- 반응형 화면 크기별 개별 스타일 (가로 배치는 공간이 모자라면 자동 줄바꿈만 한다)
- 컨테이너 끌어 놓기, 섹션 안 여러 컨테이너를 가로로 나란히 두는 다단 레이아웃
- AI 수정이 기본 요소 내부를 고치는 것 (AI는 지금 최상위 블록 단위로만 제안한다. 섹션 자체의 추가/삭제/이동은 가능)
- HTML 내보내기(`export-html.ts`, 배포 화면에서 사용)의 기본 요소 출력
- 요청 범위에서 빼기로 한 항목(Grid, absolute, 사용자 CSS, 애니메이션, 게시판, 폼 등)

## 10. 구조적 한계와 추후 리팩터링 후보

- `type: 'image'` 이름이 프리셋과 기본 요소에서 겹친다. 지금은 "최상위냐 children 안이냐"로 구분하지만, 장기적으로는 기본 요소에 `kind: 'element'` 표시를 두거나 `element-image` 처럼 이름을 나누는 것이 안전하다.
- 실행 취소가 매 변경마다 페이지 전체를 깊은 복사한다. 속성 입력 한 글자마다 기록되므로 큰 페이지에서는 기록이 빨리 쌓인다 (기존 프리셋도 같은 방식). 입력 묶음 처리나 패치 기반 기록이 필요하다.
- 선택 상태가 id 문자열 하나라 여러 개 선택은 아직 안 된다.
- `PropertiesPanel`(프리셋)과 `ElementPropertiesPanel`(기본 요소)이 따로 있다. 필드 정의 방식을 하나로 합치면 관리가 쉬워진다.
- 저장소의 `draft.blocks = page.blocks` 처럼 최상위 `blocks` 와 `pages[].blocks` 를 함께 맞추는 기존 방식이 남아 있다.
