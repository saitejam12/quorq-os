import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { hashPassword } from '#/server/password'
import { sendPasswordResetEmail } from '#/server/email/notifications'
import { RESET_TTL_MINUTES, generateToken, hashToken } from '#/lib/reset-tokens'
import type { Result } from '#/server/auth'

// requestPasswordReset ALWAYS returns ok:true regardless of whether the email
// maps to an account — this prevents account enumeration. A real send failure is
// logged inside the best-effort notification helper, never surfaced here.
export const requestPasswordReset = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ email: z.email() }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const email = data.email.toLowerCase()
      const user = (
        await sql`select id, name, email from users
          where lower(email) = ${email} and status = 'active'`
      )[0] as { id: number; name: string; email: string } | undefined

      if (user) {
        const token = generateToken()
        await sql`
          insert into password_reset_tokens (user_id, token_hash, expires_at)
          values (${user.id}, ${await hashToken(token)},
                  now() + make_interval(mins => ${RESET_TTL_MINUTES}))`
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          token,
        })
      }
      return { ok: true, data: null }
    } catch (error) {
      // Never reveal internal failures to the caller (enumeration-safe).
      console.error('requestPasswordReset failed', error)
      return { ok: true, data: null }
    }
  })

export const resetPassword = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({ token: z.string().min(1), password: z.string().min(8) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const INVALID = 'This reset link is invalid or has expired.'
    try {
      const sql = requireDb()
      const row = (
        await sql`select id, user_id from password_reset_tokens
          where token_hash = ${await hashToken(data.token)}
            and used_at is null and expires_at > now()
          limit 1`
      )[0] as { id: number; user_id: number } | undefined
      if (!row) return { ok: false, error: INVALID }

      const passwordHash = await hashPassword(data.password)
      await sql`update users set password_hash = ${passwordHash},
          updated_at = current_timestamp where id = ${row.user_id}`
      // Consume this token and invalidate any other outstanding ones for the user.
      await sql`update password_reset_tokens set used_at = now()
          where user_id = ${row.user_id} and used_at is null`
      return { ok: true, data: null }
    } catch (error) {
      console.error('resetPassword failed', error)
      return { ok: false, error: INVALID }
    }
  })
