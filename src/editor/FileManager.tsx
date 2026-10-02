import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Upload, Trash2, X, Check, ImageIcon, Folder, FolderLock, FolderPlus, Search, Pencil, Link2, RotateCcw, FileText, Film, ArrowRightLeft,
} from 'lucide-react'
import {
  createFolder, deleteFile, deleteFolder, listFiles, listFolders, listTrash, purgeTrash, restoreTrash, updateFile,
  type FileFolder, type FileFolderInfo, type TrashFile, type UploadedFile,
} from '@/lib/builderApi'
import { FILE_ACCEPT, IMAGE_ACCEPT, uploadImages } from '@/lib/uploadImages'

/**
 * 파일관리자 (10PAGE 파일 관리자 참고).
 * - 왼쪽: 폴더 목록(시스템 폴더 main, sub, logo, slide + 직접 만든 폴더), 휴지통, 사용 용량
 * - 오른쪽: 올리기(버튼, 끌어다 놓기), 검색, 정렬, 여러 개 골라 옮기기/지우기, 이름 바꾸기, 주소 복사
 * - 지우면 휴지통으로 가고 30일 안에 되살릴 수 있다.
 * onPick 이 있으면 이미지를 골라 넣는 모드로 동작한다.
 */

const FOLDER_LABELS: Record<string, string> = { main: '메인', sub: '서브', logo: '로고', slide: '슬라이드' }
const TRASH = '__trash__'

type SortKey = 'new' | 'old' | 'name' | 'size'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
}

const folderLabel = (name: string) => FOLDER_LABELS[name] ?? name
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const isImage = (name: string) => ['png', 'jpg', 'gif', 'webp', 'ico'].includes(extOf(name))

function FilePreview({ file }: { file: { name: string; url?: string } }) {
  if (file.url && isImage(file.name)) return <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
  const Icon = ['mp4', 'webm'].includes(extOf(file.name)) ? Film : isImage(file.name) ? ImageIcon : FileText
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-text-3">
      <Icon size={26} />
      <span className="text-[11px] uppercase">{extOf(file.name)}</span>
    </div>
  )
}

