import { ref } from 'vue'
import { compressPhoto } from '@/lib/images'
import { supabase } from '@/lib/supabase'
import { uploadWithProgress } from '@/lib/storageUpload'

export const PHOTO_BUCKET = 'item-images'
export const MAX_PHOTOS = 5

export type PhotoState = 'compressing' | 'ready' | 'uploading' | 'uploaded' | 'failed'

/**
 * A photo in the picker: either already in Storage (path set, uploaded) or
 * picked on this device (blob set) and waiting to be uploaded on save.
 * Entries are replaced, never mutated, via a patch(key, changes) callback.
 */
export interface PhotoEntry {
  key: string
  path: string | null
  blob: Blob | null
  extension: string
  /** Object URL for new photos; existing ones are shown from a signed URL. */
  previewUrl: string | null
  state: PhotoState
  progress: number
  error: string | null
}

export type PatchPhoto = (key: string, changes: Partial<PhotoEntry>) => void

let counter = 0
const nextKey = () => `photo-${Date.now()}-${counter++}`

export function existingPhoto(path: string): PhotoEntry {
  return {
    key: nextKey(),
    path,
    blob: null,
    extension: '',
    previewUrl: null,
    state: 'uploaded',
    progress: 1,
    error: null,
  }
}

/** A just-picked photo with an instant preview; call compressEntry next. */
export function newPhoto(file: File): PhotoEntry {
  return {
    key: nextKey(),
    path: null,
    blob: null,
    extension: '',
    previewUrl: URL.createObjectURL(file),
    state: 'compressing',
    progress: 0,
    error: null,
  }
}

export async function compressEntry(key: string, file: File, patch: PatchPhoto) {
  try {
    const { blob, extension } = await compressPhoto(file)
    patch(key, { blob, extension, state: 'ready' })
  } catch {
    patch(key, { state: 'failed', error: "Couldn't read this photo." })
  }
}

export function releasePhoto(entry: PhotoEntry) {
  if (entry.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.previewUrl)
}

/** Waits (up to ~20s) for photos still being compressed. */
export async function photosReady(getEntries: () => PhotoEntry[]): Promise<void> {
  for (let i = 0; i < 200 && getEntries().some((e) => e.state === 'compressing'); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
}

/**
 * Uploads every photo that isn't in Storage yet to {prefix}/{uuid}.{ext},
 * reporting state and progress through patch. Failures don't stop the others;
 * they're marked 'failed' so the form can offer Retry.
 */
export async function uploadPhotos(
  getEntries: () => PhotoEntry[],
  prefix: string,
  patch: PatchPhoto,
): Promise<void> {
  await photosReady(getEntries)
  const pending = getEntries().filter(
    (e) => (e.state === 'ready' || (e.state === 'failed' && e.blob)) && e.blob,
  )
  await Promise.all(
    pending.map(async (entry) => {
      const blob = entry.blob
      if (!blob) return
      const path = `${prefix}/${crypto.randomUUID()}.${entry.extension || 'webp'}`
      patch(entry.key, { state: 'uploading', progress: 0, error: null })
      try {
        await uploadWithProgress(PHOTO_BUCKET, path, blob, (p) => patch(entry.key, { progress: p }))
        patch(entry.key, { path, state: 'uploaded', progress: 1 })
      } catch (e) {
        patch(entry.key, {
          state: 'failed',
          error: e instanceof Error ? e.message : 'Upload failed.',
        })
      }
    }),
  )
}

/** Removes photos from Storage (best effort; a leftover file is harmless). */
export async function deleteStoredPhotos(paths: string[]) {
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths)
}

/**
 * The photo list a form owns. One place updates it synchronously, so rapid
 * changes (compression finishing, upload progress) never overwrite each other.
 */
export function usePhotoList() {
  const photos = ref<PhotoEntry[]>([])

  const patch: PatchPhoto = (key, changes) => {
    photos.value = photos.value.map((p) => (p.key === key ? { ...p, ...changes } : p))
  }

  /** Adds files up to the limit; returns how many were left out. */
  function add(files: File[]): number {
    const room = Math.max(0, MAX_PHOTOS - photos.value.length)
    const accepted = files.slice(0, room)
    const entries = accepted.map((file) => ({ entry: newPhoto(file), file }))
    photos.value = [...photos.value, ...entries.map((e) => e.entry)]
    entries.forEach(({ entry, file }) => void compressEntry(entry.key, file, patch))
    return files.length - accepted.length
  }

  function remove(key: string) {
    const entry = photos.value.find((p) => p.key === key)
    if (entry) releasePhoto(entry)
    photos.value = photos.value.filter((p) => p.key !== key)
  }

  function move(index: number, delta: number) {
    const next = [...photos.value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    if (moved) next.splice(target, 0, moved)
    photos.value = next
  }

  function reset(entries: PhotoEntry[] = []) {
    photos.value.forEach(releasePhoto)
    photos.value = entries
  }

  return { photos, patch, add, remove, move, reset, getEntries: () => photos.value }
}

export type PhotoList = ReturnType<typeof usePhotoList>
