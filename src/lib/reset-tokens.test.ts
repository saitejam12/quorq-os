import { describe, expect, it } from 'vitest'
import { generateToken, hashToken, isExpired } from './reset-tokens'

describe('reset-tokens', () => {
  it('generateToken returns a URL-safe, high-entropy, unique string', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/) // base64url, no padding
    expect(a.length).toBeGreaterThanOrEqual(43) // 32 bytes -> 43 chars
    expect(a).not.toBe(b)
  })

  it('hashToken is a stable SHA-256 hex and hides the plaintext', async () => {
    const token = 'abc123'
    const h = await hashToken(token)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(token)
    expect(await hashToken(token)).toBe(h) // deterministic
    expect(await hashToken('abc124')).not.toBe(h) // sensitive to input
  })

  it('isExpired compares expiry against now', () => {
    const now = new Date('2026-07-17T12:00:00Z')
    expect(isExpired(new Date('2026-07-17T11:59:59Z'), now)).toBe(true)
    expect(isExpired(new Date('2026-07-17T12:30:00Z'), now)).toBe(false)
    expect(isExpired('2026-07-17T11:00:00Z', now)).toBe(true) // ISO string ok
  })
})
