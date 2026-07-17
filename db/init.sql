-- Demo to-do list (pre-existing demo data, unrelated to the HR portal)
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO todos (title, description, is_completed)
SELECT title, description, is_completed
FROM (
    VALUES
        ('Buy groceries', 'Milk, Bread, Eggs, and Butter', FALSE),
        ('Read a book', 'Finish reading "The Great Gatsby"', FALSE),
        ('Workout', 'Go for a 30-minute run', FALSE)
) AS seed(title, description, is_completed)
WHERE NOT EXISTS (SELECT 1 FROM todos);

-- Users: three hierarchical access tiers, signup-approval workflow
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    tier VARCHAR(10) NOT NULL DEFAULT 'basic'
        CHECK (tier IN ('basic', 'ops', 'master')),
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Demo accounts: basic123 / ops123 / master123
INSERT INTO users (email, name, password_hash, tier, status) VALUES
    ('basic@quorq.com', 'Basic Demo', 'w/OWK4sDOuT+gZbxcWVpiw==:100000:HLEIDJzcmAIJuR5C0PF7mss3hH1BowqDvtYmo7b+LVQ=', 'basic', 'active'),
    ('ops@quorq.com', 'Ops Demo', 'H+Djk0VF6I7uAl8jBCUDJQ==:100000:7I1Lmx6YBzO2vU+MksqgoqhhV4CJ1gxYvoLlgdGJXUg=', 'ops', 'active'),
    ('master@quorq.com', 'Master Demo', 'OPAs0Jo0d0gYo+P2xu4qlA==:100000:BbBSZlY+Z9Oyc5DYVgvD3hbyxrCizXqxhxqg3QQGpC8=', 'master', 'active')
ON CONFLICT (email) DO NOTHING;

-- People: HR employee records (the population the directory and org tree describe).
-- Columns mirror the reference schema in full so later sub-projects (payroll,
-- attrition, leave) reuse this table without a migration. manager_id is a plain
-- column, not an FK, so the seed can wire the reporting tree after all rows exist.
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    department VARCHAR(64) NOT NULL,
    designation VARCHAR(120) NOT NULL,
    employment_type VARCHAR(24) NOT NULL DEFAULT 'full-time',
    location VARCHAR(64) NOT NULL DEFAULT 'Hyderabad',
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    gender VARCHAR(16) NOT NULL DEFAULT 'male',
    date_of_joining DATE NOT NULL,
    ctc NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    performance_rating NUMERIC(3,1) NOT NULL DEFAULT 3.0,
    is_top_performer BOOLEAN NOT NULL DEFAULT FALSE,
    last_appraisal_date DATE,
    flight_risk VARCHAR(16) NOT NULL DEFAULT 'none',
    appraisal_overdue BOOLEAN NOT NULL DEFAULT FALSE,
    policy_unsigned BOOLEAN NOT NULL DEFAULT FALSE,
    kyc_missing BOOLEAN NOT NULL DEFAULT FALSE,
    leave_balance NUMERIC(4,1) NOT NULL DEFAULT 15,
    manager_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link an auth account to its employee record (nullable: not every employee logs in).
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id);

-- Peer-to-peer recognition (kudos).
CREATE TABLE IF NOT EXISTS recognitions (
    id SERIAL PRIMARY KEY,
    from_name VARCHAR(120) NOT NULL,
    to_employee_id INTEGER REFERENCES employees(id),
    to_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    value VARCHAR(24) NOT NULL DEFAULT 'teamwork',
    message VARCHAR(400) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Company-wide announcements.
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(600) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'general',
    author VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- eNPS pulse survey responses (0-10 score).
CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id),
    department VARCHAR(64) NOT NULL,
    score INTEGER NOT NULL,
    comment VARCHAR(400),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Profile: employee code + self-service personal details. All nullable — only
-- name and email are required on an employee.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_code VARCHAR(24);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_address VARCHAR(400);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address VARCHAR(400);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(24);

