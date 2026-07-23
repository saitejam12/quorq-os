import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Keep node-postgres (pg) out of the CLIENT bundle. src/db.ts imports pg for the
// server runtime, but several server modules (session.ts, people.ts, …) also
// export plain helpers that TanStack Start's server-fn split can't strip, so
// `#/db` — and transitively pg — leaks into the client graph via the generated
// route tree. pg evaluates Node built-ins (Buffer, net) absent in the browser,
// which throws at module load and silently breaks hydration for the whole app
// (dead buttons, no auth). In client transforms (ssr === false) we resolve pg to
// an inert stub; SSR and `node server.js` still get the real driver. requireDb()
// is only ever called inside server-fn handlers, so the stub is never invoked.
function stubPgInClient(): Plugin {
  const STUB_ID = '\0pg-client-stub'
  return {
    name: 'stub-pg-in-client',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      if (id === 'pg' && !options.ssr) return STUB_ID
      return null
    },
    load(id) {
      if (id === STUB_ID) {
        return 'export class Pool { constructor() { throw new Error("pg is server-only and must not run in the browser") } }\nexport default { Pool }'
      }
      return null
    },
  }
}

// Builds a Node SSR server bundle (served by server.js). The Cloudflare Worker
// plugin and the Neon dev plugin were removed for the AWS/RDS deployment —
// see docs/deploy-aws.md.
const config = defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to the client and never populates
  // process.env for server code. Our server functions read raw process.env
  // (AUTH_SECRET, DATABASE_URL), so in dev we load .env/.env.local ('' = no
  // prefix filter) and merge them in. Server-side only — secrets are not sent
  // to the client. In prod (`node server.js`) the env comes from ECS/--env-file,
  // so this never runs.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      stubPgInClient(),
      devtools(),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
