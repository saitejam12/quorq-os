import { describe, expect, it } from 'vitest'
import { createPaginatedResult, getOffset } from './pagination'

describe('getOffset', () => {
  it('is zero on the first page', () => {
    expect(getOffset(1, 25)).toBe(0)
  })
  it('advances by limit per page', () => {
    expect(getOffset(3, 25)).toBe(50)
  })
})

describe('createPaginatedResult', () => {
  it('computes totalPages and hasMore on a middle page', () => {
    const r = createPaginatedResult([], 1, 25, 60)
    expect(r.pagination.totalPages).toBe(3)
    expect(r.pagination.hasMore).toBe(true)
  })

  it('has no more on the last page', () => {
    const r = createPaginatedResult([], 3, 25, 60)
    expect(r.pagination.hasMore).toBe(false)
  })

  it('reports a single page for an exact fill', () => {
    const r = createPaginatedResult([], 1, 25, 25)
    expect(r.pagination.totalPages).toBe(1)
    expect(r.pagination.hasMore).toBe(false)
  })

  it('reports zero pages for an empty set', () => {
    const r = createPaginatedResult([], 1, 25, 0)
    expect(r.pagination.totalPages).toBe(0)
    expect(r.pagination.hasMore).toBe(false)
  })
})
