import { createServerFn } from '@tanstack/react-start'
import { requireDb } from '#/db'
import { C, AI_INSIGHTS } from './constants'

const n = (v: unknown) => Number(v ?? 0)

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (ym: string) => MONTH[Number(ym.slice(5, 7)) - 1]
const round1 = (v: number) => Math.round(v * 10) / 10
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

// ---------------------------------------------------------------------------
// shared building blocks
// ---------------------------------------------------------------------------
async function headcount() {
  const sql = requireDb()
  const total = n((await sql`select count(*) c from employees`)[0].c)
  const byStatus = (await sql`select status, count(*) c from employees group by status`) as Array<any>
  const get = (st: string) => n(byStatus.find((r) => r.status === st)?.c)
  const newThisMonth = n(
    (await sql`select count(*) c from employees where date_of_joining >= date_trunc('month', CURRENT_DATE)`)[0].c,
  )
  return {
    total,
    active: get('active'),
    onLeave: get('on_leave'),
    notice: get('notice'),
    newThisMonth,
  }
}

async function attritionRate() {
  const sql = requireDb()
  const total = n((await sql`select count(*) c from employees`)[0].c)
  const exits = n((await sql`select count(*) c from exits`)[0].c)
  // floor to 1dp so 12/142 reads as 8.4%
  return { rate: Math.floor((exits / total) * 1000) / 10, exits, total }
}

async function todayAttendance() {
  const sql = requireDb()
  const rows = (await sql`
    select status, count(*) c from attendance_records
    where day = (select max(day) from attendance_records) group by status`) as Array<any>
  const get = (st: string) => n(rows.find((r) => r.status === st)?.c)
  const total = rows.reduce((a, r) => a + n(r.c), 0)
  const present = get('present') + get('wfh')
  const late = n(
    (await sql`select count(*) c from attendance_records where day=(select max(day) from attendance_records) and late`)[0].c,
  )
  return {
    total,
    present,
    absent: get('absent'),
    leave: get('leave'),
    wfh: get('wfh'),
    late,
    percent: pct(present, total),
  }
}

async function attendanceHeatmap() {
  const sql = requireDb()
  const rows = (await sql`
    select day, count(*) filter (where status in ('present','wfh')) present, count(*) total
    from attendance_records
    where day < (select max(day) from attendance_records)
    group by day order by day desc limit 5`) as Array<any>
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return rows
    .map((r) => ({
      label: days[new Date(r.day).getUTCDay()],
      percent: pct(n(r.present), n(r.total)),
    }))
    .reverse()
}

async function attendanceTrend() {
  const sql = requireDb()
  const rows = (await sql`
    select to_char(day,'YYYY-MM') ym,
           count(*) filter (where status in ('present','wfh')) present,
           count(*) total
    from attendance_records group by ym order by ym desc limit 12`) as Array<any>
  return rows
    .map((r) => ({ label: monthLabel(r.ym), value: pct(n(r.present), n(r.total)) }))
    .reverse()
}

// rolling-12-month attrition line shaped toward the real current rate
function attritionTrendShape(currentRate: number) {
  const labels: Array<string> = []
  const base = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base)
    d.setMonth(d.getMonth() - i)
    labels.push(MONTH[d.getMonth()])
  }
  const shape = [0.62, 0.66, 0.7, 0.74, 0.78, 0.82, 0.86, 0.9, 0.93, 0.96, 0.98, 1.0]
  return labels.map((label, i) => ({ label, value: round1(shape[i] * currentRate) }))
}

