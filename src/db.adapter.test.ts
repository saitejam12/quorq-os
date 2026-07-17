import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node-postgres so the adapter can be exercised without a real database.
// Each pool.query / client.query call is recorded so we can assert on the exact
// SQL text + params the adapter generates.
const calls: Array<{ text: string; values: unknown[] }> = []
const clientCalls: string[] = []
const release = vi.fn()

const fakeClient = {
  query: vi.fn((text: string, values: unknown[] = []) => {
    clientCalls.push(text)
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return Promise.resolve({ rows: [] })
    }
    calls.push({ text, values })
    return Promise.resolve({ rows: [{ ok: text }] })
  }),
  release,
}

const poolQuery = vi.fn((text: string, values: unknown[] = []) => {
  calls.push({ text, values })
  return Promise.resolve({ rows: [{ ok: text }] })
})

vi.mock('pg', () => ({
  Pool: class {
    query = poolQuery
    connect = () => Promise.resolve(fakeClient)
  },
}))

// Import AFTER the mock is registered.
const { requireDb } = await import('./db')

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5432/db')
  calls.length = 0
  clientCalls.length = 0
  release.mockClear()
  poolQuery.mockClear()
  fakeClient.query.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('pg adapter', () => {
  it('substitutes tagged-template values as $1,$2 params in order', async () => {
    const sql = requireDb()
    const rows = await sql`select * from t where a=${42} and b=${'x'}`
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toBe('select * from t where a=$1 and b=$2')
    expect(calls[0].values).toEqual([42, 'x'])
    expect(rows).toEqual([{ ok: 'select * from t where a=$1 and b=$2' }])
  })

  it('is lazy — building a query does not touch the DB until awaited', () => {
    const sql = requireDb()
    // Not awaited:
    void sql`select 1 where x=${1}`
    expect(calls).toHaveLength(0)
  })

  it('passes sql.query(text, params) straight through', async () => {
    const sql = requireDb()
    await sql.query('select * from t where id=$1', [7])
    expect(calls).toEqual([
      { text: 'select * from t where id=$1', values: [7] },
    ])
  })

  it('runs transaction() as BEGIN → queries → COMMIT on one client, then releases', async () => {
    const sql = requireDb()
    await sql.transaction([
      sql`delete from t where id=${1}`,
      sql`insert into t (v) values (${'a'})`,
    ])
    expect(clientCalls).toEqual([
      'BEGIN',
      'delete from t where id=$1',
      'insert into t (v) values ($1)',
      'COMMIT',
    ])
    // The standalone tagged templates must NOT have executed on the pool.
    expect(poolQuery).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it('rolls back and rethrows if a statement in the transaction fails', async () => {
    const sql = requireDb()
    fakeClient.query.mockImplementationOnce(() => Promise.resolve({ rows: [] })) // BEGIN
    fakeClient.query.mockImplementationOnce(() =>
      Promise.reject(new Error('boom')),
    ) // first statement
    await expect(sql.transaction([sql`update t set v=${1}`])).rejects.toThrow(
      'boom',
    )
    expect(clientCalls).toContain('ROLLBACK')
    expect(release).toHaveBeenCalledOnce()
  })
})
