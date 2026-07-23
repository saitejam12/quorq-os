import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Neon HTTP driver so driver selection can be tested without a network.
const neonFn = vi.fn((_url: string) => {
  // Neon returns a callable `sql` tagged template; a stub function is enough.
  const tag = () => Promise.resolve([])
  return tag
})
vi.mock('@neondatabase/serverless', () => ({
  neon: (url: string) => neonFn(url),
}))

// Import AFTER the mock is registered. requireDb() picks the driver at call time.
const { requireDb } = await import('../db')

const URL = 'postgres://u:p@ep-demo.neon.tech/quorq?sslmode=require'

beforeEach(() => {
  vi.stubEnv('DEPLOY_TARGET', 'cloudflare')
  vi.stubEnv('DATABASE_URL', URL)
  neonFn.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('driver selection', () => {
  it('uses the Neon HTTP driver when DEPLOY_TARGET=cloudflare', () => {
    const sql = requireDb()
    expect(typeof sql).toBe('function')
    expect(neonFn).toHaveBeenCalledWith(URL)
  })
})