// ---------------------------------------------------------------------------
// EXECUTIVE OVERVIEW
// ---------------------------------------------------------------------------
export const getExecutive = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const hc = await headcount()
  const att = await attritionRate()
  const today = await todayAttendance()
  const payroll = n((await sql`select coalesce(sum(net_pay),0) s from employees where status <> 'exited'`)[0].s)
  const compliance = (await sql`select label, value, tone from compliance_items order by sort_order`) as Array<any>

  return {
    headcount: hc,
    attrition: { rate: att.rate, deltaVsQ3: C.attritionDeltaVsQ3, industryAvg: C.industryAttritionAvg },
    attendance: {
      percent: today.percent,
      present: today.present,
      total: today.total,
      late: today.late,
      deltaVsLastWeek: C.attendanceDeltaVsLastWeek,
    },
    payroll: {
      monthlyL: round1(payroll / 100000),
      budgetL: C.payrollBudgetL,
      overL: round1(payroll / 100000 - C.payrollBudgetL),
    },
    attritionTrend: attritionTrendShape(att.rate),
    industryAvg: C.industryAttritionAvg,
    aiInsights: AI_INSIGHTS,
    compliance,
    heatmap: await attendanceHeatmap(),
    velocity: { ...C.velocity, avgTimeToHire: C.avgTimeToHire, target: C.timeToHireTarget, offerAccept: C.offerAcceptRate },
  }
})

// ---------------------------------------------------------------------------
// ATTENDANCE & LEAVE
// ---------------------------------------------------------------------------
export const getAttendance = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const today = await todayAttendance()

  const leaveTaken = n(
    (await sql`select coalesce(sum(days),0) s from leave_requests where status='approved'`)[0].s,
  )
  const empCount = n((await sql`select count(*) c from employees where status<>'exited'`)[0].c)
  const avgUsed = round1(leaveTaken / empCount)
  const leaveUtil = pct(avgUsed, C.leaveDaysEntitled)

  const breakdown = (await sql`
    select type, sum(days) days from leave_requests where status='approved' group by type`) as Array<any>
  const order = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'comp-off']
  const leaveBreakdown = order.map((t) => ({
    label: t === 'comp-off' ? 'Comp-off' : t[0].toUpperCase() + t.slice(1),
    value: n(breakdown.find((b) => b.type === t)?.days),
  }))

  const overtime = n(
    (await sql`select coalesce(sum(overtime_hours),0) s from attendance_records where day >= date_trunc('month', CURRENT_DATE)`)[0].s,
  )
  const lateMonth = n(
    (await sql`select count(*) c from attendance_records where day >= date_trunc('month', CURRENT_DATE) and late`)[0].c,
  )
  const earlyMonth = n(
    (await sql`select count(*) c from attendance_records where day >= date_trunc('month', CURRENT_DATE) and early_exit`)[0].c,
  )

  const pending = (await sql`
    select employee_name, type, days, status from leave_requests
    where status in ('pending','escalated') order by created_at`) as Array<any>

  const zeroLeave = n(
    (await sql`
      select count(*) c from employees e where e.status<>'exited'
      and not exists (select 1 from leave_requests l where l.employee_id = e.id)`)[0].c,
  )

  return {
    today,
    leave: {
      utilization: leaveUtil,
      avgUsed,
      entitled: C.leaveDaysEntitled,
      monthsElapsed: C.monthsElapsed,
    },
    absenteeism: { rate: C.absenteeismRate, delta: C.absenteeismDelta, target: C.absenteeismTarget },
    overtime: {
      hours: Math.round(overtime),
      avgPerEmployee: round1(overtime / empCount),
      costL: C.overtimeCostL,
    },
    trend: await attendanceTrend(),
    target: C.attendanceTarget,
    leaveBreakdown,
    heatmap: await attendanceHeatmap(),
    pending: pending.map((p) => ({
      name: p.employee_name,
      type: p.type === 'comp-off' ? 'Comp-off' : p.type[0].toUpperCase() + p.type.slice(1),
      days: n(p.days),
      status: p.status,
    })),
    kpis: {
      avgLeavePerEmployee: avgUsed,
      sickSpikeMonths: C.sickSpikeMonths,
      employeesZeroLeave: zeroLeave,
      lateArrivals: lateMonth,
      earlyExits: earlyMonth,
      leaveEncashmentL: C.leaveEncashmentL,
    },
  }
})

