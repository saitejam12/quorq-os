// Seeds the People modules with deterministic demo data: ~142 employees across
// 7 departments wired into a real reporting tree, plus recognitions,
// announcements and eNPS survey responses. Re-runnable (deletes then inserts).
//
// Deterministic by design: a fixed PRNG seed + curated name pools mean repeated
// runs produce identical data, so reviews are reproducible. No faker dependency.
//
// Usage: pnpm seed:people   (reads DATABASE_URL from .env.local, like apply-schema)
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const env = readFileSync('.env.local', 'utf8')
const match = env.match(/^DATABASE_URL=(.+)$/m)
if (!match) {
  console.error('DATABASE_URL not found in .env.local')
  process.exit(1)
}
const sql = neon(match[1].trim().replace(/^["']|["']$/g, ''))

// ---- deterministic PRNG (mulberry32) -------------------------------------
let state = 0x9e3779b9
function rand() {
  state |= 0
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
const isWeekday = (d) => {
  const g = d.getUTCDay()
  return g !== 0 && g !== 6
}

// Batched multi-row insert via parameterized query — far faster than one insert
// per row for the high-volume transactional tables (attendance, payslips).
async function bulk(table, cols, rows) {
  if (!rows.length) return
  const CHUNK = 400
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const values = slice
      .map(
        (_, r) =>
          `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(',')})`,
      )
      .join(',')
    const params = slice.flatMap((row) => cols.map((c) => row[c]))
    await sql.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values}`,
      params,
    )
  }
}

// ---- name pools ----------------------------------------------------------
const FIRST_M = [
  'Arjun', 'Rohan', 'Vikram', 'Karthik', 'Rahul', 'Aditya', 'Siddharth', 'Nikhil',
  'Aravind', 'Manish', 'Sameer', 'Varun', 'Deepak', 'Anand', 'Harish', 'Kiran',
  'Naveen', 'Praveen', 'Suresh', 'Vishal',
]
const FIRST_F = [
  'Priya', 'Ananya', 'Divya', 'Sneha', 'Meera', 'Kavya', 'Nisha', 'Pooja',
  'Ritika', 'Shreya', 'Aishwarya', 'Deepika', 'Lakshmi', 'Sania', 'Tara',
  'Ishita', 'Neha', 'Radhika', 'Swati', 'Anjali',
]
const LAST = [
  'Sharma', 'Reddy', 'Nair', 'Iyer', 'Patel', 'Rao', 'Kumar', 'Menon', 'Gupta',
  'Verma', 'Desai', 'Kapoor', 'Bose', 'Chopra', 'Malhotra', 'Pillai', 'Shetty',
  'Bhat', 'Joshi', 'Naidu',
]
const LOCATIONS = ['Hyderabad', 'Bangalore', 'Remote', 'Pune']
const CITIES = ['Hyderabad', 'Bangalore', 'Pune', 'Chennai', 'Mumbai', 'Delhi']
const AREAS = [
  'Gachibowli', 'Indiranagar', 'Koramangala', 'Hitech City', 'Baner',
  'Andheri', 'Whitefield', 'Madhapur', 'Viman Nagar', 'HSR Layout',
]
const BANKS = [
  { name: 'HDFC Bank', code: 'HDFC' },
  { name: 'ICICI Bank', code: 'ICIC' },
  { name: 'State Bank of India', code: 'SBIN' },
  { name: 'Axis Bank', code: 'UTIB' },
  { name: 'Kotak Mahindra Bank', code: 'KKBK' },
]
const PAN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const digits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join('')
const phoneNo = () => `+91 ${randInt(6, 9)}${digits(9)}`
const address = () => `${randInt(1, 999)}, ${pick(AREAS)}, ${pick(CITIES)}`
const panNo = () =>
  Array.from({ length: 5 }, () => PAN_LETTERS[randInt(0, 25)]).join('') +
  digits(4) +
  PAN_LETTERS[randInt(0, 25)]

// ---- department structure ------------------------------------------------
const DEPTS = [
  { name: 'Engineering', count: 48, head: 'VP Engineering', mgr: 'Engineering Manager',
    ics: ['Software Engineer', 'Sr. Software Engineer', 'Staff Engineer', 'QA Engineer', 'DevOps Engineer'] },
  { name: 'Sales', count: 28, head: 'VP Sales', mgr: 'Sales Manager',
    ics: ['Account Executive', 'Sr. Account Executive', 'SDR'] },
  { name: 'Operations', count: 22, head: 'Head of Operations', mgr: 'Operations Manager',
    ics: ['Operations Associate', 'Ops Lead'] },
  { name: 'Product', count: 14, head: 'Head of Product', mgr: 'Group Product Manager',
    ics: ['Product Manager', 'Sr. Product Manager', 'Product Designer'] },
  { name: 'Marketing', count: 12, head: 'Head of Marketing', mgr: 'Growth Manager',
    ics: ['Marketing Associate', 'Content Strategist'] },
  { name: 'Finance', count: 10, head: 'Head of Finance', mgr: 'Finance Manager',
    ics: ['Accountant', 'Financial Analyst'] },
  { name: 'HR', count: 8, head: 'Head of HR', mgr: 'HR Business Partner',
    ics: ['HR Associate', 'Recruiter'] },
]

let emailSeq = 0
function mkEmployee(department, designation, gender) {
  const first = pick(gender === 'female' ? FIRST_F : FIRST_M)
  const last = pick(LAST)
  const name = `${first} ${last}`
  emailSeq++
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.')
  const tenure = randInt(40, 2200)
  const netPay = randInt(26000, 130000)
  const rating = (randInt(26, 49) / 10).toFixed(1)
  const empType = rand() < 0.85 ? 'full-time' : rand() < 0.6 ? 'contract' : 'part-time'
  const location = rand() < 0.7 ? 'Hyderabad' : pick(LOCATIONS)
  const status = rand() < 0.9 ? 'active' : rand() < 0.6 ? 'on_leave' : 'notice'
  return {
    name,
    email: `${slug}.${emailSeq}@quorq.ai`,
    department,
    designation,
    employment_type: empType,
    location,
    status,
    gender,
    date_of_joining: iso(daysAgo(tenure)),
    ctc: String(Math.round(netPay * 13.5)),
    net_pay: String(netPay),
    performance_rating: rating,
    flight_risk: rand() < 0.85 ? 'none' : rand() < 0.6 ? 'high' : 'critical',
    emp_code: `QRQ-${String(emailSeq).padStart(4, '0')}`,
    phone: phoneNo(),
    current_address: address(),
    permanent_address: address(),
    emergency_contact_name: `${pick([...FIRST_M, ...FIRST_F])} ${last}`,
    emergency_contact_phone: phoneNo(),
  }
}

async function insertEmployee(e, managerId) {
  const rows = await sql`
    INSERT INTO employees
      (name, email, department, designation, employment_type, location, status,
       gender, date_of_joining, ctc, net_pay, performance_rating, flight_risk, manager_id,
       emp_code, phone, current_address, permanent_address,
       emergency_contact_name, emergency_contact_phone)
    VALUES
      (${e.name}, ${e.email}, ${e.department}, ${e.designation}, ${e.employment_type},
       ${e.location}, ${e.status}, ${e.gender}, ${e.date_of_joining}, ${e.ctc},
       ${e.net_pay}, ${e.performance_rating}, ${e.flight_risk}, ${managerId},
       ${e.emp_code}, ${e.phone}, ${e.current_address}, ${e.permanent_address},
       ${e.emergency_contact_name}, ${e.emergency_contact_phone})
    RETURNING id, name, department`
  const emp = rows[0]

  const bank = pick(BANKS)
  await sql`
    INSERT INTO employee_kyc
      (employee_id, bank_name, bank_account_number, bank_ifsc, aadhaar_number, pan_number)
    VALUES
      (${emp.id}, ${bank.name}, ${digits(randInt(11, 14))},
       ${`${bank.code}0${digits(6)}`}, ${digits(12)}, ${panNo()})`
  return {
    id: emp.id,
    name: e.name,
    department: e.department,
    designation: e.designation,
    status: e.status,
    gender: e.gender,
    location: e.location,
    dateOfJoining: e.date_of_joining,
    netPay: Number(e.net_pay),
  }
}

const genderFor = () => (rand() < 0.4 ? 'female' : 'male')

// ---- reset ---------------------------------------------------------------
console.log('Clearing existing People data…')
await sql`UPDATE users SET employee_id = NULL`
await sql`DELETE FROM payslips`
await sql`DELETE FROM payroll_runs`
await sql`DELETE FROM onboarding_notes`
await sql`DELETE FROM onboarding_tasks`
await sql`DELETE FROM onboardings`
await sql`DELETE FROM applications`
await sql`DELETE FROM job_openings`
await sql`DELETE FROM jd_templates`
await sql`DELETE FROM attendance_records`
await sql`DELETE FROM leave_requests`
await sql`DELETE FROM time_entries`
await sql`DELETE FROM expenses`
await sql`DELETE FROM exits`
await sql`DELETE FROM compliance_items`
await sql`DELETE FROM statutory_reports`
await sql`DELETE FROM scheduled_reports`
await sql`DELETE FROM prebuilt_reports`
await sql`DELETE FROM survey_responses`
await sql`DELETE FROM recognitions`
await sql`DELETE FROM announcements`
await sql`DELETE FROM employee_kyc`
await sql`DELETE FROM employees`

// ---- employees + reporting tree ------------------------------------------
const allEmployees = []
const heads = []
const managersFlat = []
const icsFlat = []

for (const dep of DEPTS) {
  const head = await insertEmployee(
    mkEmployee(dep.name, dep.head, genderFor()),
    null,
  )
  heads.push(head)
  allEmployees.push(head)

  const numManagers = Math.max(1, Math.round((dep.count - 1) / 7))
  const managers = []
  for (let i = 0; i < numManagers; i++) {
    const m = await insertEmployee(
      mkEmployee(dep.name, dep.mgr, genderFor()),
      head.id,
    )
    managers.push(m)
    managersFlat.push(m)
    allEmployees.push(m)
  }

  const numIcs = dep.count - 1 - numManagers
  for (let i = 0; i < numIcs; i++) {
    const manager = managers[i % managers.length]
    const ic = await insertEmployee(
      mkEmployee(dep.name, pick(dep.ics), genderFor()),
      manager.id,
    )
    icsFlat.push(ic)
    allEmployees.push(ic)
  }
}
console.log(`Inserted ${allEmployees.length} employees across ${DEPTS.length} departments`)

// ---- recognitions --------------------------------------------------------
const VALUES = ['teamwork', 'innovation', 'ownership', 'customer', 'leadership']
const MESSAGES = [
  'went above and beyond to ship the release on time.',
  'mentored the new joiners with great patience.',
  'turned around a tricky customer escalation beautifully.',
  'brought a fresh idea that saved us hours of work.',
  'consistently raises the bar for the whole team.',
  'stepped up to own the migration end to end.',
  'made onboarding so much smoother for everyone.',
  'kept the team calm and focused under a tight deadline.',
]
let recCount = 0
for (let i = 0; i < 45; i++) {
  const from = pick(allEmployees)
  const to = pick(allEmployees)
  if (from.id === to.id) continue
  await sql`
    INSERT INTO recognitions
      (from_name, to_employee_id, to_name, department, value, message, created_at)
    VALUES
      (${from.name}, ${to.id}, ${to.name}, ${to.department},
       ${pick(VALUES)}, ${pick(MESSAGES)}, ${iso(daysAgo(randInt(0, 40)))})`
  recCount++
}
console.log(`Inserted ${recCount} recognitions`)

// ---- announcements -------------------------------------------------------
const ANNOUNCEMENTS = [
  { title: 'Updated leave policy for 2026', body: 'Carry-forward limits and the new sabbatical policy take effect this quarter. Read the full details on the intranet.', category: 'policy' },
  { title: 'All-hands next Friday', body: 'Join us for the quarterly all-hands. Leadership will share the roadmap and celebrate this quarter’s wins.', category: 'event' },
  { title: 'New health-insurance provider', body: 'We have switched providers effective this month. Digital cards are available in the benefits portal.', category: 'policy' },
  { title: 'Diwali celebration', body: 'The office celebration is on the 29th. Bring your families for food, games and rangoli.', category: 'event' },
  { title: 'Welcome to our new joiners', body: 'A warm welcome to everyone who joined this month across all departments. Say hi on Slack!', category: 'general' },
]
for (let i = 0; i < ANNOUNCEMENTS.length; i++) {
  const a = ANNOUNCEMENTS[i]
  await sql`
    INSERT INTO announcements (title, body, category, author, created_at)
    VALUES (${a.title}, ${a.body}, ${a.category}, ${pick(heads).name},
            ${iso(daysAgo(randInt(1, 25)))})`
}
console.log(`Inserted ${ANNOUNCEMENTS.length} announcements`)

// ---- eNPS survey responses (skewed positive) -----------------------------
let surveyCount = 0
for (const emp of allEmployees) {
  if (rand() < 0.25) continue // ~75% response rate
  const roll = rand()
  const score = roll < 0.55 ? randInt(9, 10) : roll < 0.85 ? randInt(7, 8) : randInt(0, 6)
  await sql`
    INSERT INTO survey_responses (employee_id, department, score, created_at)
    VALUES (${emp.id}, ${emp.department}, ${score}, ${iso(daysAgo(randInt(0, 20)))})`
  surveyCount++
}
console.log(`Inserted ${surveyCount} survey responses`)

// ---- attendance records (last ~90 days, weekdays) ------------------------
const attStatus = () => {
  const r = rand()
  if (r > 0.97) return 'absent'
  if (r > 0.9) return 'leave'
  if (r > 0.75) return 'wfh'
  return 'present'
}
const attRows = []
for (let dback = 0; dback < 90; dback++) {
  const d = daysAgo(dback)
  if (!isWeekday(d)) continue
  const day = iso(d)
  for (const emp of allEmployees) {
    const status = attStatus()
    attRows.push({
      employee_id: emp.id,
      department: emp.department,
      day,
      status,
      late: status === 'present' && rand() < 0.12,
      early_exit: status === 'present' && rand() < 0.08,
      overtime_hours: rand() < 0.2 ? randInt(1, 3) : 0,
    })
  }
}
await bulk(
  'attendance_records',
  ['employee_id', 'department', 'day', 'status', 'late', 'early_exit', 'overtime_hours'],
  attRows,
)
console.log(`Inserted ${attRows.length} attendance records`)

// ---- leave requests ------------------------------------------------------
const LTYPES = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'comp-off']
const LEAVE_REASONS = [
  'Family function', 'Medical', 'Personal work', 'Vacation', 'Not feeling well',
  'Child care', 'House shifting', 'Festival',
]
const leaveRows = []
for (let i = 0; i < 75; i++) {
  const emp = pick(allEmployees)
  const type = pick(LTYPES)
  const days =
    type === 'maternity' ? randInt(60, 90)
    : type === 'paternity' ? randInt(5, 10)
    : randInt(1, 5)
  const start = randInt(1, 150)
  leaveRows.push({
    employee_id: emp.id,
    employee_name: emp.name,
    department: emp.department,
    type,
    days,
    start_date: iso(daysAgo(start)),
    end_date: iso(daysAgo(start - days)),
    reason: pick(LEAVE_REASONS),
    status: 'approved',
    created_at: iso(daysAgo(start + randInt(2, 10))),
  })
}
for (let i = 0; i < 9; i++) {
  const emp = pick(allEmployees)
  const type = pick(LTYPES)
  leaveRows.push({
    employee_id: emp.id,
    employee_name: emp.name,
    department: emp.department,
    type,
    days: randInt(1, 4),
    start_date: iso(daysAgo(-randInt(2, 20))),
    end_date: null,
    reason: pick(LEAVE_REASONS),
    status: rand() < 0.7 ? 'pending' : 'escalated',
    created_at: iso(daysAgo(randInt(0, 5))),
  })
}
await bulk(
  'leave_requests',
  ['employee_id', 'employee_name', 'department', 'type', 'days', 'start_date', 'end_date', 'reason', 'status', 'created_at'],
  leaveRows,
)
console.log(`Inserted ${leaveRows.length} leave requests`)

// ---- exits (attrition) ---------------------------------------------------
const EXIT_REASONS = ['salary', 'growth', 'management', 'personal', 'competitor']
const TENURE = ['under_1yr', '1_2yr', '2_4yr', '4yr_plus']
const exitRows = []
for (let i = 0; i < 12; i++) {
  const emp = pick(allEmployees)
  exitRows.push({
    employee_name: emp.name,
    department: emp.department,
    exit_date: iso(daysAgo(randInt(5, 330))),
    type: rand() < 0.8 ? 'voluntary' : 'involuntary',
    reason: pick(EXIT_REASONS),
    regrettable: rand() < 0.5,
    tenure_bucket: pick(TENURE),
    notice_period_days: pick([30, 45, 60, 90]),
    counter_offer_accepted: rand() < 0.25,
  })
}
await bulk(
  'exits',
  ['employee_name', 'department', 'exit_date', 'type', 'reason', 'regrettable', 'tenure_bucket', 'notice_period_days', 'counter_offer_accepted'],
  exitRows,
)
console.log(`Inserted ${exitRows.length} exits`)

// ---- job openings + applications (recruitment funnel) --------------------
const OPENINGS = [
  { role: 'Senior Software Engineer', department: 'Engineering', category: 'tech' },
  { role: 'Staff Engineer', department: 'Engineering', category: 'tech' },
  { role: 'DevOps Engineer', department: 'Engineering', category: 'tech' },
  { role: 'Engineering Manager', department: 'Engineering', category: 'tech' },
  { role: 'Account Executive', department: 'Sales', category: 'sales' },
  { role: 'Sales Manager', department: 'Sales', category: 'sales' },
  { role: 'SDR', department: 'Sales', category: 'sales' },
  { role: 'Product Manager', department: 'Product', category: 'others' },
  { role: 'Product Designer', department: 'Product', category: 'others' },
  { role: 'Financial Analyst', department: 'Finance', category: 'others' },
  { role: 'Recruiter', department: 'HR', category: 'others' },
  { role: 'Growth Manager', department: 'Marketing', category: 'others' },
]
// job-description templates (offered in the "+ New opening" popup)
const JD_TEMPLATES = [
  { title: 'Software Engineer', category: 'tech', summary: 'Build and ship product features across the stack.',
    description: 'Design, build and maintain product features.\nCollaborate with product and design.\nWrite tested, maintainable code.\n\nRequirements: 2+ years building web applications; strong fundamentals in one modern language.' },
  { title: 'Senior Software Engineer', category: 'tech', summary: 'Own services end to end and mentor engineers.',
    description: 'Own the design and delivery of backend services.\nMentor engineers and raise the technical bar.\nDrive reliability and performance.\n\nRequirements: 5+ years; experience owning production systems.' },
  { title: 'Engineering Manager', category: 'tech', summary: 'Lead a team of engineers and delivery.',
    description: 'Lead, grow and support a team of engineers.\nOwn delivery, planning and quality.\nPartner with product on the roadmap.\n\nRequirements: prior people-management experience; strong engineering background.' },
  { title: 'Account Executive', category: 'sales', summary: 'Own the full sales cycle for new business.',
    description: 'Manage the full sales cycle from prospect to close.\nBuild a pipeline and hit quota.\nPartner with SDRs and marketing.\n\nRequirements: 2+ years closing B2B deals.' },
  { title: 'Sales Manager', category: 'sales', summary: 'Lead a quota-carrying sales team.',
    description: 'Lead and coach a team of account executives.\nForecast and own regional targets.\nBuild repeatable sales processes.\n\nRequirements: prior sales-management experience.' },
  { title: 'Product Manager', category: 'others', summary: 'Own the roadmap and outcomes for a product area.',
    description: 'Own the roadmap and outcomes for a product area.\nTalk to customers and define requirements.\nPartner with engineering and design.\n\nRequirements: 3+ years in product management.' },
  { title: 'HR Business Partner', category: 'others', summary: 'Partner with leaders on people strategy.',
    description: 'Partner with department leaders on people strategy.\nSupport hiring, performance and engagement.\nAdvise on policy and compliance.\n\nRequirements: prior HRBP experience.' },
]
const templateIds = {}
for (const t of JD_TEMPLATES) {
  const r = await sql`
    INSERT INTO jd_templates (title, category, summary, description)
    VALUES (${t.title}, ${t.category}, ${t.summary}, ${t.description}) RETURNING id`
  templateIds[t.title] = r[0].id
}
console.log(`Inserted ${JD_TEMPLATES.length} JD templates`)

const JOB_STATUS = ['critical', 'at_risk', 'in_progress', 'on_track']
const EMP_TYPES = ['full-time', 'full-time', 'full-time', 'contract']
const jobIds = []
for (const o of OPENINGS) {
  const daysOpen = randInt(5, 70)
  const critical = daysOpen > 45
  const tpl =
    JD_TEMPLATES.find((t) => t.title === o.role) ??
    JD_TEMPLATES.find((t) => t.category === o.category) ??
    JD_TEMPLATES[0]
  const rows = await sql`
    INSERT INTO job_openings
      (role, department, status, opened_date, days_open, is_critical, category,
       location, employment_type, description, published, published_at, template_id, posting_status)
    VALUES (${o.role}, ${o.department}, ${critical ? 'critical' : pick(JOB_STATUS)},
            ${iso(daysAgo(daysOpen))}, ${daysOpen}, ${critical}, ${o.category},
            ${pick(LOCATIONS)}, ${pick(EMP_TYPES)}, ${tpl.description}, true,
            ${iso(daysAgo(daysOpen))}, ${templateIds[tpl.title]}, 'active')
    RETURNING id, department`
  jobIds.push(rows[0])
}
const STAGES = ['applied', 'screened', 'interviewed', 'offer', 'joined', 'declined']
const STAGE_WEIGHTS = [42, 24, 20, 8, 12, 5]
const SOURCES = ['linkedin', 'referral', 'job_boards', 'agency', 'direct']
const stageBag = STAGES.flatMap((s, i) => Array(STAGE_WEIGHTS[i]).fill(s))
const appRows = []
for (let i = 0; i < 110; i++) {
  const job = pick(jobIds)
  const stage = pick(stageBag)
  appRows.push({
    job_id: job.id,
    candidate_name: `${pick([...FIRST_M, ...FIRST_F])} ${pick(LAST)}`,
    department: job.department,
    stage,
    source: pick(SOURCES),
    gender: rand() < 0.4 ? 'female' : 'male',
    decline_reason: stage === 'declined' ? pick(['salary', 'location', 'counter_offer', 'other']) : null,
    applied_date: iso(daysAgo(randInt(2, 90))),
  })
}
await bulk(
  'applications',
  ['job_id', 'candidate_name', 'department', 'stage', 'source', 'gender', 'decline_reason', 'applied_date'],
  appRows,
)
console.log(`Inserted ${jobIds.length} openings, ${appRows.length} applications`)

// ---- time entries (today, UTC instants; some with multiple sessions) -----
const timeDay = iso(daysAgo(0))
// Times are stored as UTC (trailing Z) so they are unambiguous absolute instants.
const utcTs = (h, m) => `${timeDay}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
const hrsOf = (a, b) => Math.round(((Date.parse(b) - Date.parse(a)) / 3600000) * 100) / 100
const timeRows = []
for (const emp of allEmployees) {
  if (rand() < 0.6) continue // ~40% have activity today
  const base = { employee_id: emp.id, employee_name: emp.name, department: emp.department, day: timeDay }

  if (rand() < 0.4) {
    // two sessions: a completed morning block + an afternoon block
    const mIn = utcTs(9, randInt(0, 30))
    const mOut = utcTs(12, randInt(0, 59))
    timeRows.push({ ...base, clock_in: mIn, clock_out: mOut, hours_worked: hrsOf(mIn, mOut), status: 'completed' })

    const aIn = utcTs(13, randInt(0, 59))
    if (rand() < 0.5) {
      timeRows.push({ ...base, clock_in: aIn, clock_out: null, hours_worked: 0, status: 'active' })
    } else {
      const aOut = utcTs(17, randInt(0, 59))
      timeRows.push({ ...base, clock_in: aIn, clock_out: aOut, hours_worked: hrsOf(aIn, aOut), status: 'completed' })
    }
  } else {
    // single session: open or completed
    const cin = utcTs(8 + randInt(0, 2), randInt(0, 59))
    if (rand() < 0.35) {
      timeRows.push({ ...base, clock_in: cin, clock_out: null, hours_worked: 0, status: 'active' })
    } else {
      const cout = utcTs(16 + randInt(0, 2), randInt(0, 59))
      timeRows.push({ ...base, clock_in: cin, clock_out: cout, hours_worked: hrsOf(cin, cout), status: 'completed' })
    }
  }
}
await bulk(
  'time_entries',
  ['employee_id', 'employee_name', 'department', 'day', 'clock_in', 'clock_out', 'hours_worked', 'status'],
  timeRows,
)
console.log(`Inserted ${timeRows.length} time entries`)

// ---- expenses ------------------------------------------------------------
const EXP_CATS = ['travel', 'food', 'software', 'equipment', 'training', 'other']
const EXP_STATUS = ['pending', 'approved', 'rejected', 'reimbursed']
const EXP_DESC = {
  travel: 'Client visit cab fare', food: 'Team lunch', software: 'SaaS subscription',
  equipment: 'Laptop accessories', training: 'Online course', other: 'Misc reimbursement',
}
const expRows = []
for (let i = 0; i < 48; i++) {
  const emp = pick(allEmployees)
  const category = pick(EXP_CATS)
  expRows.push({
    employee_id: emp.id,
    employee_name: emp.name,
    department: emp.department,
    category,
    amount: randInt(500, 45000),
    spent_on: iso(daysAgo(randInt(1, 60))),
    description: EXP_DESC[category],
    status: rand() < 0.35 ? 'pending' : pick(EXP_STATUS),
    created_at: iso(daysAgo(randInt(0, 55))),
  })
}
await bulk(
  'expenses',
  ['employee_id', 'employee_name', 'department', 'category', 'amount', 'spent_on', 'description', 'status', 'created_at'],
  expRows,
)
console.log(`Inserted ${expRows.length} expenses`)

// ---- payroll run + payslips (last month) ---------------------------------
const prev = daysAgo(30)
const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
const payslipRows = allEmployees.map((emp) => {
  const gross = Math.round(emp.netPay * 1.35)
  const deductions = gross - emp.netPay
  const reimb = rand() < 0.2 ? randInt(1000, 8000) : 0
  return {
    employee_id: emp.id,
    employee_name: emp.name,
    department: emp.department,
    period,
    gross,
    deductions,
    lop_days: rand() < 0.1 ? randInt(1, 3) : 0,
    reimbursements: reimb,
    net: emp.netPay + reimb,
    status: 'paid',
  }
})
const grossTotal = payslipRows.reduce((a, p) => a + p.gross, 0)
const dedTotal = payslipRows.reduce((a, p) => a + p.deductions, 0)
const reimbTotal = payslipRows.reduce((a, p) => a + p.reimbursements, 0)
const netTotal = payslipRows.reduce((a, p) => a + p.net, 0)
const runRows = await sql`
  INSERT INTO payroll_runs
    (period, status, employee_count, gross_total, deduction_total, reimbursement_total, net_total)
  VALUES (${period}, 'processed', ${payslipRows.length}, ${grossTotal}, ${dedTotal}, ${reimbTotal}, ${netTotal})
  RETURNING id`
const runId = runRows[0].id
for (const p of payslipRows) p.run_id = runId
await bulk(
  'payslips',
  ['run_id', 'employee_id', 'employee_name', 'department', 'period', 'gross', 'deductions', 'lop_days', 'reimbursements', 'net', 'status'],
  payslipRows,
)
console.log(`Inserted payroll run ${period} with ${payslipRows.length} payslips`)

// ---- onboardings + tasks + notes -----------------------------------------
const ONB_TASKS = [
  { task: 'Collect signed offer letter', category: 'docs' },
  { task: 'Verify KYC documents', category: 'docs' },
  { task: 'Provision laptop & accounts', category: 'it' },
  { task: 'Grant system access', category: 'it' },
  { task: 'Day-1 orientation session', category: 'orientation' },
  { task: 'Assign onboarding buddy', category: 'orientation' },
  { task: 'Complete POSH training', category: 'compliance' },
  { task: 'Sign code of conduct', category: 'compliance' },
]
const onbTaskRows = []
const onbNoteRows = []
for (let i = 0; i < 6; i++) {
  const dept = pick(DEPTS)
  const progress = randInt(20, 100)
  const rows = await sql`
    INSERT INTO onboardings (candidate_name, email, role, department, start_date, status, progress)
    VALUES (${`${pick([...FIRST_M, ...FIRST_F])} ${pick(LAST)}`},
            ${`newjoiner${i + 1}@quorq.ai`}, ${pick(dept.ics)}, ${dept.name},
            ${iso(daysAgo(-randInt(1, 21)))},
            ${progress === 100 ? 'completed' : 'in_progress'}, ${progress})
    RETURNING id`
  const onbId = rows[0].id
  ONB_TASKS.forEach((t, idx) =>
    onbTaskRows.push({
      onboarding_id: onbId,
      task: t.task,
      category: t.category,
      done: (idx / ONB_TASKS.length) * 100 < progress,
      sort_order: idx,
    }),
  )
  onbNoteRows.push({
    onboarding_id: onbId,
    note: 'Reached out to candidate with joining formalities.',
    done: rand() < 0.5,
    created_at: iso(daysAgo(randInt(1, 10))),
  })
}
await bulk(
  'onboarding_tasks',
  ['onboarding_id', 'task', 'category', 'done', 'sort_order'],
  onbTaskRows,
)
await bulk(
  'onboarding_notes',
  ['onboarding_id', 'note', 'done', 'created_at'],
  onbNoteRows,
)
console.log(`Inserted 6 onboardings with ${onbTaskRows.length} tasks`)

// ---- reference rows (reports hub, compliance) ----------------------------
await bulk(
  'compliance_items',
  ['label', 'value', 'tone', 'sort_order'],
  [
    { label: 'PF filings up to date', value: 'On track', tone: 'ok', sort_order: 1 },
    { label: 'ESI returns', value: '2 pending', tone: 'warn', sort_order: 2 },
    { label: 'TDS deposited', value: 'On track', tone: 'ok', sort_order: 3 },
    { label: 'POSH training', value: '88% done', tone: 'info', sort_order: 4 },
    { label: 'Labour law audit', value: 'Due in 12 days', tone: 'alert', sort_order: 5 },
  ],
)
await bulk(
  'statutory_reports',
  ['name', 'frequency', 'next_due', 'status', 'responsibility'],
  [
    { name: 'PF ECR', frequency: 'Monthly', next_due: iso(daysAgo(-8)), status: 'pending', responsibility: 'Finance' },
    { name: 'ESI Return', frequency: 'Monthly', next_due: iso(daysAgo(-12)), status: 'in_progress', responsibility: 'Finance' },
    { name: 'TDS Form 24Q', frequency: 'Quarterly', next_due: iso(daysAgo(-20)), status: 'pending', responsibility: 'Finance' },
    { name: 'Professional Tax', frequency: 'Monthly', next_due: iso(daysAgo(-5)), status: 'done', responsibility: 'HR' },
    { name: 'Labour Welfare Fund', frequency: 'Half-yearly', next_due: iso(daysAgo(-40)), status: 'pending', responsibility: 'HR' },
  ],
)
await bulk(
  'scheduled_reports',
  ['name', 'cadence', 'tone'],
  [
    { name: 'Weekly headcount summary', cadence: 'Every Monday 9:00', tone: 'ok' },
    { name: 'Monthly attrition report', cadence: '1st of month', tone: 'info' },
    { name: 'Payroll register', cadence: 'Monthly · 28th', tone: 'ok' },
    { name: 'Attendance exceptions', cadence: 'Daily 8:00', tone: 'warn' },
    { name: 'Leave balance snapshot', cadence: 'Every Friday', tone: 'ok' },
    { name: 'New joiners digest', cadence: 'Weekly', tone: 'info' },
  ],
)
await bulk(
  'prebuilt_reports',
  ['title', 'subtitle', 'category', 'formats', 'icon'],
  [
    { title: 'Headcount register', subtitle: 'Full employee master with department & role', category: 'HR', formats: 'PDF,Excel,CSV', icon: 'users' },
    { title: 'Payroll summary', subtitle: 'Gross, deductions and net by employee', category: 'Payroll', formats: 'PDF,Excel', icon: 'wallet' },
    { title: 'Attrition analysis', subtitle: 'Exits by department, reason and tenure', category: 'HR', formats: 'PDF,Excel', icon: 'trending-down' },
    { title: 'Leave register', subtitle: 'Approved and pending leave by type', category: 'HR', formats: 'Excel,CSV', icon: 'calendar' },
    { title: 'Recruitment funnel', subtitle: 'Openings, pipeline and source of hire', category: 'HR', formats: 'PDF', icon: 'filter' },
    { title: 'PF & ESI statement', subtitle: 'Statutory contributions for the period', category: 'Compliance', formats: 'PDF,Excel', icon: 'shield' },
    { title: 'Form 16 pack', subtitle: 'Annual tax statements for employees', category: 'Payroll', formats: 'PDF', icon: 'file' },
    { title: 'Attendance report', subtitle: 'Daily attendance and overtime rollup', category: 'HR', formats: 'Excel,CSV', icon: 'clock' },
  ],
)
console.log('Inserted reference rows (compliance, reports)')

// ---- link demo accounts to employees -------------------------------------
// master -> a department head, ops -> a manager, basic -> an individual contributor,
// so each demo login lands on a meaningful org context.
async function link(email, employee) {
  if (!employee) return
  await sql`UPDATE users SET employee_id = ${employee.id} WHERE email = ${email}`
}
await link('master@quorq.com', heads[0])
await link('ops@quorq.com', managersFlat[0])
await link('basic@quorq.com', icsFlat[0])
console.log('Linked demo accounts to employee records')

console.log('Seed complete.')
