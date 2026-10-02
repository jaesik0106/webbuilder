import { useState, useEffect } from 'react'
import { ChevronRight, MousePointer2 } from 'lucide-react'
import { useEditorStore } from '@/store/editorStore'
import { useConfigStore } from '@/store/configStore'
import { PropertiesPanel } from './PropertiesPanel'
import { DesignPanel } from './DesignPanel'
import { ElementPropertiesPanel } from './ElementPropertiesPanel'
import { findNode, isElementNode } from '@/lib/element-tree'

type Tab = 'properties' | 'design'

export function RightSidebar({ onCollapse }: { onCollapse?: () => void }) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId)
  const blocks = useConfigStore((s) => {
    const pages = s.config.pages
    if (!pages || pages.length === 0) return s.config.blocks
    const page = pages.find((p) => p.id === s.activePageId) ?? pages[0]
    return page.blocks
  })
  // section 안의 기본 요소도 선택될 수 있어서 트리 전체에서 찾는다.
  const selectedBlock = selectedBlockId ? findNode(blocks, selectedBlockId)?.node : undefined
  const isElement = !!selectedBlockId && isElementNode(blocks, selectedBlockId)
  const [tab, setTab] = useState<Tab>('properties')

  // Auto-switch to Properties when a block is selected
  useEffect(() => {
    if (selectedBlock) setTab('properties')
  }, [selectedBlock?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tab

  return (
    <div className="hidden md:flex w-[280px] bg-bg-1 flex-col shrink-0">
      <div className="flex border-b border-border-default shrink-0">
        <button
          onClick={() => setTab('properties')}
          className={`flex-1 py-2.5 text-[14.5px] font-semibold transition-colors ${
            activeTab === 'properties'
              ? 'text-green border-b-2 border-green'
              : 'text-text-3 border-b-2 border-transparent hover:text-text-1'
          }`}
        >
          속성
        </button>
        <button
          onClick={() => setTab('design')}
          className={`flex-1 py-2.5 text-[14.5px] font-semibold transition-colors ${
            activeTab === 'design'
              ? 'text-green border-b-2 border-green'
              : 'text-text-3 border-b-2 border-transparent hover:text-text-1'
          }`}
        >
          디자인
        </button>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="디자인 패널 접기"
            className="w-10 shrink-0 flex items-center justify-center text-text-2 hover:text-text-0 hover:bg-bg-2"
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'design' ? (
          <DesignPanel />
        ) : selectedBlock ? (
          <>
            {isElement ? <ElementPropertiesPanel node={selectedBlock} /> : <PropertiesPanel block={selectedBlock} />}
            {!isElement && (
              <div className="mt-auto px-3.5 py-2.5 font-mono text-[12.5px] text-text-3 break-all border-t border-border-subtle">
                config.blocks[{blocks.indexOf(selectedBlock)}]
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
            <div className="w-10 h-10 rounded-lg bg-bg-3 border border-border-default flex items-center justify-center">
              <MousePointer2 size={16} className="text-text-3" />
            </div>
            <div>
              <p className="text-text-1 text-[14px] font-medium">수정할 부분을 눌러 주세요</p>
              <p className="text-text-3 text-[13px] mt-1">섹션이나 요소를 누르면 여기에서 속성을 바꿀 수 있습니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
