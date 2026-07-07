import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'

let client: NeonQueryFunction<false, false> | undefined

// The Cloudflare worker runtime only sees variables provided as worker env
// bindings (.dev.vars locally, `wrangler secret put` in production) — values
// that live only in .env/.env.local never reach process.env inside workerd.
export function requireDb(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured in the worker environment. ' +
        'Local dev: add it to .dev.vars (copying .env.local is not enough). ' +
        'Production: `wrangler secret put DATABASE_URL`.',
    )
  }
  if (!client) {
    client = neon(process.env.DATABASE_URL)
  }
  return client
}
