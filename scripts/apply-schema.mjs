// Applies db/init.sql to DATABASE_URL via node-postgres (RDS/any TCP Postgres).
// Statements are ';'-separated; init.sql keeps semicolons out of comments and
// literals so this naive split stays correct (see CLAUDE.md gotcha #2).
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { SSL, resolveDatabaseUrl } from './db-url.mjs'

const client = new pg.Client({
  connectionString: resolveDatabaseUrl(),
  ssl: SSL,
})
await client.connect()

const statements = readFileSync('db/init.sql', 'utf8')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

for (const statement of statements) {
  await client.query(statement)
}
console.log(`Applied ${statements.length} statements`)
await client.end()
