import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireDb } from './db'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('requireDb', () => {
  it('throws a descriptive error when DATABASE_URL is missing', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => requireDb()).toThrowError(/DATABASE_URL/)
    expect(() => requireDb()).toThrowError(/\.dev\.vars/)
  })

  it('returns a query client when DATABASE_URL is set', () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://user:pass@db.example.com/neondb?sslmode=require',
    )
    expect(typeof requireDb()).toBe('function')
  })
})
