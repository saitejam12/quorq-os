import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)

export const STAGES = ['applied', 'screened', 'interviewed', 'offer', 'joined'] as const
export type Stage = (typeof STAGES)[number]

export const getHiring = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()

  const jobs = (await sql`
    select j.id, j.role, j.department, j.status, j.days_open, j.is_critical,
           count(a.id) applicants
    from job_openings j
    left join applications a on a.job_id = j.id
    where j.posting_status = 'active'
    group by j.id order by j.days_open desc`) as Array<any>

  const stageCounts = (await sql`select stage, count(*) c from applications group by stage`) as Array<any>
  const sc = (st: string) => n(stageCounts.find((r) => r.stage === st)?.c)

  const cands = (await sql`
    select id, candidate_name, department, source, stage
    from applications
    where stage in ('applied','screened','interviewed','offer','joined')
    order by applied_date desc`) as Array<any>

  const pipeline: Record<string, Array<any> | undefined> = {
    applied: [], screened: [], interviewed: [], offer: [], joined: [],
  }
  for (const c of cands) {
    const col = pipeline[c.stage]
    if (col && col.length < 12) {
      col.push({
        id: c.id,
        name: c.candidate_name,
        department: c.department,
        source: c.source,
      })
    }
  }

  return {
    kpis: {
      openRoles: jobs.length,
      critical: jobs.filter((j) => j.is_critical).length,
      totalApplications: cands.length,
      inPipeline: sc('applied') + sc('screened') + sc('interviewed'),
      offers: sc('offer'),
      joined: sc('joined'),
    },
    columns: STAGES.map((st) => ({
      stage: st,
      count: sc(st),
      candidates: pipeline[st] ?? [],
    })),
  }
})

export const moveApplication = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.number().int().positive(), toStage: z.enum(STAGES) }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Not authorised' }
      await sql`update applications set stage=${data.toStage} where id=${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('moveApplication failed', error)
      return { ok: false, error: 'Failed to update application' }
    }
  })

