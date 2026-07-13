import { describe, expect, it } from 'vitest'
import {
  parseCSV,
  toCSV,
  importEmployees,
  importAttendance,
} from './import-export'

describe('parseCSV', () => {
  it('splits rows and columns', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('handles quoted fields containing commas', () => {
    expect(parseCSV('name,note\n"Doe, John","hi, there"')).toEqual([
      ['name', 'note'],
      ['Doe, John', 'hi, there'],
    ])
  })
  it('skips blank lines', () => {
    expect(parseCSV('a\n\n1\n')).toEqual([['a'], ['1']])
  })
})

describe('toCSV', () => {
  it('emits a header row and quotes commas', () => {
    const csv = toCSV([{ name: 'Doe, J', dept: 'Eng' }])
    expect(csv).toBe('name,dept\n"Doe, J",Eng')
  })
  it('returns empty string for no rows', () => {
    expect(toCSV([])).toBe('')
  })
})

describe('importEmployees', () => {
  it('rejects a file missing required columns', () => {
    const r = importEmployees([
      ['name', 'email'],
      ['A', 'a@x.com'],
    ])
    expect(r.success).toBe(false)
    expect(r.errors[0].message).toContain('Missing required columns')
  })
  it('validates and collects good rows', () => {
    const r = importEmployees([
      ['name', 'email', 'department', 'designation', 'dateOfJoining'],
      ['Asha Rao', 'asha@quorq.ai', 'Engineering', 'SWE', '2024-01-10'],
    ])
    expect(r.success).toBe(true)
    expect(r.rowsProcessed).toBe(1)
    expect(r.data[0].email).toBe('asha@quorq.ai')
  })
  it('flags an invalid email as an error', () => {
    const r = importEmployees([
      ['name', 'email', 'department', 'designation', 'dateOfJoining'],
      ['Bad', 'not-an-email', 'Eng', 'SWE', '2024-01-10'],
    ])
    expect(r.success).toBe(false)
    expect(r.errors.length).toBe(1)
  })
  it('skips duplicate emails as warnings', () => {
    const r = importEmployees([
      ['name', 'email', 'department', 'designation', 'dateOfJoining'],
      ['A', 'dup@x.com', 'Eng', 'SWE', '2024-01-10'],
      ['B', 'dup@x.com', 'Eng', 'SWE', '2024-01-10'],
    ])
    expect(r.rowsProcessed).toBe(1)
    expect(r.rowsSkipped).toBe(1)
  })
})

describe('importAttendance', () => {
  it('coerces boolean flags from strings', () => {
    const r = importAttendance([
      ['employeeId', 'date', 'status', 'late'],
      ['5', '2026-07-04', 'present', 'true'],
      ['6', '2026-07-04', 'wfh', 'false'],
    ])
    expect(r.success).toBe(true)
    expect(r.data[0].late).toBe(true)
    expect(r.data[1].late).toBe(false)
  })
})
