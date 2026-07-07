import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { getClient } from '#/db'
import { hashPassword, verifyPassword } from '#/server/password'
import { signToken, verifyToken } from '#/server/jwt'
import type { Tier } from '#/lib/tiers'

export const SESSION_COOKIE = 'quorq_session'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 // 24h — spec'd staleness bound

export interface AuthUser {
  id: number
  email: string
  name: string
  tier: Tier
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

const GENERIC_ERROR = 'Something went wrong'

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return secret
}

export const signup = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      email: z.email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const email = data.email.toLowerCase()
      const existing = await sql`SELECT id FROM users WHERE email = ${email}`
      if (existing.length > 0) {
        return {
          ok: false,
          error: 'An account with this email already exists',
        }
      }
      const passwordHash = await hashPassword(data.password)
      await sql`
        INSERT INTO users (email, name, password_hash)
        VALUES (${email}, ${data.name}, ${passwordHash})
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('signup failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const login = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<Result<AuthUser>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const rows = await sql`
        SELECT id, email, name, password_hash, tier, status
        FROM users
        WHERE email = ${data.email.toLowerCase()}
      `
      const row = rows[0] as
        | {
            id: number
            email: string
            name: string
            password_hash: string
            tier: Tier
            status: string
          }
        | undefined
      if (!row || !(await verifyPassword(data.password, row.password_hash))) {
        return { ok: false, error: 'Invalid email or password' }
      }
      if (row.status === 'pending') {
        return { ok: false, error: 'Your account is awaiting approval.' }
      }
      if (row.status === 'rejected') {
        return { ok: false, error: 'Your signup request was declined.' }
      }
      const user: AuthUser = {
        id: row.id,
        email: row.email,
        name: row.name,
        tier: row.tier,
      }
      const token = await signToken(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
        },
        getAuthSecret(),
      )
      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: TOKEN_TTL_SECONDS,
      })
      return { ok: true, data: user }
    } catch (error) {
      console.error('login failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const logout = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Result<null>> => {
    deleteCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true, data: null }
  },
)

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthUser | null> => {
    const token = getCookie(SESSION_COOKIE)
    if (!token) return null
    const payload = await verifyToken(token, getAuthSecret())
    if (!payload) return null
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier,
    }
  },
)
