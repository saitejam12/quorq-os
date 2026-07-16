// Node entrypoint for AWS (ECS/EC2/App Runner). Serves the built client static
// assets (dist/client) and delegates everything else to the TanStack Start SSR
// fetch handler (dist/server/server.js). On Cloudflare the platform served the
// static assets for us; a bare Node server has to do it itself.
//
// Requires a prior `pnpm build`. Run with:  node server.js   (PORT env, default 3000)
import { serve } from '@hono/node-server'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
// Built SSR entry; its default export is `{ fetch(request): Response }`.
import handler from './dist/server/server.js'

const CLIENT_DIR = join(process.cwd(), 'dist', 'client')

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

async function tryServeStatic(pathname) {
  // Resolve under CLIENT_DIR and reject any path-traversal escape.
  const filePath = join(CLIENT_DIR, normalize(pathname))
  if (!filePath.startsWith(CLIENT_DIR)) return null
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null

  const body = await readFile(filePath)
  const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream'
  // Vite fingerprints everything under /assets, so it's safe to cache forever.
  const cacheControl = pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600'
  return new Response(body, {
    headers: { 'content-type': type, 'cache-control': cacheControl },
  })
}

const fetch = async (request) => {
  const method = request.method
  if (method === 'GET' || method === 'HEAD') {
    const asset = await tryServeStatic(new URL(request.url).pathname)
    if (asset) return asset
  }
  return handler.fetch(request)
}

const port = Number(process.env.PORT ?? 3000)
serve({ fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`QuorqOS listening on http://0.0.0.0:${info.port}`)
})