-- KYC: sensitive identity/bank data kept in its own table so peer-facing
-- employee queries (SELECT * FROM employees) physically cannot expose it.
CREATE TABLE IF NOT EXISTS employee_kyc (
    employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
    bank_name VARCHAR(120),
    bank_account_number VARCHAR(40),
    bank_ifsc VARCHAR(20),
    aadhaar_number VARCHAR(20),
    pan_number VARCHAR(15),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================================
-- Workplace, analytics, hiring & payroll tables (ported from storeapp)
-- ==========================================================================

-- Attendance: one row per employee per day.
CREATE TABLE IF NOT EXISTS attendance_records (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    department VARCHAR(64) NOT NULL,
    day DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'present',
    late BOOLEAN NOT NULL DEFAULT FALSE,
    early_exit BOOLEAN NOT NULL DEFAULT FALSE,
    overtime_hours NUMERIC(4,1) NOT NULL DEFAULT 0
);

-- Leave requests / applications.
CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    type VARCHAR(24) NOT NULL,
    days NUMERIC(4,1) NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,
    reason VARCHAR(300),
    status VARCHAR(16) NOT NULL DEFAULT 'approved',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Exits (for attrition analytics).
CREATE TABLE IF NOT EXISTS exits (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    exit_date DATE NOT NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'voluntary',
    reason VARCHAR(24) NOT NULL,
    regrettable BOOLEAN NOT NULL DEFAULT FALSE,
    tenure_bucket VARCHAR(16) NOT NULL,
    notice_period_days INTEGER NOT NULL DEFAULT 30,
    counter_offer_accepted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Open roles.
CREATE TABLE IF NOT EXISTS job_openings (
    id SERIAL PRIMARY KEY,
    role VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'in_progress',
    opened_date DATE NOT NULL,
    days_open INTEGER NOT NULL DEFAULT 0,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    category VARCHAR(24) NOT NULL DEFAULT 'others'
);

-- Careers-facing posting fields on job_openings. A published, active row is what
-- an external careers site (separate repo/API) pulls:
--   SELECT ... FROM job_openings WHERE published AND posting_status = 'active'
-- The existing status column stays as the urgency badge, while posting_status is
-- the separate active/closed lifecycle.
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS location VARCHAR(64) NOT NULL DEFAULT 'Hyderabad';
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS employment_type VARCHAR(24) NOT NULL DEFAULT 'full-time';
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS template_id INTEGER;
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS posting_status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR(48);
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;

-- Job-description templates offered in the "+ New opening" popup.
CREATE TABLE IF NOT EXISTS jd_templates (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'others',
    summary VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Candidate applications (recruitment funnel).
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES job_openings(id),
    candidate_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    stage VARCHAR(16) NOT NULL DEFAULT 'applied',
    source VARCHAR(16) NOT NULL DEFAULT 'linkedin',
    gender VARCHAR(16) NOT NULL DEFAULT 'male',
    decline_reason VARCHAR(24),
    applied_date DATE NOT NULL
);

-- Compliance snapshot rows (exec overview).
CREATE TABLE IF NOT EXISTS compliance_items (
    id SERIAL PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    kind VARCHAR(16) NOT NULL DEFAULT 'count',
    value VARCHAR(64) NOT NULL,
    tone VARCHAR(16) NOT NULL DEFAULT 'info',
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Statutory report register (reports hub).
CREATE TABLE IF NOT EXISTS statutory_reports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    frequency VARCHAR(24) NOT NULL,
    next_due DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    responsibility VARCHAR(64) NOT NULL
);

-- Scheduled report definitions.
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    cadence VARCHAR(32) NOT NULL,
    tone VARCHAR(16) NOT NULL DEFAULT 'ok'
);

-- Pre-built report catalogue.
CREATE TABLE IF NOT EXISTS prebuilt_reports (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    subtitle VARCHAR(200) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'HR',
    formats VARCHAR(64) NOT NULL DEFAULT 'PDF,Excel',
    icon VARCHAR(32) NOT NULL DEFAULT 'file'
);

-- Time tracking (clock in/out). Timestamps are stored as timestamptz so they are
-- absolute UTC instants, rendered by the UI in the viewer's local timezone.
CREATE TABLE IF NOT EXISTS time_entries (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    day DATE NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    hours_worked NUMERIC(4,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
);
-- Convert pre-existing (naive TIMESTAMP) columns to timestamptz. Written as
-- single statements with no DO block so apply-schema comma splitting stays safe,
-- and a no-op once the column is already timestamptz. Neon session tz is UTC, so
-- the cast treats the existing values as UTC.
ALTER TABLE time_entries ALTER COLUMN clock_in TYPE timestamptz USING clock_in::timestamptz;
ALTER TABLE time_entries ALTER COLUMN clock_out TYPE timestamptz USING clock_out::timestamptz;

-- Expense claims / reimbursements.
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'other',
    amount NUMERIC(10,2) NOT NULL,
    spent_on DATE NOT NULL,
    description VARCHAR(300) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payroll runs (monthly).
CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY,
    period VARCHAR(7) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL DEFAULT 'processed',
    employee_count INTEGER NOT NULL DEFAULT 0,
    gross_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    deduction_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    reimbursement_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Individual payslips per run.
CREATE TABLE IF NOT EXISTS payslips (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES payroll_runs(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    period VARCHAR(7) NOT NULL,
    gross NUMERIC(12,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    lop_days NUMERIC(4,1) NOT NULL DEFAULT 0,
    reimbursements NUMERIC(12,2) NOT NULL DEFAULT 0,
    net NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'paid'
);

-- Per-employee monthly salary structure. Amounts are monthly. Invariant:
-- sum(earning) equals ctc/12 and sum(earning) minus sum(deduction) equals net_pay.
CREATE TABLE IF NOT EXISTS salary_components (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    kind VARCHAR(12) NOT NULL DEFAULT 'earning',
    code VARCHAR(24) NOT NULL,
    label VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- One-off pay adjustments applied to a period's payslip. amount is stored
-- positive, the sign is implied by kind (bonus and reimbursement add, deduction
-- and lop subtract). A null period means the adjustment applies to the next run.
CREATE TABLE IF NOT EXISTS pay_adjustments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    period VARCHAR(7),
    kind VARCHAR(16) NOT NULL DEFAULT 'bonus',
    label VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    note VARCHAR(300),
    created_by VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Onboarding pipelines.
CREATE TABLE IF NOT EXISTS onboardings (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id),
    candidate_name VARCHAR(120) NOT NULL,
    email VARCHAR(160),
    role VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'in_progress',
    progress INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Onboarding checklist tasks.
CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id SERIAL PRIMARY KEY,
    onboarding_id INTEGER NOT NULL REFERENCES onboardings(id),
    task VARCHAR(160) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'docs',
    done BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Onboarding notes.
CREATE TABLE IF NOT EXISTS onboarding_notes (
    id SERIAL PRIMARY KEY,
    onboarding_id INTEGER NOT NULL REFERENCES onboardings(id),
    note TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================================
-- Holiday calendar + attendance reconciliation
-- ==========================================================================

-- Company-wide public holidays, maintained by master on /calendar. A holiday
-- date is a non-working day for auto-leave reconciliation, and upcoming ones
-- surface on the landing page.
CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Generic key/value store for app singletons. First use: the reconciliation
-- marker app_settings('attendance_last_reconciled') holding the last fully
-- processed working-day boundary as an ISO date string.
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Distinguish auto-generated leave rows (source='auto', type auto-leave or
-- loss-of-pay) from manually-created ones.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual';

-- Employee-initiated profile change requests, approved by ops+. `changes` holds
-- only the fields the employee changed as JSON. Aadhaar and PAN are never
-- requestable, so they never appear here.
CREATE TABLE IF NOT EXISTS profile_change_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    changes JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    review_reason VARCHAR(300),
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(120)
);

-- Password reset tokens. Only the SHA-256 hash is stored (plaintext lives only in
-- the emailed link), single-use, short-lived. No semicolons in this comment block.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens (token_hash);