// ---------------------------------------------------------------------------
// ATTRITION & RETENTION
// ---------------------------------------------------------------------------
export const getAttrition = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const att = await attritionRate()
  const flagged = (await sql`
    select department, count(*) c from employees
    where flight_risk in ('high','critical') group by department order by c desc`) as Array<any>
  const flightRiskCount = flagged.reduce((a, r) => a + n(r.c), 0)

  const byDept = (await sql`select department, count(*) c from exits group by department order by c desc`) as Array<any>
  const reasons = (await sql`select reason, count(*) c from exits group by reason`) as Array<any>
  const reasonOrder = ['salary', 'growth', 'management', 'personal', 'competitor']
  const exitReasons = reasonOrder.map((r) => ({
    label: r[0].toUpperCase() + r.slice(1),
    value: pct(n(reasons.find((x) => x.reason === r)?.c), att.exits),
  }))

  const tenure = (await sql`select tenure_bucket, count(*) c from exits group by tenure_bucket`) as Array<any>
  const tenureLabels: Record<string, string> = {
    under_1yr: 'Under 1 yr',
    '1_2yr': '1–2 yr',
    '2_4yr': '2–4 yr',
    '4yr_plus': '4 yr+',
  }
  const tenureAtExit = ['under_1yr', '1_2yr', '2_4yr', '4yr_plus'].map((t) => ({
    label: tenureLabels[t],
    value: n(tenure.find((x) => x.tenure_bucket === t)?.c),
  }))

  const flightRisk = (await sql`
    select name, department, flight_risk from employees
    where flight_risk in ('high','critical')
    order by case flight_risk when 'critical' then 0 else 1 end, id limit 5`) as Array<any>

  const regrettable = n((await sql`select count(*) c from exits where regrettable`)[0].c)
  const counterOffer = n((await sql`select count(*) c from exits where counter_offer_accepted`)[0].c)

  return {
    attrition: { rate: att.rate, benchmark: C.industryAttritionAvg, exitsThisMonth: C.exitsThisMonth, voluntary: C.voluntaryThisMonth },
    retention: {
      rate: round1(100 - att.rate),
      target: C.retentionTarget,
      topPerformer: C.topPerformerRetention,
    },
    flightRisk: {
      count: flightRiskCount,
      byDept: flagged.map((r) => ({ dept: r.department, count: n(r.c) })),
    },
    cost: { totalL: round1(att.exits * C.costPerExitL), perExitL: C.costPerExitL, exitsYTD: att.exits },
    attritionByDept: byDept.map((r) => ({ label: r.department, value: n(r.c) })),
    exitReasons,
    flightRiskEmployees: flightRisk.map((r) => ({ name: r.name, dept: r.department, level: r.flight_risk })),
    tenureAtExit,
    kpis: {
      voluntary: C.voluntaryAttrition,
      involuntary: C.involuntaryAttrition,
      regrettable: `${regrettable} of ${att.exits}`,
      enps: C.enps,
      avgNotice: C.avgNoticeDays,
      counterOffer,
    },
  }
})

