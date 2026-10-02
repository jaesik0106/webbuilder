import { useState, useEffect, useRef } from 'react'
import {
  Settings2, Search as SearchIcon, Key, Check, Code2, Paintbrush,
} from 'lucide-react'
import { SiteSettingsPanel } from './SiteSettingsPanels'
import { toast } from 'sonner'
import { useProjectsStore, type ProjectSettings } from '@/store/projectsStore'
import { useEditorStore } from '@/store/editorStore'

type SettingsTab = 'basic' | 'search' | 'scripts' | 'css' | 'api'

const tabDefs: { value: SettingsTab; label: string; icon: typeof Settings2 }[] = [
  { value: 'basic', label: '기본 정보', icon: Settings2 },
  { value: 'search', label: '검색 설정', icon: SearchIcon },
  { value: 'scripts', label: '스크립트 추가', icon: Code2 },
  { value: 'css', label: '추가 CSS', icon: Paintbrush },
  { value: 'api', label: 'API 키', icon: Key },
]

function useSettingsState() {
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const projects = useProjectsStore((s) => s.projects)
  const updateProjectSettings = useProjectsStore((s) => s.updateProjectSettings)

  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null
  const projectSettings = activeProject?.settings || {}

  const [showSaved, setShowSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const data: Record<string, string> = Object.fromEntries(
    Object.entries(projectSettings).map(([k, v]) => [k, v || ''])
  )

  const update = (key: string, value: string) => {
    if (activeProjectId) {
      updateProjectSettings(activeProjectId, { [key]: value } as Partial<ProjectSettings>)
    }
    setShowSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setShowSaved(false), 2000)
  }

  useEffect(() => {
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current) }
  }, [])

  return { data, update, showSaved }
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-[13.5px] text-text-2 mb-1.5 font-medium">{label}</label>
      {children}
    </div>
  )
}

function ControlledInput({ settingsKey, placeholder, settings }: { settingsKey: string; placeholder?: string; settings: ReturnType<typeof useSettingsState> }) {
  return (
    <input
      type="text"
      value={settings.data[settingsKey] || ''}
      placeholder={placeholder}
      onChange={(e) => settings.update(settingsKey, e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[15px] outline-none focus:border-green placeholder:text-text-3 transition-colors"
    />
  )
}

function ApiPanel({ settings }: { settings: ReturnType<typeof useSettingsState> }) {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('openpage-gemini-key') || '')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  function handleKeyChange(value: string) {
    setGeminiKey(value)
    if (value) {
      localStorage.setItem('openpage-gemini-key', value)
    } else {
      localStorage.removeItem('openpage-gemini-key')
    }
  }

  async function handleTest() {
    if (!geminiKey) return
    setTesting(true)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
      )
      if (res.ok) {
        toast.success('API key is valid')
      } else {
        toast.error(`Invalid key: ${res.status}`)
      }
    } catch {
      toast.error('Connection failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">API Keys</h2>

      <FieldGroup label="Deploy Access Key">
        <ControlledInput
          settingsKey="deployAccessKey"
          placeholder="Must match OPENPAGE_DEPLOY_KEY on server"
          settings={settings}
        />
        <p className="text-[13px] text-text-3 mt-1.5">
          Required for one-click publishing. Stored in your project settings.
        </p>
      </FieldGroup>

      <FieldGroup label="Gemini API Key">
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={geminiKey}
            placeholder="AIza..."
            onChange={(e) => handleKeyChange(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-0 text-[15px] outline-none focus:border-green placeholder:text-text-3 transition-colors font-mono"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2 rounded-lg border border-border-default bg-bg-2 text-text-2 text-[14px] hover:text-text-0 hover:bg-bg-3 transition-colors shrink-0"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={handleTest}
            disabled={!geminiKey || testing}
            className="px-3 py-2 rounded-lg bg-green/10 text-green text-[14px] font-medium hover:bg-green/20 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
        </div>
        <p className="text-[13px] text-text-3 mt-1.5">
          Used for client-side AI generation. Get one at{' '}
          <span className="text-text-2">aistudio.google.com</span>
        </p>
      </FieldGroup>

    </div>
  )
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const settings = useSettingsState()

  const panels: Record<SettingsTab, React.ReactNode> = {
    // 서버에 저장하는 사이트 설정 (방문자 화면에 적용)
    basic: <SiteSettingsPanel panel="basic" />,
    search: <SiteSettingsPanel panel="search" />,
    scripts: <SiteSettingsPanel panel="scripts" />,
    css: <SiteSettingsPanel panel="css" />,
    api: <ApiPanel settings={settings} />,
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar */}
      <div className="md:w-52 bg-bg-1 border-b md:border-b-0 md:border-r border-border-default p-2 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
        {tabDefs.map(({ value, label, icon: Icon }, i) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            style={{ animationDelay: `${i * 40}ms` }}
            className={`shrink-0 md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[14.5px] transition-all text-left animate-fade-in-up ${
              activeTab === value
                ? 'bg-bg-3 text-text-0'
                : 'text-text-2 hover:text-text-0 hover:bg-bg-2'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-2xl relative">
        {settings.showSaved && (
          <div className="absolute top-3 right-6 flex items-center gap-1.5 text-green text-[13px] animate-fade-in">
            <Check size={12} />
            Saved
          </div>
        )}
        <div key={activeTab} className="animate-fade-in-up">
          {panels[activeTab]}
        </div>
      </div>
    </div>
  )
}
