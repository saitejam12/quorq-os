import { describe, expect, it } from 'vitest'
import { buildOrg } from './org'
import type { OrgEmployee } from './org'

// head (no manager) -> two managers -> ICs, plus a lone IC directly under head.
const rows: Array<OrgEmployee> = [
  {
    id: 1,
    name: 'Head',
    designation: 'VP Eng',
    department: 'Engineering',
    managerId: null,
  },
  {
    id: 2,
    name: 'Mgr A',
    designation: 'EM',
    department: 'Engineering',
    managerId: 1,
  },
  {
    id: 3,
    name: 'Mgr B',
    designation: 'EM',
    department: 'Engineering',
    managerId: 1,
  },
  {
    id: 4,
    name: 'IC 1',
    designation: 'SWE',
    department: 'Engineering',
    managerId: 2,
  },
  {
    id: 5,
    name: 'IC 2',
    designation: 'SWE',
    department: 'Engineering',
    managerId: 2,
  },
  {
    id: 6,
    name: 'IC 3',
    designation: 'SWE',
    department: 'Engineering',
    managerId: 3,
  },
  {
    id: 7,
    name: 'IC 4',
    designation: 'SWE',
    department: 'Engineering',
    managerId: 1,
  },
]

describe('buildOrg', () => {
  it('treats null-manager rows as department heads', () => {
    const org = buildOrg(rows)
    expect(org.departments).toHaveLength(1)
    expect(org.departments[0].head.name).toBe('Head')
    expect(org.departments[0].total).toBe(7)
  })

  it('lists only directs who themselves have reports as managers', () => {
    const org = buildOrg(rows)
    const mgrs = org.departments[0].managers
    expect(mgrs.map((m) => m.name).sort()).toEqual(['Mgr A', 'Mgr B'])
    expect(mgrs.find((m) => m.name === 'Mgr A')?.reports).toBe(2)
    expect(mgrs.find((m) => m.name === 'Mgr B')?.reports).toBe(1)
    // IC 4 reports to the head directly, so is a direct report but not a manager.
    expect(org.departments[0].directReports).toBe(3)
  })

  it('computes span-of-control stats', () => {
    const org = buildOrg(rows)
    // managers with reports: head(1), Mgr A(2), Mgr B(3) => 3 managers.
    expect(org.stats.managers).toBe(3)
    // 6 employees have a manager; 6 / 3 = 2.0 average span.
    expect(org.stats.avgSpan).toBe(2)
    expect(org.stats.ics).toBe(4)
    expect(org.stats.departments).toBe(1)
  })

  it('sorts departments alphabetically and handles multiple', () => {
    const org = buildOrg([
      {
        id: 1,
        name: 'Z Head',
        designation: 'H',
        department: 'Sales',
        managerId: null,
      },
      {
        id: 2,
        name: 'A Head',
        designation: 'H',
        department: 'Finance',
        managerId: null,
      },
    ])
    expect(org.departments.map((d) => d.department)).toEqual([
      'Finance',
      'Sales',
    ])
    expect(org.stats.avgSpan).toBe(0)
  })

  it('returns empty structure for no employees', () => {
    const org = buildOrg([])
    expect(org.departments).toEqual([])
    expect(org.stats).toEqual({
      departments: 0,
      managers: 0,
      avgSpan: 0,
      ics: 0,
    })
  })
})
