// 홈페이지 위에서 글자를 바로 고칠 때, 화면의 글자가 블록 props 의 어느 값인지 찾는다.
// 블록 컴포넌트는 그대로 두고, 화면 글자와 같은 문자열을 props 안에서 찾아 그 경로를 수정한다.

export type PropPath = (string | number)[]

export function findTextPath(value: unknown, text: string, path: PropPath = []): PropPath | null {
  if (typeof value === 'string') return value.trim() === text ? path : null
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findTextPath(value[i], text, [...path, i])
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const found = findTextPath(child, text, [...path, key])
      if (found) return found
    }
  }
  return null
}

function setAt(target: unknown, path: PropPath, next: string): unknown {
  if (path.length === 0) return next
  const [head, ...rest] = path
  if (Array.isArray(target) || (typeof head === 'number' && target == null)) {
    const copy = Array.isArray(target) ? [...target] : []
    copy[head as number] = setAt(copy[head as number], rest, next)
    return copy
  }
  const obj = (target ?? {}) as Record<string, unknown>
  return { ...obj, [head]: setAt(obj[head as string], rest, next) }
}

/** "images.0.src" 같은 문자열 경로를 PropPath 로 바꾼다. */
export function parsePropPath(value: string): PropPath {
  return value.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
}

/** 최상위 prop 하나만 바꾼 결과를 돌려준다 (updateBlockProps 에 그대로 넘길 수 있게). */
export function patchForPath(props: Record<string, unknown>, path: PropPath, next: string): Record<string, unknown> {
  const key = path[0] as string
  return { [key]: setAt(props[key], path.slice(1), next) }
}
