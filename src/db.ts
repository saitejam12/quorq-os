import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'

let client: NeonQueryFunction<false, false> | undefined

export async function getClient() {
  if (!process.env.DATABASE_URL) {
    return undefined
  }
  if (!client) {
    client = neon(process.env.DATABASE_URL)
  }
  return client
}
