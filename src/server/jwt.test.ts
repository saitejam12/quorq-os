import { describe, expect, it } from 'vitest'
import { signToken, verifyToken } from './jwt'
import type { TokenPayload } from './jwt'

const SECRET = 'test-secret'

function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    sub: 42,
    email: 'user@example.com',
    name: 'Test User',
    tier: 'ops',
    exp: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  }
}

describe('jwt', () => {
  it('round-trips a valid token', async () => {
    const original = payload()
    const token = await signToken(original, SECRET)
    expect(await verifyToken(token, SECRET)).toEqual(original)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken(payload(), 'other-secret')
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signToken(
      payload({ exp: Math.floor(Date.now() / 1000) - 10 }),
      SECRET,
    )
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects a token whose payload was swapped (tier escalation)', async () => {
    const honest = await signToken(payload({ tier: 'basic' }), SECRET)
    const forgedBody = (
      await signToken(payload({ tier: 'master' }), SECRET)
    ).split('.')[1]
    const [header, , signature] = honest.split('.')
    const forged = `${header}.${forgedBody}.${signature}`
    expect(await verifyToken(forged, SECRET)).toBeNull()
  })

  it('rejects garbage input', async () => {
    expect(await verifyToken('not-a-token', SECRET)).toBeNull()
    expect(await verifyToken('a.b.c', SECRET)).toBeNull()
    expect(await verifyToken('', SECRET)).toBeNull()
  })
})
