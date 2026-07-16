// Resolves DATABASE_URL for the CLI scripts. Prefers the process environment
// (so AWS/RDS runs work: `DATABASE_URL=… node scripts/…`) and falls back to a
// `DATABASE_URL=` line in .env.local for the original local workflow.
import { readFileSync } from 'node:fs'

export function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim()
  try {
    const env = readFileSync('.env.local', 'utf8')
    const match = env.match(/^DATABASE_URL=(.+)$/m)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    // .env.local not present — fall through to the error below
  }
  console.error(
    'DATABASE_URL not set. Export it (DATABASE_URL=… node scripts/…) ' +
      'or add a DATABASE_URL= line to .env.local.',
  )
  process.exit(1)
}

// RDS requires TLS; rejectUnauthorized:false keeps setup simple (see
// docs/deploy-aws.md §A.6 to verify the server certificate instead).
export const SSL = { rejectUnauthorized: false }
