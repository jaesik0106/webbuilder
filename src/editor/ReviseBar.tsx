import { useRef, useState } from 'react'
import { Square, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '@/store/configStore'
import { useEditorStore } from '@/store/editorStore'
import { ensureServerPage, proposeSiteEdits, saveAiRestorePoint } from '@/lib/builderApi'
import { blockMetadata } from '@/lib/block-metadata'
import { themePresets } from '@/lib/theme-presets'
import {
  applyOperations,
  describeOperation,
  validateOperations,
  type PageState,
  type SiteOperation,
} from '@/lib/site-ops'

const editCatalog = {
  blocks: blockMetadata.map(({ type, variants, description, defaultProps }) => ({ type, variants, description, defaultProps })),
  presets: themePresets.map(({ id, name }) => ({ id, name })),
}

interface Proposal {
  usageId?: number
  summary: string
  operations: SiteOperation[]
  descriptions: string[]
  skipped: number
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function currentPage(): PageState {
  const state = useConfigStore.getState()
  return { blocks: state.getActivePageBlocks(), theme: state.config.theme }
}

export function ReviseBar() {
  const config = useConfigStore((s) => s.config)
  const applyPageEdit = useConfigStore((s) => s.applyPageEdit)
  const activeProjectId = useEditorStore((s) => s.activeProjectId)
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function stop() {
    abortRef.current?.abort()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = prompt.trim()
    if (!text || !activeProjectId || pending) return

    const controller = new AbortController()
    abortRef.current = controller
    setPending(true)
    setProposal(null)
    try {
      const pageId = await ensureServerPage(activeProjectId, config.name || 'Untitled', config)
      if (controller.signal.aborted) {
        toast('AI 수정을 멈췄습니다.')
        return
      }
      const page = currentPage()
      const result = await proposeSiteEdits(
        pageId,
        { prompt: text, page, selectedBlockId, catalog: editCatalog },
        controller.signal,
      )
      if (controller.signal.aborted) return

      // AI가 제안한 수정 중 지금 페이지에 맞는 것만 남긴다.
      const { valid, rejected } = validateOperations(result.operations, page)
      if (valid.length === 0) {
        toast(result.reply || '바꿀 내용을 찾지 못했습니다. 조금 더 구체적으로 말씀해 주세요.')
        return
      }
      setProposal({
        usageId: result.usageId,
        summary: result.summary || result.reply,
        operations: valid,
        descriptions: valid.map((op) => describeOperation(op, page)),
        skipped: rejected.length,
      })
      setPrompt('')
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        toast('AI 수정을 멈췄습니다.')
        return
      }
      toast.error(error instanceof Error ? error.message : 'AI 수정에 실패했습니다.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPending(false)
    }
  }

  async function apply() {
    if (!proposal) return
    // 제안 이후 사용자가 페이지를 직접 고쳤다면, 지금 페이지 기준으로 다시 검증한다.
    const page = currentPage()
    const { valid } = validateOperations(proposal.operations, page)
    if (valid.length === 0) {
      toast.error('페이지가 바뀌어서 이 제안을 적용할 수 없습니다. 다시 요청해 주세요.')
      setProposal(null)
      return
    }
    const before = useConfigStore.getState().config
    if (proposal.usageId) {
      try {
        await saveAiRestorePoint(proposal.usageId, before)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '되돌리기 정보를 저장하지 못했습니다. 수정은 적용합니다.')
      }
    }
    const next = applyOperations(page, valid)
    applyPageEdit(next.blocks, next.theme, 'AI 수정')
    setProposal(null)
    toast.success('AI 수정을 적용했습니다. AI 수정 기록에서 이 수정 전으로 되돌릴 수 있습니다.')
  }

  return (
    <div className="flex flex-col-reverse bg-bg-1">
      <form onSubmit={submit} className="h-11 flex items-center gap-2 px-3">
        <input
          value={prompt}
          onChange={(event) => {
            if (!pending) setPrompt(event.target.value)
          }}
          disabled={pending}
          placeholder={
            pending
              ? 'AI가 수정 내용을 준비하는 중...'
              : selectedBlockId
                ? '선택한 섹션을 어떻게 수정할까요?'
                : '이 페이지를 어떻게 수정할까요?'
          }
          className="flex-1 h-8 px-3 rounded-lg bg-bg-2 border border-border-default text-[15px] text-text-0 placeholder:text-text-3 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {pending ? (
          <button
            type="button"
            onClick={stop}
            aria-label="AI 수정 멈추기"
            className="h-8 px-3 rounded-lg bg-bg-4 border border-border-default text-text-0 text-[14px] font-semibold flex items-center gap-1.5 hover:border-border-hover"
          >
            <Square size={10} fill="currentColor" />
            멈추기
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="h-8 px-3 rounded-lg bg-green text-black text-[14px] font-semibold disabled:opacity-40"
          >
            AI 수정
          </button>
        )}
      </form>

      {proposal && (
        <div className="px-3 pb-3" role="region" aria-label="AI 수정 미리보기">
          <div className="rounded-lg border border-green/30 bg-green-glow px-3 py-2.5">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {proposal.summary && <p className="text-[14.5px] text-text-0 mb-1">{proposal.summary}</p>}
                <ul className="text-[13.5px] text-text-2 space-y-0.5">
                  {proposal.descriptions.map((text, index) => (
                    <li key={index}>• {text}</li>
                  ))}
                </ul>
                {proposal.skipped > 0 && (
                  <p className="text-[13px] text-text-3 mt-1">적용할 수 없는 제안 {proposal.skipped}개는 뺐습니다.</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="h-7 px-2.5 rounded-md border border-border-default text-text-1 text-[14px] flex items-center gap-1 hover:border-border-hover hover:text-text-0"
                >
                  <X size={12} />
                  취소
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="h-7 px-2.5 rounded-md bg-green text-black text-[14px] font-semibold flex items-center gap-1"
                >
                  <Check size={12} />
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
