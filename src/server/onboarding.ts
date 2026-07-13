import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)

const TASK_TEMPLATE: Array<{ task: string; category: string }> = [
  { task: 'Submit ID & address proof', category: 'docs' },
  { task: 'Sign offer letter', category: 'docs' },
  { task: 'Submit bank & PF details', category: 'docs' },
  { task: 'Provision laptop', category: 'it' },
  { task: 'Create email & accounts', category: 'it' },
  { task: 'Grant system access', category: 'it' },
  { task: 'Team introduction', category: 'orientation' },
  { task: 'Office tour & buddy assigned', category: 'orientation' },
  { task: 'POSH training', category: 'compliance' },
  { task: 'Sign code of conduct', category: 'compliance' },
]

async function recomputeProgress(sql: ReturnType<typeof requireDb>, onbId: number): Promise<number> {
  const counts = (await sql`select count(*) total, count(*) filter (where done) done from onboarding_tasks where onboarding_id=${onbId}`)[0]
  const total = n(counts.total)
  const done = n(counts.done)
  const progress = total ? Math.round((done / total) * 100) : 0
  const status = progress === 100 ? 'completed' : 'in_progress'
  await sql`update onboardings set progress=${progress}, status=${status} where id=${onbId}`
  return progress
}

export const getOnboarding = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const rows = (await sql`select id, candidate_name, role, department, start_date, status, progress, employee_id
    from onboardings order by created_at desc`) as Array<any>
  const tasks = (await sql`select id, onboarding_id, task, category, done from onboarding_tasks order by sort_order`) as Array<any>
  const byOnb: Record<number, Array<any> | undefined> = {}
  for (const t of tasks) (byOnb[t.onboarding_id] ??= []).push(t)

  const noteRows = (await sql`select id, onboarding_id, note, done, created_at from onboarding_notes order by created_at`) as Array<any>
  const notesByOnb: Record<number, Array<any> | undefined> = {}
  for (const nr of noteRows) (notesByOnb[nr.onboarding_id] ??= []).push(nr)

  const stats = (await sql`select
    count(*) total,
    count(*) filter (where status='in_progress') active,
    count(*) filter (where status='completed') completed,
    coalesce(round(avg(progress)),0) avg from onboardings`) as Array<any>

  return {
    stats: {
      total: n(stats[0].total),
      active: n(stats[0].active),
      completed: n(stats[0].completed),
      avgProgress: n(stats[0].avg),
    },
    onboardings: rows.map((r) => ({
      id: r.id,
      candidateName: r.candidate_name,
      role: r.role,
      department: r.department,
      startDate: r.start_date,
      status: r.status,
      progress: n(r.progress),
      employeeId: r.employee_id,
      notes: (notesByOnb[r.id] ?? []).map((nr) => ({
        id: nr.id,
        note: nr.note,
        done: nr.done,
        createdAt: nr.created_at,
      })),
      tasks: (byOnb[r.id] ?? []).map((t) => ({
        id: t.id,
        task: t.task,
        category: t.category,
        done: t.done,
      })),
    })),
  }
})

async function requireApprover(): Promise<{ ok: false; error: string } | null> {
  const me = await getSessionUser()
  if (!canApprove(me)) return { ok: false, error: 'Not authorised' }
  return null
}

export const addOnboardingNote = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ onboardingId: z.number().int().positive(), note: z.string().max(2000) }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const note = data.note.trim()
    if (!note) return { ok: false, error: 'Note cannot be empty' }
    const sql = requireDb()
    await sql`insert into onboarding_notes (onboarding_id, note) values (${data.onboardingId}, ${note})`
    return { ok: true, data: null }
  })

export const toggleOnboardingNote = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ noteId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    await sql`update onboarding_notes set done = not done where id=${data.noteId}`
    return { ok: true, data: null }
  })

export const deleteOnboardingNote = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ noteId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    await sql`delete from onboarding_notes where id=${data.noteId}`
    return { ok: true, data: null }
  })

