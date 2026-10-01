import { toast } from 'sonner'
import { uploadFile, type FileFolder, type UploadedFile } from '@/lib/builderApi'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

/** 여러 파일을 차례로 올리고, 올라간 파일 목록을 돌려준다. */
export async function uploadImages(files: FileList | File[], folder: FileFolder = 'main') {
  const uploaded: UploadedFile[] = []
  for (const file of Array.from(files)) {
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      toast.error(`${file.name}: PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.`)
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
