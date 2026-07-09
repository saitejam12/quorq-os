import { describe, expect, it } from 'vitest'
import {
  PROFILE_FIELDS,
  diffChanges,
  pickAllowed,
  validateChanges,
} from './profile-fields'

describe('PROFILE_FIELDS', () => {
  it('never includes Aadhaar or PAN', () => {
    const keys = PROFILE_FIELDS.map((f) => f.key)
    expect(keys).not.toContain('aadhaarNumber')
    expect(keys).not.toContain('panNumber')
  })
})

describe('pickAllowed', () => {
  it('keeps allow-listed keys and drops Aadhaar/PAN/unknown', () => {
    expect(
      pickAllowed({
        phone: '  99  ',
        aadhaarNumber: '1234',
        panNumber: 'ABCDE1234F',
        nonsense: 'x',
      }),
    ).toEqual({ phone: '99' })
  })

  it('is safe for non-objects', () => {
    expect(pickAllowed(null)).toEqual({})
    expect(pickAllowed('nope')).toEqual({})
  })
})

describe('diffChanges', () => {
  it('returns only changed allow-listed keys', () => {
    const current = { phone: '111', location: 'Hyderabad' }
    const proposed = { phone: '222', location: 'Hyderabad' }
    expect(diffChanges(current, proposed)).toEqual({ phone: '222' })
  })

  it('treats a missing current value as empty', () => {
    expect(diffChanges({}, { phone: '222' })).toEqual({ phone: '222' })
  })
})

describe('validateChanges', () => {
  it('rejects emptied required fields', () => {
    expect(validateChanges({ name: '' })).toContain('Name is required')
    expect(validateChanges({ email: '' })).toContain('Email is required')
  })

  it('rejects over-long values', () => {
    expect(validateChanges({ bankIfsc: 'X'.repeat(21) })).toHaveLength(1)
  })

  it('accepts a valid change set', () => {
    expect(validateChanges({ phone: '+91 99999 99999', name: 'Asha' })).toEqual(
      [],
    )
  })
})
