import { describe, expect, it } from 'vitest'
import { mask } from './mask'

describe('mask', () => {
  it('masks all but the last 4 characters by default', () => {
    expect(mask('123456789012')).toBe('••••••••9012')
  })

  it('respects a custom visible window', () => {
    expect(mask('ABCDE1234F', 2)).toBe('••••••••4F')
  })

  it('returns short values unchanged', () => {
    expect(mask('1234')).toBe('1234')
    expect(mask('12')).toBe('12')
  })

  it('returns a placeholder for empty input', () => {
    expect(mask(null)).toBe('—')
    expect(mask(undefined)).toBe('—')
    expect(mask('')).toBe('—')
  })
})
