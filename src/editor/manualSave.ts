import { toast } from 'sonner'
import type { SiteConfig } from '@/blocks/types'
import { saveServerPage } from '@/lib/builderApi'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'

/**
 * 수동 저장: 편집 내용은 화면(configStore)에만 쌓이고, [저장] 버튼을 눌러야 서버 페이지에 반영된다.
 * 마지막 저장 상태(savedSnapshot)와 지금 JSON 을 비교해 "저장 안 됨" 여부를 판단한다.
 */

export function snapshotOf(config: SiteConfig) {
  return JSON.stringify(config)
}

/** 페이지를 불러왔거나 저장한 직후, 지금 상태를 저장된 상태로 기록한다. */
export function markCurrentSaved() {
  useEditorStore.getState().markSaved(snapshotOf(useConfigStore.getState().config))
}

export function isDirty() {
  const saved = useEditorStore.getState().savedSnapshot
  return saved !== null && saved !== snapshotOf(useConfigStore.getState().config)
}

export function useIsDirty() {
  const config = useConfigStore((s) => s.config)
  const saved = useEditorStore((s) => s.savedSnapshot)
  return saved !== null && saved !== snapshotOf(config)
}

/** 저장 안 한 변경을 버리고 마지막 저장 상태로 되돌린다. */
export function discardChanges() {
  const saved = useEditorStore.getState().savedSnapshot
  if (saved) useConfigStore.getState().setConfig(JSON.parse(saved) as SiteConfig)
  markCurrentSaved()
}

export async function saveCurrentPage(): Promise<boolean> {
  const projectId = useEditorStore.getState().activeProjectId
  if (!projectId) return false
  const config = useConfigStore.getState().config
  try {
    await saveServerPage(projectId, config.name || 'Untitled', config)
    useProjectsStore.getState().updateProjectConfig(projectId, config)
    useEditorStore.getState().markSaved(snapshotOf(config))
    toast.success('저장했습니다.')
    return true
  } catch {
    toast.error('저장하지 못했습니다. 다시 시도해 주세요.')
    return false
  }
}
