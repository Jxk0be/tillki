import imageCompression from 'browser-image-compression'

export interface CompressedPhoto {
  blob: Blob
  type: string
  extension: string
}

/**
 * Shrinks a camera photo before upload: max 1600px on the long edge, about
 * 300KB, as WebP. Browsers that can't encode WebP (older iPhone Safari) give
 * back something else, so we fall back to JPEG in that case.
 */
export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const options = {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    // Served from our own site (copied by scripts/copy-vendor.mjs) instead of the
    // library's default CDN, so the Content Security Policy only trusts us.
    libURL: new URL('/vendor/browser-image-compression.js', window.location.origin).href,
    initialQuality: 0.82,
  }
  let blob: Blob = await imageCompression(file, { ...options, fileType: 'image/webp' })
  if (blob.type !== 'image/webp') {
    blob = await imageCompression(file, { ...options, fileType: 'image/jpeg' })
  }
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  return { blob, type, extension: type === 'image/webp' ? 'webp' : 'jpg' }
}
