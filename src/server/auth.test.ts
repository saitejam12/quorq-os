import { describe, expect, it } from 'vitest'
import { isConfigError } from './auth'

describe('isConfigError', () => {
  it('matches the missing-secret / missing-DB errors', () => {
    expect(isConfigError(new Error('AUTH_SECRET is not configured'))).toBe(true)
    expect(
      isConfigError(
        new Error('DATABASE_URL is not configured in the worker environment.'),
      ),
    ).toBe(true)
  })

  it('does not match ordinary errors', () => {
    expect(isConfigError(new Error('Invalid email or password'))).toBe(false)
    expect(isConfigError(new Error('connection reset'))).toBe(false)
  })

  it('is safe for non-Error values', () => {
    expect(isConfigError('nope')).toBe(false)
    expect(isConfigError(null)).toBe(false)
    expect(isConfigError(undefined)).toBe(false)
  })
})
