// Neon serverless (HTTP) driver — the Cloudflare Workers runtime. Workers cannot
// open raw TCP sockets, so the Node `pg` driver can't run there; Neon's driver
// speaks Postgres over fetch instead.
//
// Neon's `sql` already exposes the exact surface the server code relies on — the
// tagged template resolves to a rows array, plus `sql.query(text, params)` and
// `sql.transaction([...])` — which is precisely why our SqlClient contract was
// modelled on it. So the client is just `neon(url)` presented as a SqlClient; no
// adapter logic is needed.
import { neon } from '@neondatabase/serverless'
import type { SqlClient } from '../db'

export function createSqlClient(): SqlClient {
  // requireDb() has already asserted DATABASE_URL is present.
  return neon(process.env.DATABASE_URL as string) as unknown as SqlClient
}
