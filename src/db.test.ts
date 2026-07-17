import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireDb } from './db'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requireDb', () => {
  it('throws a descriptive error when DATABASE_URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => requireDb()).toThrowError(/DATABASE_URL/)
    expect(() => requireDb()).toThrowError(/Secrets Manager/)
  })

  it('returns a query client when DATABASE_URL is set', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://user:pass@db.example.com:5432/quorq?sslmode=require',
    )
    expect(typeof requireDb()).toBe('function')
  })
})
