import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword('wrong password', stored)).toBe(false)
  })

  it('produces a distinct salt (and hash) each call', async () => {
    const a = await hashPassword('same input')
    const b = await hashPassword('same input')
    expect(a).not.toBe(b)
  })

  it('stores salt:iterations:hash with 100000 iterations', async () => {
    const stored = await hashPassword('anything at all')
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[1]).toBe('100000')
  })

  it('rejects malformed stored values instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-valid-format')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })
})