function UsageBar({ used, quota }: { used: number; quota: number }) {
  const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
  return (
    <div className="px-1 pt-3 mt-2 border-t border-border-subtle">
      <div className="text-[12.5px] text-text-2 mb-1">사용 용량</div>
      {quota > 0 && (
        <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden mb-1">
          <div className={`h-full ${percent > 90 ? 'bg-red-500' : 'bg-green'}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="text-[12.5px] text-text-1 font-medium">
        {formatSize(used)}{quota > 0 && <span className="text-text-3 font-normal"> / {formatSize(quota)}</span>}
      </div>
    </div>
  )
}

function TrashView({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<TrashFile[] | null>(null)
  const load = useCallback(() => listTrash().then((data) => setItems(data.files)).catch((error) => toast.error(error.message)), [])
  useEffect(() => {
    load()
  }, [load])

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action()
      toast(message)
      load()
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (!items) return <div className="text-text-3 text-[15px] py-6 text-center">불러오는 중...</div>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-2">지운 파일은 30일 동안 보관하고, 지나면 자동으로 영구 삭제합니다. 영구 삭제한 파일은 되살릴 수 없습니다.</p>
      {items.length === 0 ? (
        <div className="text-text-3 text-[15px] py-8 text-center">휴지통이 비어 있습니다.</div>
      ) : (
        <div className="rounded-lg border border-border-default overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 border-border-subtle text-[13.5px]">
              <div className="flex-1 min-w-0">
                <div className="truncate text-text-0" title={item.name}>{item.name}</div>
                <div className="text-text-3 text-[12px]">
                  {folderLabel(item.folder)} · {formatSize(item.size)} · {new Date(item.deletedAt).toLocaleString('ko-KR')} 삭제
                </div>
              </div>
              <button type="button" onClick={() => run(() => restoreTrash(item.id), '되살렸습니다.')} className="h-8 px-2.5 rounded-md text-[13px] text-green hover:bg-green-glow inline-flex items-center gap-1">
                <RotateCcw size={13} />
                되살리기
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`${item.name} 을(를) 영구 삭제할까요? 되살릴 수 없습니다.`)) run(() => purgeTrash(item.id), '영구 삭제했습니다.')
                }}
                className="h-8 px-2.5 rounded-md text-[13px] text-text-2 hover:text-red-500 hover:bg-red-50 inline-flex items-center gap-1"
              >
                <Trash2 size={13} />
                영구 삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileManagerPanel({
  onPick, initialFolder = 'main',
}: { onPick?: (url: string) => void; initialFolder?: FileFolder }) {
  const [folder, setFolder] = useState<string>(initialFolder)
  const [folders, setFolders] = useState<FileFolderInfo[]>([])
  const [usage, setUsage] = useState({ used: 0, quota: 0 })
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('new')
  const [selected, setSelected] = useState<string[]>([])
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const accept = onPick ? IMAGE_ACCEPT : FILE_ACCEPT
  const inTrash = folder === TRASH

  const refreshFolders = useCallback(() => {
    listFolders()
      .then((data) => {
        setFolders(data.folders)
        setUsage(data.usage)
      })
      .catch(() => {})
  }, [])

  const refresh = useCallback(() => {
    setSelected([])
    if (folder === TRASH) return
    setLoading(true)
    listFiles(folder)
      .then((data) => setFiles(data.files))
      .catch(() => toast.error('파일 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [folder])

  useEffect(() => {
    refresh()
  }, [refresh])
  useEffect(() => {
    refreshFolders()
  }, [refreshFolders])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = files.filter((file) => !q || file.name.toLowerCase().includes(q))
    const by: Record<SortKey, (a: UploadedFile, b: UploadedFile) => number> = {
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      old: (a, b) => a.createdAt.localeCompare(b.createdAt),
      name: (a, b) => a.name.localeCompare(b.name),
      size: (a, b) => b.size - a.size,
    }
    return [...list].sort(by[sort])
  }, [files, query, sort])

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || inTrash) return
    setUploading(true)
    const uploaded = await uploadImages(list, folder, accept)
    setUploading(false)
    if (uploaded.length > 0) {
      setFiles((prev) => [...uploaded, ...prev])
      refreshFolders()
      toast.success(`${uploaded.length}개 파일을 올렸습니다.`)
      // 고르는 모드에서 한 장만 올렸다면 바로 넣는다.
      if (onPick && uploaded.length === 1) onPick(uploaded[0].url)
    }
  }

  async function removeMany(names: string[]) {
    if (names.length === 0) return
    if (!window.confirm(`${names.length}개 파일을 휴지통으로 옮길까요? 30일 안에 되살릴 수 있습니다.`)) return
    let done = 0
    for (const name of names) {
      try {
        await deleteFile(folder, name)
        done += 1
      } catch (error) {
        toast.error(`${name}: ${(error as Error).message}`)
      }
    }
    if (done) toast(`${done}개 파일을 휴지통으로 옮겼습니다.`)
    refresh()
    refreshFolders()
  }

  async function moveMany(names: string[], target: string) {
    let done = 0
    for (const name of names) {
      try {
        await updateFile(folder, name, { folder: target })
        done += 1
      } catch (error) {
        toast.error(`${name}: ${(error as Error).message}`)
      }
    }
    if (done) toast(`${done}개 파일을 ${folderLabel(target)} 폴더로 옮겼습니다. 페이지에 넣어 둔 파일이면 주소가 바뀌니 다시 넣어 주세요.`)
    refresh()
    refreshFolders()
  }

  async function rename(file: UploadedFile) {
    const base = file.name.replace(/\.[^.]+$/, '')
    const next = window.prompt('새 이름 (영문, 숫자, -, _). 확장자는 그대로 둡니다.', base)
    if (!next || next === base) return
    try {
      await updateFile(folder, file.name, { name: next })
      toast('이름을 바꿨습니다. 페이지에 넣어 둔 파일이면 다시 넣어 주세요.')
      refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function addFolder() {
    const name = (newFolder ?? '').trim().toLowerCase()
    if (!name) return setNewFolder(null)
    try {
      await createFolder(name)
      setNewFolder(null)
      refreshFolders()
      setFolder(name)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function removeFolder(name: string) {
    if (!window.confirm(`${name} 폴더를 지울까요? 빈 폴더만 지울 수 있습니다.`)) return
    try {
      await deleteFolder(name)
      setFolder('main')
      refreshFolders()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const current = folders.find((item) => item.name === folder)
  const allSelected = shown.length > 0 && shown.every((file) => selected.includes(file.name))

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* 폴더 */}
      <aside className="md:w-48 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {folders.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setFolder(item.name)}
            className={`shrink-0 h-9 px-2.5 rounded-md flex items-center gap-2 text-[14px] text-left ${
              folder === item.name ? 'bg-green-glow2 text-green font-semibold' : 'text-text-1 hover:bg-bg-2'
            }`}
            title={item.system ? '시스템 폴더 (지우거나 이름을 바꿀 수 없음)' : undefined}
          >
            {item.system ? <FolderLock size={14} /> : <Folder size={14} />}
            <span className="flex-1 truncate">{folderLabel(item.name)}</span>
            <span className="text-[11.5px] text-text-3 font-normal">{item.count}</span>
          </button>
        ))}
        {newFolder === null ? (
          <button type="button" onClick={() => setNewFolder('')} className="shrink-0 h-9 px-2.5 rounded-md flex items-center gap-2 text-[13.5px] text-text-2 hover:bg-bg-2">
            <FolderPlus size={14} />
            새 폴더
          </button>
        ) : (
          <input
            autoFocus
            value={newFolder}
            placeholder="영문 폴더 이름"
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addFolder()
              if (e.key === 'Escape') setNewFolder(null)
            }}
            onBlur={addFolder}
            className="shrink-0 h-9 px-2.5 rounded-md border border-green bg-bg-1 text-[13.5px] outline-none"
          />
        )}
        <button
          type="button"
          onClick={() => setFolder(TRASH)}
          className={`shrink-0 h-9 px-2.5 rounded-md flex items-center gap-2 text-[14px] md:mt-2 ${
            inTrash ? 'bg-green-glow2 text-green font-semibold' : 'text-text-1 hover:bg-bg-2'
          }`}
        >
          <Trash2 size={14} />
          휴지통
        </button>
        <div className="hidden md:block">
          <UsageBar used={usage.used} quota={usage.quota} />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {inTrash ? (
          <TrashView onChanged={refreshFolders} />
        ) : (
          <>
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
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors ${
                dragging ? 'border-green bg-green-glow' : 'border-border-default hover:border-green'
              }`}
            >
              <Upload size={20} className="text-green" />
              <div className="text-text-0 text-[15px] font-medium">
                {uploading ? '올리는 중...' : `${folderLabel(folder)} 폴더에 끌어다 놓거나 눌러서 올리기`}
              </div>
              <div className="text-text-3 text-[13px]">
                {onPick ? 'PNG, JPG, GIF, WEBP · 10MB 이하' : '이미지 10MB, PDF 30MB, 동영상(MP4, WEBM) 100MB 이하'} · 여러 개 가능
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>

            {/* 검색, 정렬, 고른 파일 작업 */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border-default bg-bg-1 flex-1 min-w-[160px]">
                <Search size={14} className="text-text-3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="파일 이름 검색" className="flex-1 min-w-0 bg-transparent outline-none text-[14px]" />
              </label>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 px-2 rounded-md border border-border-default bg-bg-1 text-[13.5px] cursor-pointer">
                <option value="new">최근 올린 순</option>
                <option value="old">오래된 순</option>
                <option value="name">이름 순</option>
                <option value="size">큰 파일 순</option>
              </select>
              {!onPick && shown.length > 0 && (
                <label className="h-9 px-2 flex items-center gap-1.5 text-[13.5px] text-text-1 cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : shown.map((file) => file.name))} />
                  전체 선택
                </label>
              )}
              {current && !current.system && files.length === 0 && (
                <button type="button" onClick={() => removeFolder(folder)} className="h-9 px-2.5 rounded-md text-[13px] text-text-2 hover:text-red-500 hover:bg-red-50">
                  폴더 지우기
                </button>
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-green-glow2 text-[13.5px]">
                <span className="font-semibold text-green">{selected.length}개 선택</span>
                <label className="flex items-center gap-1 text-text-1">
                  <ArrowRightLeft size={13} />
                  <select
                    value=""
                    onChange={(e) => e.target.value && moveMany(selected, e.target.value)}
                    className="h-8 px-1.5 rounded border border-border-default bg-bg-1 text-[13px] cursor-pointer"
                  >
                    <option value="">다른 폴더로 옮기기</option>
                    {folders.filter((item) => item.name !== folder).map((item) => (
                      <option key={item.name} value={item.name}>{folderLabel(item.name)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => removeMany(selected)} className="h-8 px-2.5 rounded-md text-[13px] text-red-500 hover:bg-red-50 inline-flex items-center gap-1">
                  <Trash2 size={13} />
                  선택 삭제
                </button>
                <button type="button" onClick={() => setSelected([])} className="ml-auto h-8 px-2 rounded-md text-[13px] text-text-2 hover:bg-bg-2">선택 해제</button>
              </div>
            )}

            {loading ? (
              <div className="text-text-3 text-[15px] py-6 text-center">불러오는 중...</div>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-text-3 text-[15px] py-8">
                <ImageIcon size={24} />
                {query ? '찾는 파일이 없습니다.' : '아직 올린 파일이 없습니다.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {shown.map((file) => {
                  const checked = selected.includes(file.name)
                  return (
                    <div key={file.name} className={`group relative rounded-lg border bg-bg-1 overflow-hidden ${checked ? 'border-green ring-1 ring-green' : 'border-border-default'}`}>
                      {!onPick && (
                        <input
                          type="checkbox"
                          aria-label={`${file.name} 고르기`}
                          checked={checked}
                          onChange={() => setSelected((prev) => (checked ? prev.filter((name) => name !== file.name) : [...prev, file.name]))}
                          className={`absolute top-2 left-2 z-10 w-4 h-4 ${checked ? '' : 'opacity-0 group-hover:opacity-100'}`}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onPick?.(file.url)}
                        className={`block w-full aspect-[4/3] bg-bg-2 ${onPick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                        aria-label={onPick ? `${file.name} 넣기` : file.name}
                      >
                        <FilePreview file={file} />
                      </button>
                      <div className="flex items-center gap-0.5 px-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-text-1 text-[13px] truncate" title={file.name}>{file.name}</div>
                          <div className="text-text-3 text-[12px]">{formatSize(file.size)}</div>
                        </div>
                        {onPick ? (
                          <button type="button" onClick={() => onPick(file.url)} className="h-7 px-2 rounded-md bg-green text-white text-[13px] font-semibold inline-flex items-center gap-1">
                            <Check size={12} />
                            넣기
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              title="주소 복사"
                              aria-label="주소 복사"
                              onClick={() => navigator.clipboard.writeText(new URL(file.url, window.location.origin).href).then(() => toast('주소를 복사했습니다.'))}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-text-3 hover:text-green hover:bg-bg-2"
                            >
                              <Link2 size={13} />
                            </button>
                            <button type="button" title="이름 바꾸기" aria-label="이름 바꾸기" onClick={() => rename(file)} className="w-7 h-7 rounded-md flex items-center justify-center text-text-3 hover:text-green hover:bg-bg-2">
                              <Pencil size={13} />
                            </button>
                          </>
                        )}
                        <button type="button" title="삭제 (휴지통)" aria-label="삭제" onClick={() => removeMany([file.name])} className="w-7 h-7 rounded-md flex items-center justify-center text-text-3 hover:text-red-500 hover:bg-bg-2">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="md:hidden">
              <UsageBar used={usage.used} quota={usage.quota} />
            </div>
          </>
        )}
      </div>
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
        className="w-[min(980px,100%)] max-h-[85vh] overflow-y-auto rounded-xl bg-bg-1 border border-border-default shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-text-0 text-[18px] font-semibold">파일관리자</h2>
            <p className="text-text-2 text-[14.5px]">넣을 이미지를 고르거나 새로 올리세요.</p>
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
