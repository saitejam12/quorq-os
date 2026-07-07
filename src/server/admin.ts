import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getClient } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import { TIERS, canSetTier, hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { Result } from '#/server/auth'

export interface AdminUser {
  id: number
  email: string
  name: string
  tier: Tier
  status: 'pending' | 'active' | 'rejected'
  createdAt: string
}

export interface UserStats {
  pending: number
  byTier: Record<Tier, number>
}

const GENERIC_ERROR = 'Something went wrong'
const FORBIDDEN = 'You do not have access to perform this action'

type Sql = NonNullable<Awaited<ReturnType<typeof getClient>>>

// Authorization reads the DB, not the token: a stale token must never
// retain privileges after a tier change or deactivation.
async function getCaller(
  sql: Sql,
  minTier: Tier,
): Promise<{ id: number; tier: Tier } | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifyToken(token, getAuthSecret())
  if (!payload) return null
  const rows = await sql`
    SELECT id, tier, status FROM users WHERE id = ${payload.sub}
  `
  const row = rows[0] as
    | { id: number; tier: Tier; status: string }
    | undefined
  if (!row || row.status !== 'active' || !hasTier(row.tier, minTier)) {
    return null
  }
  return { id: row.id, tier: row.tier }
}

export const listUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<Array<AdminUser>>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT id, email, name, tier, status, created_at
        FROM users
        ORDER BY created_at DESC
      `
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id as number,
          email: row.email as string,
          name: row.name as string,
          tier: row.tier as Tier,
          status: row.status as AdminUser['status'],
          createdAt: String(row.created_at),
        })),
      }
    } catch (error) {
      console.error('listUsers failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)

const UserIdSchema = z.object({ userId: z.number() })

async function setPendingStatus(
  userId: number,
  status: 'active' | 'rejected',
): Promise<Result<null>> {
  try {
    const sql = await getClient()
    if (!sql) return { ok: false, error: GENERIC_ERROR }
    const caller = await getCaller(sql, 'master')
    if (!caller) return { ok: false, error: FORBIDDEN }
    const updated = await sql`
      UPDATE users
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId} AND status = 'pending'
      RETURNING id
    `
    if (updated.length === 0) {
      return { ok: false, error: 'Request not found or already handled' }
    }
    return { ok: true, data: null }
  } catch (error) {
    console.error('setPendingStatus failed', error)
    return { ok: false, error: GENERIC_ERROR }
  }
}

export const approveUser = createServerFn({ method: 'POST' })
  .inputValidator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'active'))

export const rejectUser = createServerFn({ method: 'POST' })
  .inputValidator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'rejected'))

export const setUserTier = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.number(), tier: z.enum(TIERS) }))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      if (caller.id === data.userId) {
        return { ok: false, error: 'You cannot change your own tier' }
      }
      const rows = await sql`
        SELECT tier FROM users WHERE id = ${data.userId}
      `
      const target = rows[0] as { tier: Tier } | undefined
      if (!target) return { ok: false, error: 'User not found' }
      if (!canSetTier(caller.tier, target.tier, data.tier)) {
        return {
          ok: false,
          error: 'Only a master can grant or revoke master access',
        }
      }
      await sql`
        UPDATE users
        SET tier = ${data.tier}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.userId}
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('setUserTier failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const getUserStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<UserStats>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'master')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT tier, status, COUNT(*)::int AS count
        FROM users
        GROUP BY tier, status
      `
      const stats: UserStats = {
        pending: 0,
        byTier: { basic: 0, ops: 0, master: 0 },
      }
      for (const row of rows) {
        if (row.status === 'pending') stats.pending += row.count as number
        if (row.status === 'active') {
          stats.byTier[row.tier as Tier] += row.count as number
        }
      }
      return { ok: true, data: stats }
    } catch (error) {
      console.error('getUserStats failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)
