import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser } from '#/server/session'
import { hasTier } from '#/lib/tiers'
import type { Result } from '#/server/auth'

export interface Holiday {
  id: number
  date: string
  name: string
}

const dateSchema = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expected a YYYY-MM-DD date')

async function requireMaster(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getSessionUser()
  if (!me || !hasTier(me.tier, 'master')) {
    return { ok: false, error: 'Only master can manage the holiday calendar' }
  }
  return { ok: true }
}

const toHoliday = (r: {
  id: number
  holiday_date: string
  name: string
}): Holiday => ({
  id: r.id,
  // Queries cast holiday_date to text, so this is already a clean 'YYYY-MM-DD'.
  date: r.holiday_date,
  name: r.name,
})

export const getHolidays = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<Array<Holiday>> => {
    const sql = requireDb()
    const start = `${data.year}-01-01`
    const end = `${data.year}-12-31`
    const rows = (await sql`
      select id, holiday_date::text as holiday_date, name from holidays
      where holiday_date between ${start} and ${end}
      order by holiday_date`) as Array<any>
    return rows.map(toHoliday)
  })

// Any signed-in user: holidays from today through +2 months, for the landing card.
export const getUpcomingHolidays = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<Holiday>> => {
    const sql = requireDb()
    const rows = (await sql`
      select id, holiday_date::text as holiday_date, name from holidays
      where holiday_date >= current_date
        and holiday_date <= (current_date + interval '2 months')
      order by holiday_date`) as Array<any>
    return rows.map(toHoliday)
  },
)

export const addHoliday = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ date: dateSchema, name: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const guard = await requireMaster()
    if (!guard.ok) return guard
    try {
      const sql = requireDb()
      await sql`
        insert into holidays (holiday_date, name) values (${data.date}, ${data.name})
        on conflict (holiday_date) do update set name = excluded.name`
      return { ok: true, data: null }
    } catch (error) {
      console.error('addHoliday failed', error)
      return { ok: false, error: 'Failed to add holiday' }
    }
  })

export const updateHoliday = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        date: dateSchema,
        name: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const guard = await requireMaster()
    if (!guard.ok) return guard
    try {
      const sql = requireDb()
      await sql`update holidays set holiday_date = ${data.date}, name = ${data.name} where id = ${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('updateHoliday failed', error)
      return {
        ok: false,
        error: 'Failed to update holiday (date may clash with another holiday)',
      }
    }
  })

export const deleteHoliday = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const guard = await requireMaster()
    if (!guard.ok) return guard
    try {
      const sql = requireDb()
      await sql`delete from holidays where id = ${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('deleteHoliday failed', error)
      return { ok: false, error: 'Failed to delete holiday' }
    }
  })
