import { useCallback, useEffect, useRef, useState } from 'react'

export interface Position {
  x: number
  y: number
}

function readSaved(key: string): Position | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Position
    return typeof parsed.x === 'number' && typeof parsed.y === 'number' ? parsed : null
  } catch {
    return null
  }
}

function clamp(pos: Position, el: HTMLElement | null): Position {
  const width = el?.offsetWidth ?? 0
  const height = el?.offsetHeight ?? 0
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - height - 8)),
  }
}

/**
 * 손잡이를 잡고 끌어서 옮기는 떠 있는 패널 위치. 위치는 이 브라우저에만 기억한다.
 * 아직 옮긴 적이 없으면 null 을 돌려주어 기본 CSS 위치를 쓰게 한다.
 */
export function useDraggablePosition(storageKey: string) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el
  }, [])
  const [position, setPosition] = useState<Position | null>(() => readSaved(storageKey))

  // 창 크기가 바뀌어도 화면 밖으로 나가지 않게 한다.
  useEffect(() => {
    function onResize() {
      setPosition((prev) => (prev ? clamp(prev, nodeRef.current) : prev))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onHandlePointerDown = useCallback((event: React.PointerEvent) => {
    const el = nodeRef.current
    if (!el || event.button !== 0) return
    event.preventDefault()
    const rect = el.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    let latest: Position = { x: rect.left, y: rect.top }

    function onMove(moveEvent: PointerEvent) {
      latest = clamp({ x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY }, el)
      setPosition(latest)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        localStorage.setItem(storageKey, JSON.stringify(latest))
      } catch {
        // 저장이 막힌 브라우저에서는 이번 방문 동안만 위치를 유지한다.
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [storageKey])

  return { ref, position, onHandlePointerDown }
}