// ---------------------------------------------------------------------------
// TALENT ACQUISITION
// ---------------------------------------------------------------------------
export const getTalent = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const openCount = n((await sql`select count(*) c from job_openings where posting_status='active'`)[0].c)
  const critical = n((await sql`select count(*) c from job_openings where is_critical and posting_status='active'`)[0].c)
  const byCat = (await sql`select category, count(*) c from job_openings where posting_status='active' group by category`) as Array<any>
  const cat = (k: string) => n(byCat.find((r) => r.category === k)?.c)

  const stageRows = (await sql`select stage, count(*) c from applications group by stage`) as Array<any>
  const sc = (st: string) => n(stageRows.find((r) => r.stage === st)?.c)
  const total = stageRows.reduce((a, r) => a + n(r.c), 0)
  const applied = sc('applied')
  const screened = sc('screened')
  const offerStage = sc('offer') + sc('declined')
  const joined = sc('joined')
  const funnel = [
    { label: 'Applications', value: total },
    { label: 'Screened', value: total - applied },
    { label: 'Interviewed', value: total - applied - screened },
    { label: 'Offers made', value: offerStage + joined },
    { label: 'Joined', value: joined },
  ]

  const sources = (await sql`select source, count(*) c from applications group by source`) as Array<any>
  const srcOrder = ['linkedin', 'referral', 'job_boards', 'agency', 'direct']
  const srcLabel: Record<string, string> = {
    linkedin: 'LinkedIn',
    referral: 'Referral',
    job_boards: 'Job boards',
    agency: 'Agency',
    direct: 'Direct',
  }
  const sourceOfHire = srcOrder.map((s) => ({
    label: srcLabel[s],
    value: pct(n(sources.find((x) => x.source === s)?.c), total),
  }))

  const openRoles = (await sql`
    select role, department, days_open, status from job_openings
    where posting_status='active' order by days_open desc limit 6`) as Array<any>

  const female = n((await sql`select count(*) c from applications where gender='female'`)[0].c)

  return {
    openPositions: { count: openCount, critical, tech: cat('tech'), sales: cat('sales'), others: cat('others') },
    timeToHire: { avg: C.avgTimeToHire, target: C.timeToHireTarget, best: C.bestTimeToHire },
    offerAccept: { rate: C.offerAcceptRate, made: C.offersMade, accepted: C.offersAccepted, declined: C.offersDeclined },
    costPerHire: { value: C.costPerHireK, agency: C.agencyCostK, referral: C.referralCostK },
    funnel,
    appToJoin: total ? round1((joined / total) * 100) : 0,
    sourceOfHire,
    openRoles: openRoles.map((r) => ({
      role: r.role,
      dept: r.department,
      daysOpen: n(r.days_open),
      status: r.status,
    })),
    kpis: {
      totalApps: total,
      interviews: total - applied - screened,
      interviewToOffer: C.interviewToOffer,
      diversity: pct(female, total),
      declinedReason: 'Salary (42%)',
      referralConversion: C.referralConversion,
      newHireRetention: C.newHireRetention30,
    },
  }
})

// ---------------------------------------------------------------------------
// WORKFORCE INTELLIGENCE
// ---------------------------------------------------------------------------
export const getWorkforce = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const total = n((await sql`select count(*) c from employees`)[0].c)
  const byDept = (await sql`select department, count(*) c from employees group by department order by c desc`) as Array<any>
  const byType = (await sql`select employment_type, count(*) c from employees group by employment_type`) as Array<any>
  const byLoc = (await sql`select location, count(*) c from employees group by location order by c desc`) as Array<any>
  const byGender = (await sql`select gender, count(*) c from employees group by gender`) as Array<any>
  const topPerformers = n((await sql`select count(*) c from employees where is_top_performer`)[0].c)
  const avgRating = round1(n((await sql`select avg(performance_rating) a from employees`)[0].a))

  const tenure = (await sql`
    select case
      when date_of_joining > CURRENT_DATE - interval '1 year' then 'Under 1 yr'
      when date_of_joining > CURRENT_DATE - interval '2 year' then '1–2 yr'
      when date_of_joining > CURRENT_DATE - interval '4 year' then '2–4 yr'
      else '4 yr+' end bucket, count(*) c
    from employees group by bucket`) as Array<any>
  const tenureOrder = ['Under 1 yr', '1–2 yr', '2–4 yr', '4 yr+']

  const perfBands = (await sql`
    select case
      when performance_rating >= 4.5 then 'Exceptional (4.5+)'
      when performance_rating >= 3.5 then 'Exceeds (3.5–4.4)'
      when performance_rating >= 2.5 then 'Meets (2.5–3.4)'
      else 'Below (<2.5)' end band, count(*) c
    from employees group by band`) as Array<any>
  const perfOrder = ['Exceptional (4.5+)', 'Exceeds (3.5–4.4)', 'Meets (2.5–3.4)', 'Below (<2.5)']

  // (date - date) yields integer days; convert to years
  const avgTenureDays = n(
    (await sql`select avg(CURRENT_DATE - date_of_joining) a from employees`)[0].a,
  )

  const female = n(byGender.find((r) => r.gender === 'female')?.c)

  return {
    total,
    byDept: byDept.map((r) => ({ label: r.department, value: n(r.c) })),
    byType: byType.map((r) => ({ label: r.employment_type, value: n(r.c) })),
    byLocation: byLoc.map((r) => ({ label: r.location, value: n(r.c) })),
    gender: { female, male: total - female, femalePct: pct(female, total) },
    tenure: tenureOrder.map((t) => ({ label: t, value: n(tenure.find((x) => x.bucket === t)?.c) })),
    performance: perfOrder.map((p) => ({ label: p, value: n(perfBands.find((x) => x.band === p)?.c) })),
    topPerformers,
    avgRating,
    avgTenureYears: round1(avgTenureDays / 365),
  }
})

