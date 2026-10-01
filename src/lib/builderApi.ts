import type { SiteConfig } from '@/blocks/types'
import { useProjectsStore, type Project } from '@/store/projectsStore'

const API_BASE = 'http://localhost:3001'
const TOKEN_KEY = 'webbuilder-token'

export interface AuthUser {
  id: number
  email: string
}

export interface SavedPage {
  id: number
  name: string
  config: SiteConfig
  createdAt: string
  updatedAt: string
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    // 만료되거나 잘못된 토큰은 지워서 관리자 화면이 로그인으로 돌아가게 한다.
    if (response.status === 401 && token) clearToken()
    throw new Error(data.message || '요청에 실패했습니다.')
  }
  return data as T
}

export function loginAccount(email: string, password: string) {
  return request<{ success: boolean; token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function fetchMe() {
  return request<{ success: boolean; user: AuthUser }>('/api/auth/me')
}

export function fetchPublicHome() {
  return request<{ success: boolean; page: SavedPage | null }>('/api/public/home')
}

export function toProject(page: SavedPage): Project {
  const config = page.config
  const blockCount = config.pages
    ? config.pages.reduce((sum, item) => sum + item.blocks.length, 0)
    : config.blocks?.length ?? 0

  return {
    id: `server-${page.id}`,
    serverId: page.id,
    name: page.name,
    status: 'draft',
    updatedAt: page.updatedAt,
    blockCount,
    config,
  }
}

export function listSavedPages() {
  return request<{ success: boolean; pages: SavedPage[] }>('/api/pages')
}

export async function ensureServerPage(localId: string, name: string, config: SiteConfig) {
  const project = useProjectsStore.getState().projects.find((item) => item.id === localId)
  if (project?.serverId) return project.serverId

  const data = await request<{ page: SavedPage }>('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ name, config }),
  })
  useProjectsStore.getState().attachServerId(localId, data.page.id)
  return data.page.id
}

export async function saveServerPage(localId: string, name: string, config: SiteConfig) {
  const serverId = await ensureServerPage(localId, name, config)
  await request(`/api/pages/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, config }),
  })
}

export async function deleteServerPage(serverId: number) {
  await request(`/api/pages/${serverId}`, { method: 'DELETE' })
}

export interface AiUsageEntry {
  id: number
  pageId: number | null
  prompt: string
  provider: string
  status: string
  createdAt: string
}

export function fetchAiUsage() {
  return request<{ success: boolean; usage: AiUsageEntry[] }>('/api/ai/usage')
}

export interface EditProposal {
  success: boolean
  reply: string
  summary: string
  operations: unknown[]
}

export function proposeSiteEdits(
  pageId: number,
  body: { prompt: string; page: unknown; selectedBlockId: string | null; catalog: unknown },
  signal?: AbortSignal,
) {
  return request<EditProposal>('/api/ai/revise', {
    method: 'POST',
    body: JSON.stringify({ pageId, ...body }),
    signal,
  })
}

export async function renameServerPage(serverId: number, name: string) {
  await request(`/api/pages/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}
