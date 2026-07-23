// node-postgres (pg) driver — the AWS/RDS runtime (and any TCP Postgres, incl.
// Neon over TCP for the local CLI). A thin adapter reproduces the exact `sql`
// surface the server code relies on, so nothing under src/server/** cares which
// driver backs it:
//   await sql`select … ${x}`   → tagged template, resolves to the rows array
//   await sql.query(text, ps)  → parameterized string query, resolves to rows
//   await sql.transaction([…]) → runs tagged-template queries atomically
//
// A "pending query" is a LAZY thenable: it carries its SQL text + params and does
// not touch the DB until awaited. That laziness lets transaction() collect
// text/values and run them on one connection without the standalone execution
// firing first (which would double-run every query in a transaction).
import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import type { PendingQuery, Row, SqlClient } from '../db'

// pg pending queries carry their text + params so transaction() can replay them
// on a single pooled connection.
interface PgPendingQuery extends PendingQuery {
  text: string
  values: unknown[]
}

let pool: Pool | undefined

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

export function createSqlClient(): SqlClient {
  const p = getPool()

  const tagged = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): PgPendingQuery => {
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

  const client = tagged as unknown as SqlClient

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
        const pq = q as PgPendingQuery
        out.push((await conn.query(pq.text, pq.values)).rows)
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
