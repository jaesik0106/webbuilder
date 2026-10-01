import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { useProjectsStore } from '@/store/projectsStore'
import { saveServerPage } from '@/lib/builderApi'

export function useAutoSaveToProject() {
  const config = useConfigStore((s) => s.config)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const updateProjectConfig = useProjectsStore((s) => s.updateProjectConfig)
  const loadedConfigRef = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Snapshot the config at load time so we can diff
  useEffect(() => {
    loadedConfigRef.current = JSON.stringify(config)
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProjectId) return
    const serialized = JSON.stringify(config)
    // Only save when config actually differs from what was loaded
    if (serialized === loadedConfigRef.current) return
    // 마지막으로 저장한 상태를 기준으로 삼아, 실행 취소로 처음 상태에 돌아와도 저장되게 한다.
    loadedConfigRef.current = serialized
    updateProjectConfig(activeProjectId, config)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveServerPage(activeProjectId, config.name || 'Untitled', config).catch(() => {
        toast.error('서버 저장에 실패했습니다.')
      })
    }, 700)
  }, [config, activeProjectId, updateProjectConfig])
}
