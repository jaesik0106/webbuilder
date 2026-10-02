import { create } from 'zustand'
import { fetchPublicSiteSettings, type SiteSettings } from '@/lib/builderApi'

/** 방문자 화면에서 쓰는 사이트 설정 (제목, 로고, 파비콘, 추가 CSS, 스크립트). 한 번만 불러온다. */
interface SiteSettingsState {
  settings: SiteSettings | null
  load: () => Promise<void>
  /** 관리자가 설정을 저장한 뒤 바로 반영할 때 */
  set: (settings: SiteSettings) => void
}

let loading: Promise<void> | null = null

export const useSiteSettingsStore = create<SiteSettingsState>((set) => ({
  settings: null,
  load: () => {
    loading ??= fetchPublicSiteSettings()
      .then((data) => set({ settings: data.settings }))
      .catch(() => set({ settings: {} }))
    return loading
  },
  set: (settings) => set({ settings }),
}))
