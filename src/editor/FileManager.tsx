import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Upload, Trash2, X, Check, ImageIcon, Folder } from 'lucide-react'
import { deleteFile, listFiles, type FileFolder, type UploadedFile } from '@/lib/builderApi'
import { IMAGE_ACCEPT as ACCEPT, uploadImages } from '@/lib/uploadImages'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * 파일관리자 본문. 이미지를 올리고(버튼 또는 끌어다 놓기), 보고, 지운다.
 * onPick 이 있으면 이미지를 골라 넣는 모드로 동작한다.
 */
const FOLDERS: { value: FileFolder; label: string }[] = [
  { value: 'main', label: '메인' },
  { value: 'sub', label: '서브' },
]

export function FileManagerPanel({
  onPick, initialFolder = 'main',
}: { onPick?: (url: string) => void; initialFolder?: FileFolder }) {
  const [folder, setFolder] = useState<FileFolder>(initialFolder)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    listFiles(folder)
      .then((data) => setFiles(data.files))
      .catch(() => toast.error('파일 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [folder])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setUploading(true)
    const uploaded = await uploadImages(list, folder)
    setUploading(false)
    if (uploaded.length > 0) {
      setFiles((prev) => [...uploaded, ...prev])
      toast.success(`${uploaded.length}개 이미지를 올렸습니다.`)
      // 고르는 모드에서 한 장만 올렸다면 바로 넣는다.
      if (onPick && uploaded.length === 1) onPick(uploaded[0].url)
    }
  }

  async function remove(name: string) {
    if (confirming !== name) {
      setConfirming(name)
      return
    }
    try {
      await deleteFile(folder, name)
      setFiles((prev) => prev.filter((file) => file.name !== name))
      toast('이미지를 삭제했습니다.')
    } catch {
      toast.error('이미지를 삭제하지 못했습니다.')
    } finally {
      setConfirming(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="폴더" className="flex items-center gap-1 border-b border-border-default">
        {FOLDERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={folder === item.value}
            onClick={() => setFolder(item.value)}
            className={`h-10 px-4 -mb-px flex items-center gap-1.5 text-[13.5px] border-b-2 ${
              folder === item.value ? 'border-green text-green font-semibold' : 'border-transparent text-text-2 hover:text-text-0'
            }`}
          >
            <Folder size={14} />
            {item.label}
          </button>
        ))}
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-colors ${
          dragging ? 'border-green bg-green-glow' : 'border-border-default hover:border-green'
        }`}
      >
        <Upload size={22} className="text-green" />
        <div className="text-text-0 text-[13.5px] font-medium">
          {uploading ? '올리는 중...' : `${folder === 'main' ? '메인' : '서브'} 폴더에 이미지를 끌어다 놓거나 눌러서 올리기`}
        </div>
        <div className="text-text-3 text-[12px]">PNG, JPG, GIF, WEBP · 10MB 이하 · 여러 장 가능</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {loading ? (
        <div className="text-text-3 text-[13px] py-6 text-center">불러오는 중...</div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-text-3 text-[13px] py-8">
          <ImageIcon size={24} />
          아직 올린 이미지가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((file) => (
            <div key={file.name} className="group rounded-lg border border-border-default bg-bg-1 overflow-hidden">
              <button
                type="button"
                onClick={() => onPick?.(file.url)}
                className={`block w-full aspect-[4/3] bg-bg-2 ${onPick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                aria-label={onPick ? `${file.name} 넣기` : file.name}
              >
                <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
              </button>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-text-1 text-[11.5px] truncate" title={file.name}>{file.name}</div>
                  <div className="text-text-3 text-[10.5px]">{formatSize(file.size)}</div>
                </div>
                {onPick && (
                  <button
                    type="button"
                    onClick={() => onPick(file.url)}
                    className="h-7 px-2 rounded-md bg-green text-black text-[11.5px] font-semibold inline-flex items-center gap-1"
                  >
                    <Check size={12} />
                    넣기
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(file.name)}
                  onMouseLeave={() => setConfirming((current) => (current === file.name ? null : current))}
                  aria-label="삭제"
                  title="삭제"
                  className={`h-7 rounded-md flex items-center justify-center text-[11px] ${
                    confirming === file.name ? 'px-2 bg-red-500 text-white' : 'w-7 text-text-3 hover:text-red-500 hover:bg-bg-2'
                  }`}
                >
                  {confirming === file.name ? '삭제' : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 페이지 수정 중 이미지를 바꿀 때 띄우는 파일관리자 창. */
export function FileManagerModal({
  onPick, onClose, initialFolder,
}: { onPick: (url: string) => void; onClose: () => void; initialFolder?: FileFolder }) {
  return (
    // 페이지 수정 화면의 클릭 처리와 사이트 색상 변수에 섞이지 않도록 body 에 바로 띄운다.
    createPortal(
    <div data-editor-ui className="admin-light fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="파일관리자"
        onClick={(event) => event.stopPropagation()}
        className="w-[min(880px,100%)] max-h-[85vh] overflow-y-auto rounded-xl bg-bg-1 border border-border-default shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-text-0 text-[16px] font-semibold">파일관리자</h2>
            <p className="text-text-2 text-[12.5px]">넣을 이미지를 고르거나 새로 올리세요.</p>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-text-2 hover:bg-bg-2">
            <X size={16} />
          </button>
        </div>
        <FileManagerPanel onPick={onPick} initialFolder={initialFolder} />
      </div>
    </div>,
    document.body,
    )
  )
}
