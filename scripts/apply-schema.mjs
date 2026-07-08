// Applies db/init.sql to the DATABASE_URL in .env.local.
// Statements are ';'-separated; init.sql keeps semicolons out of literals.
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const env = readFileSync('.env.local', 'utf8')
const match = env.match(/^DATABASE_URL=(.+)$/m)
if (!match) {
  console.error('DATABASE_URL not found in .env.local')
  process.exit(1)
}
const sql = neon(match[1].trim().replace(/^["']|["']$/g, ''))

const script = readFileSync('db/init.sql', 'utf8')
const statements = script
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

for (const statement of statements) {
  await sql.query(statement)
}
console.log(`Applied ${statements.length} statements`)
