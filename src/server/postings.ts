import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'
import {
  DEACTIVATION_REASONS,
  EMPLOYMENT_TYPES,
  TEMPLATE_CATEGORIES,
  templateToPosting,
} from '#/lib/postings'
import type { JdTemplate } from '#/lib/postings'

const n = (v: unknown) => Number(v ?? 0)

export const getPostings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()

    const templates = (await sql`
    select id, title, category, summary, description from jd_templates order by title`) as Array<any>

    const active = (await sql`
    select j.id, j.role, j.department, j.location, j.employment_type, j.category,
           j.published, j.published_at, count(a.id) applicants
    from job_openings j
    left join applications a on a.job_id = j.id
    where j.posting_status = 'active'
    group by j.id
    order by j.published_at desc nulls last, j.id desc`) as Array<any>

    const closed = (await sql`
    select id, role, department, location, deactivation_reason, deactivated_at
    from job_openings
    where posting_status = 'closed'
    order by deactivated_at desc nulls last limit 20`) as Array<any>

    const publishedCount = n(
      (
        await sql`select count(*) c from job_openings where published and posting_status='active'`
      )[0].c,
    )
    const openedThisMonth = n(
      (
        await sql`select count(*) c from job_openings where posting_status='active' and opened_date >= date_trunc('month', CURRENT_DATE)`
      )[0].c,
    )
    const totalApplicants = active.reduce((sum, p) => sum + n(p.applicants), 0)

    return {
      templates: templates.map((t) => ({
        id: t.id as number,
        title: t.title as string,
        category: t.category as string,
        summary: t.summary as string,
        description: t.description as string,
      })),
      active: active.map((p) => ({
        id: p.id as number,
        role: p.role as string,
        department: p.department as string,
        location: p.location as string,
        employmentType: p.employment_type as string,
        category: p.category as string,
        published: p.published as boolean,
        applicants: n(p.applicants),
      })),
      closed: closed.map((p) => ({
        id: p.id as number,
        role: p.role as string,
        department: p.department as string,
        location: p.location as string,
        reason: (p.deactivation_reason as string | null) ?? '—',
        closedAt: p.deactivated_at ? String(p.deactivated_at) : null,
      })),
      kpis: {
        active: active.length,
        published: publishedCount,
        openedThisMonth,
        totalApplicants,
      },
    }
  },
)

export const createPosting = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        templateId: z.number().int().positive(),
        department: z.string().min(1).max(64),
        location: z.string().min(1).max(64),
        employmentType: z.enum(EMPLOYMENT_TYPES),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return { ok: false, error: 'Only ops and master can create postings' }
      }

      const template = (
        await sql`
        select id, title, category, description from jd_templates where id = ${data.templateId}`
      )[0] as JdTemplate | undefined
      if (!template) return { ok: false, error: 'Template not found' }

      const row = templateToPosting(template, {
        department: data.department,
        location: data.location,
        employmentType: data.employmentType,
      })
      const today = new Date().toISOString().slice(0, 10)

      await sql`
        insert into job_openings
          (role, department, status, opened_date, days_open, is_critical, category,
           location, employment_type, description, published, published_at,
           template_id, posting_status)
        values
          (${row.role}, ${row.department}, 'in_progress', ${today}, 0, false, ${row.category},
           ${row.location}, ${row.employmentType}, ${row.description}, true, now(),
           ${row.templateId}, 'active')`
      return { ok: true, data: null }
    } catch (error) {
      console.error('createPosting failed', error)
      return { ok: false, error: 'Failed to create posting' }
    }
  })

export const deactivatePosting = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        reason: z.enum(DEACTIVATION_REASONS),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return {
          ok: false,
          error: 'Only ops and master can deactivate postings',
        }
      }

      const updated = await sql`
        update job_openings
        set posting_status = 'closed',
            deactivation_reason = ${data.reason},
            deactivated_at = now()
        where id = ${data.id} and posting_status = 'active'
        returning id`
      if (updated.length === 0) {
        return { ok: false, error: 'Posting not found or already closed' }
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('deactivatePosting failed', error)
      return { ok: false, error: 'Failed to deactivate posting' }
    }
  })

// ---- JD template management (ops+) ---------------------------------------
const TemplateFields = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(TEMPLATE_CATEGORIES),
  summary: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
})

export const createTemplate = createServerFn({ method: 'POST' })
  .validator((d: unknown) => TemplateFields.parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Only ops and master can manage templates' }
      await sql`
        insert into jd_templates (title, category, summary, description)
        values (${data.title}, ${data.category}, ${data.summary}, ${data.description})`
      return { ok: true, data: null }
    } catch (error) {
      console.error('createTemplate failed', error)
      return { ok: false, error: 'Failed to create template' }
    }
  })

export const updateTemplate = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    TemplateFields.extend({ id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Only ops and master can manage templates' }
      const updated = await sql`
        update jd_templates
        set title = ${data.title}, category = ${data.category},
            summary = ${data.summary}, description = ${data.description}
        where id = ${data.id} returning id`
      if (updated.length === 0)
        return { ok: false, error: 'Template not found' }
      return { ok: true, data: null }
    } catch (error) {
      console.error('updateTemplate failed', error)
      return { ok: false, error: 'Failed to update template' }
    }
  })

export const deleteTemplate = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Only ops and master can manage templates' }
      // Live postings copied the JD text at creation, so removing a template
      // does not affect existing postings.
      await sql`delete from jd_templates where id = ${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('deleteTemplate failed', error)
      return { ok: false, error: 'Failed to delete template' }
    }
  })
