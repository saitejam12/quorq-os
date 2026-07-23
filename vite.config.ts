import { defineConfig, loadEnv } from 'vite'
import type { Plugin, PluginOption } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Two deploy targets share this config, chosen by DEPLOY_TARGET:
//   • aws (default) — Node server (server.js) + node-postgres against RDS
//   • cloudflare    — Workers build + Neon HTTP driver
// The scripts set it (`dev:cf` / `build:cf` / `deploy`); it also selects the DB
// driver at runtime in src/db.ts.

// Keep node-postgres (pg) out of bundles that can't run it. src/db.ts imports the
// pg driver, and several server modules also export plain helpers that TanStack
// Start's server-fn split can't strip, so `#/db` — and transitively pg — leaks
// into the client graph via the generated route tree. pg evaluates Node built-ins
// (Buffer, net) that throw at module load in the browser (and in workerd), which
// silently breaks hydration / the Worker. We resolve pg to an inert stub in the
// client always, and in the Worker (SSR) build too when targeting Cloudflare. On
// the AWS Node SSR build and `node server.js`, the real driver is used;
// requireDb() only ever runs inside server-fn handlers, so the stub is never hit.
function stubPg(inWorker: boolean): Plugin {
  const STUB_ID = '\0pg-client-stub'
  return {
    name: 'stub-pg',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      if (id === 'pg' && (!options.ssr || inWorker)) return STUB_ID
      return null
    },
    load(id) {
      if (id === STUB_ID) {
        return 'export class Pool { constructor() { throw new Error("pg is not used on this runtime") } }\nexport default { Pool }'
      }
      return null
    },
  }
}

const config = defineConfig(async ({ mode, command }) => {
  const target =
    process.env.DEPLOY_TARGET === 'cloudflare' ? 'cloudflare' : 'aws'
  const isCloudflare = target === 'cloudflare'

  const plugins: Array<PluginOption> = [stubPg(isCloudflare), devtools()]

  if (isCloudflare) {
    // Worker build (both serve + build) plus, in dev only, Neon branch seeding.
    // Imported lazily so the AWS target never loads the Cloudflare/Neon toolchain.
    const { cloudflare } = await import('@cloudflare/vite-plugin')
    plugins.push(cloudflare({ viteEnvironment: { name: 'ssr' } }))
    if (command === 'serve') {
      const neon = (await import('./neon-vite-plugin.ts')).default
      plugins.push(neon)
    }
  } else {
    // AWS/Node dev: Vite only exposes VITE_-prefixed vars to the client and never
    // populates process.env for server code. Our server functions read raw
    // process.env (AUTH_SECRET, DATABASE_URL), so load .env/.env.local ('' = no
    // prefix filter) and merge them in. Server-side only — not sent to the client.
    // In prod (`node server.js`) the env comes from ECS/--env-file, so this is a
    // no-op there. On Cloudflare the Worker env comes from .dev.vars / secrets.
    Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  }

  plugins.push(tailwindcss(), tanstackStart(), viteReact())

  return {
    resolve: { tsconfigPaths: true },
    plugins,
  }
})

export default config
