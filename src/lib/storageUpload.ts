import { supabase } from './supabase'

/**
 * Uploads a file to a Storage bucket with progress events. supabase-js's own
 * upload uses fetch, which can't report progress, so this talks to the same
 * Storage endpoint with XMLHttpRequest as the signed-in user (RLS applies).
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  blob: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You need to be signed in to upload photos.')

  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
  const url = `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
      } else {
        let message = `Upload failed (${xhr.status}).`
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string }
          if (body.message) message = body.message
        } catch {
          // keep the generic message
        }
        reject(new Error(message))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'))
    xhr.send(blob)
  })
}