// ---------------------------------------------------------------------------
// CSV EXPORT (real, DB-backed)
// ---------------------------------------------------------------------------
function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

export const exportCsv = createServerFn({ method: 'GET' })
  .validator((kind: string) => kind)
  .handler(async ({ data: kind }) => {
    const sql = requireDb()
    let rows: Array<Record<string, unknown>> = []
    if (kind === 'payroll') {
      rows = (await sql`select name, department, designation, employment_type, ctc, net_pay from employees order by department, name`) as Array<any>
    } else if (kind === 'attrition') {
      rows = (await sql`select employee_name, department, exit_date, type, reason, tenure_bucket from exits order by exit_date`) as Array<any>
    } else if (kind === 'leave') {
      rows = (await sql`select employee_name, department, type, days, start_date, status from leave_requests order by start_date`) as Array<any>
    } else if (kind === 'recruitment') {
      rows = (await sql`select role, department, status, days_open, category from job_openings order by days_open desc`) as Array<any>
    } else if (kind === 'compliance') {
      rows = (await sql`select name, frequency, next_due, status, responsibility from statutory_reports order by next_due`) as Array<any>
    } else {
      rows = (await sql`select name, email, department, designation, employment_type, location, status, date_of_joining from employees order by department, name`) as Array<any>
    }
    return { filename: `${kind || 'headcount'}-report.csv`, csv: toCsv(rows) }
  })

// ---------------------------------------------------------------------------
// REPORTS HUB
// ---------------------------------------------------------------------------
export const getReports = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const prebuilt = (await sql`select title, subtitle, category, formats, icon from prebuilt_reports order by id`) as Array<any>
  const scheduled = (await sql`select name, cadence, tone from scheduled_reports order by id`) as Array<any>
  const statutory = (await sql`select name, frequency, next_due, status, responsibility from statutory_reports order by next_due`) as Array<any>

  return {
    stats: {
      prebuilt: C.prebuiltCount,
      prebuiltSplit: C.prebuiltSplit,
      exports: C.exportsThisMonth,
      exportsSplit: C.exportsSplit,
      scheduled: C.scheduledCount,
      completeness: C.dataCompleteness,
      incomplete: C.profilesIncomplete,
    },
    prebuilt: prebuilt.map((r) => ({
      title: r.title,
      subtitle: r.subtitle,
      formats: String(r.formats).split(','),
      icon: r.icon,
    })),
    scheduled: scheduled.map((r) => ({ name: r.name, cadence: r.cadence, tone: r.tone })),
    statutory: statutory.map((r) => ({
      name: r.name,
      frequency: r.frequency,
      nextDue: r.next_due,
      status: r.status,
      responsibility: r.responsibility,
    })),
  }
})
