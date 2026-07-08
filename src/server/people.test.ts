import { describe, expect, it } from 'vitest'
import { reportingLineError } from './people'

describe('reportingLineError', () => {
  it('rejects an employee reporting to themselves', () => {
    expect(
      reportingLineError({
        employeeId: 5,
        managerId: 5,
        proposedManagerManagerId: null,
      }),
    ).toBe('An employee cannot report to themselves')
  })

  it('rejects a one-level reporting loop', () => {
    // Proposed manager (7) already reports to this employee (5).
    expect(
      reportingLineError({
        employeeId: 5,
        managerId: 7,
        proposedManagerManagerId: 5,
      }),
    ).toBe('That would create a reporting loop')
  })

  it('allows a valid manager assignment', () => {
    expect(
      reportingLineError({
        employeeId: 5,
        managerId: 7,
        proposedManagerManagerId: 2,
      }),
    ).toBeNull()
  })

  it('allows clearing the manager (null)', () => {
    expect(
      reportingLineError({
        employeeId: 5,
        managerId: null,
        proposedManagerManagerId: null,
      }),
    ).toBeNull()
  })
})
