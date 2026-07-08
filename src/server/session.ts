import { getCookie } from '@tanstack/react-start/server'
import { requireDb } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import { hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

export interface SessionUser {
  id: number
  name: string
  tier: Tier
  employeeId: number | null
}

// Resolves the signed-in user from the session cookie, always re-reading tier
// and employee link from the DB so a stale token never retains privileges.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifyToken(token, getAuthSecret())
  if (!payload) return null
  const sql = requireDb()
  const rows = await sql`
    SELECT id, name, tier, status, employee_id FROM users WHERE id = ${payload.sub}
  `
  const row = rows[0] as
    | { id: number; name: string; tier: Tier; status: string; employee_id: number | null }
    | undefined
  if (!row || row.status !== 'active') return null
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    employeeId: row.employee_id ?? null,
  }
}

export function canApprove(user: SessionUser | null): boolean {
  return !!user && hasTier(user.tier, 'ops')
}