export const createOnboarding = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        candidateName: z.string().min(1).max(120),
        email: z.string().max(160).optional(),
        role: z.string().max(120).optional(),
        department: z.string().min(1).max(64),
        startDate: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    const start = data.startDate || new Date().toISOString().slice(0, 10)
    const onb = (await sql`
      insert into onboardings (candidate_name, email, role, department, start_date, status, progress)
      values (${data.candidateName.trim()}, ${data.email || null}, ${data.role || 'New hire'},
              ${data.department}, ${start}, 'in_progress', 0)
      returning id`)[0] as { id: number }

    const cols = ['onboarding_id', 'task', 'category', 'sort_order']
    const values = TASK_TEMPLATE.map(
      (_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(',')})`,
    ).join(',')
    const params = TASK_TEMPLATE.flatMap((t, i) => [onb.id, t.task, t.category, i])
    await sql.query(`insert into onboarding_tasks (${cols.join(',')}) values ${values}`, params)
    return { ok: true, data: null }
  })

export const toggleOnboardingTask = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ taskId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ progress: number }>> => {
    const me = await getSessionUser()
    if (!canApprove(me)) return { ok: false, error: 'Not authorised' }
    const sql = requireDb()
    const task = (await sql`select id, onboarding_id, done from onboarding_tasks where id=${data.taskId}`)[0] as
      | { id: number; onboarding_id: number; done: boolean }
      | undefined
    if (!task) return { ok: false, error: 'Task not found' }
    await sql`update onboarding_tasks set done = not done where id=${data.taskId}`

    const onbId = task.onboarding_id
    const counts = (await sql`select count(*) total, count(*) filter (where done) done from onboarding_tasks where onboarding_id=${onbId}`)[0]
    const total = n(counts.total)
    const done = n(counts.done)
    const progress = total ? Math.round((done / total) * 100) : 0
    const status = progress === 100 ? 'completed' : 'in_progress'
    await sql`update onboardings set progress=${progress}, status=${status} where id=${onbId}`

    // cascade: completing onboarding creates an active employee record
    if (progress === 100) {
      const onb = (await sql`select candidate_name, email, department, role, start_date, employee_id from onboardings where id=${onbId}`)[0] as
        | { candidate_name: string; email: string | null; department: string; role: string; start_date: string; employee_id: number | null }
        | undefined
      if (onb && !onb.employee_id) {
        const email =
          onb.email ||
          `${onb.candidate_name.toLowerCase().replace(/[^a-z]+/g, '.')}.${Date.now()}@quorq.ai`
        const emp = (await sql`
          insert into employees
            (name, email, department, designation, employment_type, location, status,
             gender, date_of_joining, ctc, net_pay, performance_rating, leave_balance)
          values (${onb.candidate_name}, ${email}, ${onb.department}, ${onb.role},
                  'full-time', 'Hyderabad', 'active', 'male', ${onb.start_date},
                  600000, 40000, 3.5, 15)
          returning id`)[0] as { id: number }
        await sql`update onboardings set employee_id=${emp.id} where id=${onbId}`
      }
    }
    return { ok: true, data: { progress } }
  })

export const updateOnboarding = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      id: z.number().int().positive(),
      department: z.string().min(1).max(64),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    await sql`update onboardings set department=${data.department}, start_date=${data.startDate} where id=${data.id}`
    return { ok: true, data: null }
  })

export const addOnboardingTask = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      onboardingId: z.number().int().positive(),
      task: z.string().min(1).max(160),
      category: z.enum(['docs', 'it', 'orientation', 'compliance']),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    const next = (await sql`select coalesce(max(sort_order),0)+1 so from onboarding_tasks where onboarding_id=${data.onboardingId}`)[0] as { so: number }
    await sql`insert into onboarding_tasks (onboarding_id, task, category, sort_order)
      values (${data.onboardingId}, ${data.task.trim()}, ${data.category}, ${n(next.so)})`
    await recomputeProgress(sql, data.onboardingId)
    return { ok: true, data: null }
  })

export const deleteOnboardingTask = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ taskId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ progress: number }>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    const task = (await sql`select onboarding_id from onboarding_tasks where id=${data.taskId}`)[0] as { onboarding_id: number } | undefined
    if (!task) return { ok: false, error: 'Task not found' }
    await sql`delete from onboarding_tasks where id=${data.taskId}`
    const progress = await recomputeProgress(sql, task.onboarding_id)
    return { ok: true, data: { progress } }
  })
