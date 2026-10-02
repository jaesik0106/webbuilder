import { toast } from 'sonner'
import { uploadFile, type FileFolder, type UploadedFile } from '@/lib/builderApi'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
/** 파일관리자에서 올릴 수 있는 형식 (서버 규칙과 같다) */
export const FILE_ACCEPT = `${IMAGE_ACCEPT},image/x-icon,image/vnd.microsoft.icon,application/pdf,video/mp4,video/webm`

/** 여러 파일을 차례로 올리고, 올라간 파일 목록을 돌려준다. */
export async function uploadImages(files: FileList | File[], folder: FileFolder = 'main', accept = IMAGE_ACCEPT) {
  const uploaded: UploadedFile[] = []
  for (const file of Array.from(files)) {
    if (!accept.split(',').includes(file.type)) {
      toast.error(accept === IMAGE_ACCEPT ? `${file.name}: PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.` : `${file.name}: 올릴 수 없는 형식입니다.`)
      continue
    }
    try {
      uploaded.push(await uploadFile(file, folder))
    } catch (error) {
      toast.error(`${file.name}: ${error instanceof Error ? error.message : '올리지 못했습니다.'}`)
    }
  }
  return uploaded
}
