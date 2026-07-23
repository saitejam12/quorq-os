import { createSqlClient as createPgClient } from './db-drivers/pg'
import { createSqlClient as createNeonClient } from './db-drivers/neon'

// The app ships two runtimes, chosen at deploy time by DEPLOY_TARGET:
//   • aws (default) — a Node server on ECS talking to RDS via node-postgres (pg)
//   • cloudflare    — a Worker talking to Neon over HTTP (@neondatabase/serverless)
// Both drivers expose the identical `sql` surface below, so nothing under
// src/server/** changes between them. The driver is selected in requireDb() from
// the runtime env, and vite.config.ts keeps `pg` out of the Worker bundle (it
// pulls in Node's net/tls, which workerd cannot load).
//
// Awaiting a query resolves to `Record<string, any>[]` — the shape both drivers
// return — so the pervasive `(await sql`…`)[0] as SomeType` narrowings and
// `.map((row) => …)` callbacks across src/server/** keep their types.
export type Row = Record<string, any>

// A pending query is a lazy thenable resolving to rows; individual drivers may
// attach extra fields (the pg driver carries text/values for transaction()).
export type PendingQuery = PromiseLike<Row[]>

export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): PendingQuery
  query: (text: string, params?: unknown[]) => Promise<Row[]>
  transaction: (queries: PendingQuery[]) => Promise<any[]>
}

let sql: SqlClient | undefined

// Cloudflare sets DEPLOY_TARGET=cloudflare (wrangler var / .dev.vars); the AWS
// Node runtime leaves it unset. Read at call time so tests and both runtimes
// resolve it dynamically.
function isCloudflare(): boolean {
  return process.env.DEPLOY_TARGET === 'cloudflare'
}

// Same contract on both runtimes: throw a descriptive, target-specific error if
// DATABASE_URL is unset, and memoize the client. Callers keep doing
// `const sql = requireDb()`.
export function requireDb(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      isCloudflare()
        ? 'DATABASE_URL is not configured in the worker environment. ' +
            'Local dev: add it to .dev.vars (copying .env is not enough). ' +
            'Production: `wrangler secret put DATABASE_URL`.'
        : 'DATABASE_URL is not configured in the server environment. ' +
            'Local dev: add it to .env (loaded by vite) or run `node --env-file=.env server.js`. ' +
            'Production (AWS): inject it from Secrets Manager into the ECS task.',
    )
  }
  if (!sql) sql = isCloudflare() ? createNeonClient() : createPgClient()
  return sql
}
