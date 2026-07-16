import { Pool } from 'pg'
import type { PoolClient } from 'pg'

// node-postgres (pg) client wrapped in a thin adapter that reproduces the exact
// Neon `sql` surface the server code relies on, so nothing under src/server/**
// changes when we move from Neon's HTTP driver to a TCP Postgres (AWS RDS):
//   await sql`select … ${x}`   → tagged template, resolves to the rows array
//   await sql.query(text, ps)  → parameterized string query, resolves to rows
//   await sql.transaction([…]) → runs tagged-template queries atomically
//
// A "pending query" is a LAZY thenable: it carries its SQL text + params and does
// not touch the DB until awaited. That laziness is what lets transaction() collect
// text/values and run them on one connection without the standalone execution
// firing first (which would double-run every query in a transaction).
//
// Awaiting resolves to `Record<string, any>[]` — the exact shape Neon's default
// query function returned — so the pervasive `(await sql`…`)[0] as SomeType`
// narrowings and `.map((row) => …)` callbacks across src/server/** keep their
// types and this stays a true drop-in: no server file changes.
type Row = Record<string, any>

interface PendingQuery extends PromiseLike<Row[]> {
  text: string
  values: unknown[]
}

export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): PendingQuery
  query: (text: string, params?: unknown[]) => Promise<Row[]>
  transaction: (queries: PendingQuery[]) => Promise<any[]>
}

let pool: Pool | undefined
let sql: SqlClient | undefined

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // RDS terminates TLS with the Amazon RDS CA. `require` encrypts the link;
      // to also verify the server cert, ship the RDS CA bundle and set `ca`
      // (see docs/deploy-aws.md §A.6). rejectUnauthorized:false keeps first
      // setup simple — harden to full verification once it is running.
      ssl: { rejectUnauthorized: false },
      max: 10, // per container; keep (task count × max) under RDS max_connections
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return pool
}

// Build a `$1,$2,…` parameterized statement from a tagged template.
function build(strings: TemplateStringsArray, values: unknown[]): string {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return text
}

function makeClient(): SqlClient {
  const p = getPool()

  const tagged = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): PendingQuery => {
    const text = build(strings, values)
    let run: Promise<Row[]> | undefined
    // Nothing hits the DB until .then runs (i.e. the caller awaits).
    const exec = () =>
      (run ??= p.query(text, values).then((r) => r.rows as Row[]))
    return {
      text,
      values,
      then: (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected),
    }
  }

  const client = tagged as SqlClient

  client.query = async (text: string, params: unknown[] = []) =>
    (await p.query(text, params)).rows as Row[]

  // Delete/inserts/write-back etc. as one BEGIN/COMMIT on a single connection;
  // any failure rolls the whole batch back.
  client.transaction = async (queries: PendingQuery[]) => {
    const conn: PoolClient = await p.connect()
    try {
      await conn.query('BEGIN')
      const out: unknown[] = []
      for (const q of queries) {
        out.push((await conn.query(q.text, q.values)).rows)
      }
      await conn.query('COMMIT')
      return out
    } catch (err) {
      await conn.query('ROLLBACK')
      throw err
    } finally {
      conn.release()
    }
  }

  return client
}

// Same contract as before: throw a descriptive error if DATABASE_URL is unset,
// and memoize the client. Callers keep doing `const sql = requireDb()`.
export function requireDb(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured in the server environment. ' +
        'Local dev: add it to .env and run `node --env-file=.env server.js`. ' +
        'Production (AWS): inject it from Secrets Manager into the ECS task.',
    )
  }
  if (!sql) sql = makeClient()
  return sql
}
