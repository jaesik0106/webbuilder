import { create } from 'zustand'
import { fetchMe, type AuthUser } from '@/lib/builderApi'

/** 로그인한 계정과 권한. 제작자(developer)만 계정 관리와 코드 편집을 볼 수 있다 (서버에서도 막는다). */
interface AuthState {
  user: AuthUser | null
  load: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  load: async () => {
    try {
      const data = await fetchMe()
      set({ user: data.user })
    } catch {
      set({ user: null })
    }
  },
}))

export const useIsDeveloper = () => useAuthStore((s) => s.user?.role === 'developer')

export const ROLE_LABELS = { developer: '제작자', admin: '관리자' } as const
