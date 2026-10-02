// Serves the production build (dist/) the way Netlify will: the SPA fallback plus
// the security headers from netlify.toml, so CSP problems show up before deploying.
// Usage: npm run build && node scripts/serve-dist.mjs   (http://localhost:4173)
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

const PORT = Number(process.env.PORT) || 4173
const root = 'dist'
const toml = readFileSync('netlify.toml', 'utf8')

// Every `Name = "value"` inside the [[headers]] for = "/*" block.
const block = toml.split('[[headers]]').find((b) => /for = "\/\*"/.test(b)) ?? ''
const headers = Object.fromEntries(
  [...block.matchAll(/^\s*([A-Za-z-]+) = "(.*)"\s*$/gm)]
    .filter(([, k]) => k !== 'for')
    .map(([, k, v]) => [k, v]),
)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(
    /^([\\/])+/,
    '',
  )
  let file = join(root, path)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  // Like Netlify: compress text and let hashed assets be cached for a year.
  const body = readFileSync(file)
  const type = types[extname(file)] ?? 'application/octet-stream'
  const gzip =
    /text|javascript|json|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')
  res.writeHead(200, {
    ...headers,
    'Content-Type': type,
    'Cache-Control': file.includes(join(root, 'assets'))
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  })
  res.end(gzip ? gzipSync(body) : body)
}).listen(PORT, () => console.log(`Serving dist/ with Netlify headers on http://localhost:${PORT}`))
