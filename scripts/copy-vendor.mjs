// Copies browser-image-compression's standalone build into public/vendor so its
// Web Worker loads the library from our own site (see src/lib/images.ts), not a CDN.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('public/vendor', { recursive: true })
copyFileSync(
  'node_modules/browser-image-compression/dist/browser-image-compression.js',
  'public/vendor/browser-image-compression.js',
)
