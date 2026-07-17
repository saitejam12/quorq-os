# QuorqOS — pre-production test plan (whole app, all tiers)

**Date:** 2026-07-14
**Scope:** Environment-level acceptance testing of the entire QuorqOS HR portal on a
deployed pre-production Worker, across all three access tiers (`basic`, `ops`, `master`)
and every module. This validates the running system — real Cloudflare Worker, real Neon
database, real secrets, real SES email — not units (units run in CI via `vitest`).

The plan's backbone is the **tier access matrix** (who can see/do what). Every module
suite and cross-cutting suite hangs off it. Priorities: **P0** blocks release, **P1**
fix before general availability, **P2** confirm when possible.

---

## 1. Test environment

- **Pre-prod Worker.** Deploy a dedicated target (`wrangler deploy --env preprod`, its own
  `name` + `workers.dev` or a `preprod.` subdomain) so no test touches production.
- **Isolated database.** A dedicated Neon branch, schema applied (`node scripts/apply-schema.mjs`)
  and seeded (`node scripts/seed-people.mjs`, deterministic ~142 employees). Never point
  pre-prod at the prod DB.
- **Secrets / vars (pre-prod).** `AUTH_SECRET`, `DATABASE_URL`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY` via `wrangler secret put --env preprod`; `AWS_REGION`,
  `SES_FROM_EMAIL`, `APP_URL` (pointing at the pre-prod URL) in `[env.preprod]` `[vars]`.
- **Email.** Keep SES in the sandbox; use the SES mailbox simulator (`success@`, `bounce@`,
  `complaint@simulator.amazonses.com`) plus 2–3 verified real inboxes. Full email detail
  lives in [`superpowers/specs/2026-07-14-email-notifications-design.md`](superpowers/specs/2026-07-14-email-notifications-design.md#pre-production-test-plan)
  (suites A–G); this plan references it as module **M20** rather than duplicating it.
- **Observability.** `wrangler tail --env preprod` for live Worker logs, the SES sending
  dashboard, and read-only SQL against the Neon branch for state assertions.
- **Clients.** Test on desktop Chrome + one WebKit/Firefox, plus a mobile viewport (the
  sidebar collapses to a top bar under `lg`).

## 2. Test accounts & data

| Account | Tier | Purpose |
| --- | --- | --- |
| `basic@quorq.com` / `basic123` | basic | Baseline employee; lower bound of every access check |
| `ops@quorq.com` / `ops123` | ops | Manager tier; approvals, analytics, admin-lite |
| `master@quorq.com` / `master123` | master | Full access; approvals, holidays, monitoring |
| *(freshly signed-up)* | pending | Exercises signup → approval → login lifecycle |
| *(a second basic)* | basic | Target for tier changes, leave/expense approvals, org edits |

Seed data supplies employees, org tree, attendance, leave, payroll, hiring, onboarding,
and holidays so every read screen has content on first load.

## 3. Tier access tracker (backbone — P0)

The fillable execution record for RBAC. Run it **one tier at a time** — log in as the
tier, walk every row — because that mirrors how a session actually behaves. Each row is
verified at **three layers**, not one:

1. **Nav** — the sidebar leaf shows only at/above `minTier` (`SidebarNav` filters on
   `hasTier`). Visible for ✅/✅*, absent for ⛔.
2. **URL** — deep-linking the route: loads for ✅/✅*, redirects to `/?denied=1` for ⛔
   (`requireTier` in `beforeLoad`).
3. **RPC** — invoke the underlying server fn **directly** (devtools / `curl`, bypassing the
   hidden UI): succeeds for ✅, rejects the noted sub-action for ✅*, returns `FORBIDDEN` for
   ⛔. CLAUDE.md is explicit that UI hiding is convenience and the server check is the real
   boundary, so **every ⛔ and every ✅* limit must be proven here**, not just visually.

**How to fill:** replace each `☐` with `P` (pass), `F` (fail — file a defect id in Notes),
`B` (blocked — couldn't execute), or `—` (N/A). `Status` is the row verdict.
`Exp.` legend: ✅ full · ✅* limited (see Probe) · ⛔ blocked.

### 3a. Session — `basic@quorq.com`

Tester: ________  ·  Date: ________  ·  Build/commit: ________

| Screen / route | Exp. | Probe (RPC / limit) | Nav | URL | RPC | Status | Notes |
| --- | :---: | --- | :---: | :---: | :---: | :---: | --- |
| Home `/` | ✅ | employee dashboard loads | ☐ | ☐ | — | ☐ | |
| My Profile `/profile` | ✅ | own KYC masked; `submitProfileChangeRequest` ok; Aadhaar/PAN not requestable | ☐ | ☐ | ☐ | ☐ | |
| Directory `/directory` (+`/$id`) | ✅ | list+pagination view; **`updateEmployeeOrg` must reject** (ops+) | ☐ | ☐ | ☐ | ☐ | |
| Engagement `/engagement` | ✅ | `createRecognition` posts | ☐ | ☐ | ☐ | ☐ | |
| Org `/org` | ✅ | tree renders | ☐ | ☐ | — | ☐ | |
| Time `/time` | ✅* | `clockIn`/`clockOut` own ok; **`editTimeEntry` must reject** | ☐ | ☐ | ☐ | ☐ | |
| Leave `/leave` | ✅* | `applyLeave` ok; **`decideLeave` must reject** | ☐ | ☐ | ☐ | ☐ | |
| Expenses `/expenses` | ✅* | `submitExpense` ok; **`decideExpense` must reject**; not in NAV (URL only) | ☐ | ☐ | ☐ | ☐ | |
| Help `/help` | ✅ | loads | ☐ | ☐ | — | ☐ | |
| Applications `/hiring` | ⛔ | `getHiring`/`moveApplication`/`declineApplication` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Job Postings `/postings` | ⛔ | `getPostings`/`createPosting` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Onboarding `/onboarding` | ⛔ | `getOnboarding` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Payroll `/payroll` | ⛔ | `getPayroll` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Executive `/overview` | ⛔ | `getExecutive` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Workforce `/workforce` | ⛔ | `getWorkforce` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Talent `/talent` | ⛔ | `getTalent` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attendance `/attendance` | ⛔ | `getAttendance` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attrition `/attrition` | ⛔ | `getAttrition` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Reports `/reports` | ⛔ | `getReports`/`exportCsv` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Import & Export `/import-export` | ⛔ | import/export fns → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Alerts `/alerts` | ⛔ | route denied | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Management `/admin/users` | ⛔ | `listUsers`/`setUserTier` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Admin · Profile Change Requests `/admin/profile-requests` | ⛔ | `listProfileChangeRequests`/approve/reject → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Requests `/admin/requests` | ⛔ | `approveUser`/`rejectUser` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Admin · Holiday Calendar `/calendar` | ⛔ | `addHoliday` → FORBIDDEN (upcoming-holidays card may still show) | ☐ | ☐ | ☐ | ☐ | |
| Admin · Monitoring `/monitoring` | ⛔ | `getHealth`/stats → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |

Session result: ____ pass · ____ fail · ____ blocked

### 3b. Session — `ops@quorq.com`

Tester: ________  ·  Date: ________  ·  Build/commit: ________

| Screen / route | Exp. | Probe (RPC / limit) | Nav | URL | RPC | Status | Notes |
| --- | :---: | --- | :---: | :---: | :---: | :---: | --- |
| Home `/` | ✅ | ops dashboard loads | ☐ | ☐ | — | ☐ | |
| My Profile `/profile` | ✅ | own profile; change request ok | ☐ | ☐ | ☐ | ☐ | |
| Directory `/directory` (+`/$id`) | ✅* | `updateEmployeeOrg` ok; **setting/from `master` and changing own tier must reject** (`canSetTier`) | ☐ | ☐ | ☐ | ☐ | |
| Engagement `/engagement` | ✅ | `createRecognition` | ☐ | ☐ | ☐ | ☐ | |
| Org `/org` | ✅ | tree renders | ☐ | ☐ | — | ☐ | |
| Time `/time` | ✅ | `editTimeEntry` ok | ☐ | ☐ | ☐ | ☐ | |
| Leave `/leave` | ✅ | `decideLeave` approve/reject | ☐ | ☐ | ☐ | ☐ | |
| Expenses `/expenses` | ✅ | `decideExpense` approve/reject | ☐ | ☐ | ☐ | ☐ | |
| Help `/help` | ✅ | loads | ☐ | ☐ | — | ☐ | |
| Applications `/hiring` | ✅ | `moveApplication`/`declineApplication` | ☐ | ☐ | ☐ | ☐ | |
| Job Postings `/postings` | ✅ | create/deactivate + template CRUD | ☐ | ☐ | ☐ | ☐ | |
| Onboarding `/onboarding` | ✅ | journey + task/note CRUD; progress ring | ☐ | ☐ | ☐ | ☐ | |
| Payroll `/payroll` | ✅ | salary components (atomic) / adjustment / `runPayroll` | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Executive `/overview` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Workforce `/workforce` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Talent `/talent` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attendance `/attendance` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attrition `/attrition` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Reports `/reports` | ✅ | `getReports`/`exportCsv` download | ☐ | ☐ | ☐ | ☐ | |
| Import & Export `/import-export` | ✅ | import/export round-trip | ☐ | ☐ | ☐ | ☐ | |
| Alerts `/alerts` | ✅ | loads / actions persist | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Management `/admin/users` | ✅* | `setUserTier` basic↔ops ok; **master or self must reject**; `getUserStats` (master-only) must reject | ☐ | ☐ | ☐ | ☐ | |
| Admin · Profile Change Requests `/admin/profile-requests` | ✅ | approve applies change; reject leaves unchanged | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Requests `/admin/requests` | ⛔ | `approveUser`/`rejectUser` → FORBIDDEN (master-only) | ☐ | ☐ | ☐ | ☐ | |
| Admin · Holiday Calendar `/calendar` | ⛔ | `addHoliday` → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |
| Admin · Monitoring `/monitoring` | ⛔ | `getHealth`/stats → FORBIDDEN | ☐ | ☐ | ☐ | ☐ | |

Session result: ____ pass · ____ fail · ____ blocked

### 3c. Session — `master@quorq.com`

Tester: ________  ·  Date: ________  ·  Build/commit: ________

Every row is ✅: the page loads and every listed action succeeds. The Probe column names
the highest-privilege action to confirm.

| Screen / route | Exp. | Probe (RPC) | Nav | URL | RPC | Status | Notes |
| --- | :---: | --- | :---: | :---: | :---: | :---: | --- |
| Home `/` | ✅ | master dashboard loads | ☐ | ☐ | — | ☐ | |
| My Profile `/profile` | ✅ | own profile | ☐ | ☐ | ☐ | ☐ | |
| Directory `/directory` (+`/$id`) | ✅ | `updateEmployeeOrg` incl. grant/revoke `master` (not self) | ☐ | ☐ | ☐ | ☐ | |
| Engagement `/engagement` | ✅ | `createRecognition` | ☐ | ☐ | ☐ | ☐ | |
| Org `/org` | ✅ | tree renders | ☐ | ☐ | — | ☐ | |
| Time `/time` | ✅ | `editTimeEntry` | ☐ | ☐ | ☐ | ☐ | |
| Leave `/leave` | ✅ | `decideLeave` | ☐ | ☐ | ☐ | ☐ | |
| Expenses `/expenses` | ✅ | `decideExpense` | ☐ | ☐ | ☐ | ☐ | |
| Help `/help` | ✅ | loads | ☐ | ☐ | — | ☐ | |
| Applications `/hiring` | ✅ | move/decline | ☐ | ☐ | ☐ | ☐ | |
| Job Postings `/postings` | ✅ | posting + template CRUD | ☐ | ☐ | ☐ | ☐ | |
| Onboarding `/onboarding` | ✅ | journey + task/note CRUD | ☐ | ☐ | ☐ | ☐ | |
| Payroll `/payroll` | ✅ | components / adjustment / `runPayroll` | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Executive `/overview` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Workforce `/workforce` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Talent `/talent` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attendance `/attendance` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Attrition `/attrition` | ✅ | dashboard renders | ☐ | ☐ | ☐ | ☐ | |
| Analytics · Reports `/reports` | ✅ | `getReports`/`exportCsv` | ☐ | ☐ | ☐ | ☐ | |
| Import & Export `/import-export` | ✅ | import/export round-trip | ☐ | ☐ | ☐ | ☐ | |
| Alerts `/alerts` | ✅ | loads / actions persist | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Management `/admin/users` | ✅ | `setUserTier` any incl. `master` (not self); `getUserStats` ok | ☐ | ☐ | ☐ | ☐ | |
| Admin · Profile Change Requests `/admin/profile-requests` | ✅ | approve/reject | ☐ | ☐ | ☐ | ☐ | |
| Admin · User Requests `/admin/requests` | ✅ | `approveUser`→active+email; `rejectUser`→declined+email (M20) | ☐ | ☐ | ☐ | ☐ | |
| Admin · Holiday Calendar `/calendar` | ✅ | `addHoliday`/update/delete + auto-leave reconcile | ☐ | ☐ | ☐ | ☐ | |
| Admin · Monitoring `/monitoring` | ✅ | `getHealth`/stats render | ☐ | ☐ | ☐ | ☐ | |

Session result: ____ pass · ____ fail · ____ blocked

> `/settings` is in the route-path union but its route file was deleted (the 2 known
> `tsc` errors). Confirm it 404s / is unreachable in all three sessions; it must not
> appear in nav.

---

## 4. Cross-cutting suites

### X1 — Authentication & session lifecycle (P0)

| ID | Case | Expected |
| --- | --- | --- |
| X1.1 | Signup new user | Creates `pending`; master gets the notification email (M20/C1) |
| X1.2 | Login while `pending` | Rejected with "awaiting approval" |
| X1.3 | Login while `rejected` | Rejected with "signup request was declined" |
| X1.4 | Login active, correct creds | Session cookie set `httpOnly`, `secure`, `sameSite=lax`, `path=/`; lands on `/` |
| X1.5 | Login wrong password / unknown email | "Invalid email or password" (identical message — no enumeration) |
| X1.6 | Logout | Cookie cleared; `/` redirects to `/login` |
| X1.7 | Anonymous hits any `_app` route | Redirect to `/login` |
| X1.8 | Token expiry (24h TTL) | Expired/forged token → treated as anonymous, redirect to `/login`, no crash |
| X1.9 | Missing `AUTH_SECRET`/`DATABASE_URL` | App still reaches login; auth actions return the actionable CONFIG_ERROR, not a generic 500 (`getAuthDiagnostics` booleans reflect which is missing) |
| X1.10 | Password reset end-to-end | Covered by M20 suite B |

### X2 — RBAC enforcement (P0, security-critical)

| ID | Case | Expected |
| --- | --- | --- |
| X2.1 | Every ⛔ in §3, at the **server-fn layer** | Lower-tier RPC call rejected (`FORBIDDEN` / redirect), not just UI-hidden |
| X2.2 | Guard redirect | Lower tier deep-linking a gated URL → `/?denied=1` |
| X2.3 | Stale-token de-escalation | User logged in as ops; master downgrades them to basic; the still-valid 24h token loses ops powers on the **next** privileged call (server re-reads tier from DB via `getCaller`/`getSessionUser`) |
| X2.4 | `setUserTier` rules | ops cannot grant/revoke `master`; nobody can change their own tier (`canSetTier`) |
| X2.5 | Signup approval is master-only | ops calling `approveUser`/`rejectUser` → `FORBIDDEN` even though ops sees User Management |
| X2.6 | Deactivated/rejected user with a live token | `getCaller` rejects (status must be `active`) |

### X3 — Dates / UTC correctness (P1)

| ID | Case | Expected |
| --- | --- | --- |
| X3.1 | Timestamps render in local time | Clock, attendance, leave, holidays show sensible local times, no off-by-one day |
| X3.2 | No `DATE`-object leakage | No `"Mon Jan 26"`-style strings anywhere (the neon `Date.toString()` gotcha); date-keyed comparisons correct across a tz boundary |
| X3.3 | Holiday on a date boundary | A holiday added for date D shows on D in every tier's calendar/upcoming card |

### X4 — Error handling & resilience (P0)

| ID | Case | Expected |
| --- | --- | --- |
| X4.1 | `Result<T>` shape | Mutations return `{ok:false,error}` for expected failures; only unexpected errors are `console.error`'d |
| X4.2 | Attendance reconcile failure | `reconcileAttendance` throwing in `_app` `beforeLoad` never blocks app access (caught + logged) |
| X4.3 | No secret leakage | AWS keys / `AUTH_SECRET` / `DATABASE_URL` values never appear in logs or responses |
| X4.4 | Invalid input to any mutation | Zod validator rejects cleanly; no 500 |

### X5 — Data integrity (P1)

| ID | Case | Expected |
| --- | --- | --- |
| X5.1 | `updateSalaryComponents` atomicity | Runs in a single `sql.transaction`; a mid-update failure leaves no partial salary rows |
| X5.2 | Concurrent clock in/out | Multi-session time entries stay consistent; no overlapping open sessions corrupt state |
| X5.3 | One-time actions | Approve/reject/decide on an already-handled item returns "already handled", not a double state change |

---

## 5. Module functional suites

Each row is a user action (a server fn) with the tier that may perform it and the key
assertion. Run each as the **lowest allowed tier** and confirm the **tier just below is
blocked** at the RPC layer (ties back to X2.1).

### M1 — Home / dashboards (`/`)  ·  basic+
- Dashboard loads per tier; basic sees the employee view, ops/master see richer widgets.
- `denied=1` banner shows when redirected by a guard. No console errors.

### M2 — My Profile (`/profile`)  ·  basic+  — `getMyProfile`, profile-requests
- Loads own employee/personal/KYC details. **Aadhaar/PAN masked** (M18/security).
- `submitProfileChangeRequest` on an allow-listed field → pending; `getMyProfileChangeRequest`
  shows status. Aadhaar/PAN are **not** in the allow-list — confirm they can't be requested.

### M3 — Directory (`/directory`, `/directory/$id`)  ·  basic+  — `listEmployees(Paginated)`, `getEmployee`, `updateEmployeeOrg`
- List loads; **pagination** works (page size, next/prev, total). Search/filter if present.
- Detail page renders; missing id → graceful not-found.
- `updateEmployeeOrg` (manager/department change) — confirm intended editor tier and that
  lower tiers are blocked at the RPC.

### M4 — Engagement (`/engagement`)  ·  basic+  — `getEngagement`, `createRecognition`
- Recognitions / announcements / survey data render. `createRecognition` posts and appears.

### M5 — Org (`/org`)  ·  basic+  — `getOrg`
- Org tree renders from `manager_id`; no cycle/orphan crash; matches seeded reporting lines.

### M6 — Time tracking (`/time`)  ·  basic+ / edit ops+  — `getMyClock`, `clockIn`, `clockOut`, `editTimeEntry`, `getTimeTracking`
- basic: clock in → open session; clock out → closed; **multiple sessions/day** supported;
  times shown local (X3).
- ops+: `editTimeEntry` adjusts an entry; basic calling it → blocked.

### M7 — Leave (`/leave`)  ·  apply basic+ / decide ops+  — `getLeave`, `applyLeave`, `decideLeave`
- basic: `applyLeave` → pending; sees own balance/history.
- ops+: `decideLeave` approve/reject updates status; basic calling `decideLeave` → blocked.
- Interaction with auto-leave reconcile (M12) is consistent.

### M8 — Expenses (`/expenses`)  ·  submit basic+ / decide ops+  — `getExpenses`, `submitExpense`, `decideExpense`
- basic: `submitExpense` → pending. ops+: `decideExpense`. basic calling decide → blocked.
- **Route not in sidebar NAV** — verify whether it's intentionally reachable only by URL
  (flag as a finding if it should be surfaced or removed).

### M9 — Hiring / Applications (`/hiring`)  ·  ops+  — `getHiring`, `moveApplication`, `declineApplication`
- Funnel + candidate drawer render; `moveApplication` advances stage; `declineApplication`
  declines. basic blocked at guard and RPC.

### M10 — Job Postings (`/postings`)  ·  ops+  — `getPostings`, `createPosting`, `deactivatePosting`, template CRUD
- Create posting → appears; deactivate → hidden from active/careers. Template create/update/delete.

### M11 — Onboarding (`/onboarding`)  ·  ops+  — `getOnboarding`, `createOnboarding`, `updateOnboarding`, task + note CRUD, toggles
- Create a journey; add/toggle/delete custom checklist tasks; add/toggle/delete notes;
  progress ring reflects completion. basic blocked.

### M12 — Holiday calendar & auto-leave (`/calendar`)  ·  master  — `getHolidays`, `getUpcomingHolidays`, `addHoliday`, `updateHoliday`, `deleteHoliday`
- master: add/update/delete a holiday; upcoming-holidays card (visible to all tiers) updates.
- **Daily auto-leave reconcile**: with a holiday/missed day seeded, first load of the day
  converts missed working days to leave exactly once; re-load same day is a cheap no-op.
- ops/basic blocked from holiday mutations at the RPC.

### M13 — Payroll (`/payroll`)  ·  ops+  — `getPayroll`, `getEmployeePayroll`, `updateSalaryComponents`, `addAdjustment`, `deleteAdjustment`, `runPayroll`
- Payroll summary + per-employee detail load. `updateSalaryComponents` atomic (X5.1).
- Add/delete adjustment reflected in totals. `runPayroll` produces a run with correct
  aggregates. basic blocked.

### M14 — Analytics (`/overview` `/workforce` `/talent` `/attendance` `/attrition` `/reports`)  ·  ops+  — `getExecutive`, `getWorkforce`, `getTalent`, `getAttendance`, `getAttrition`, `getReports`, `exportCsv`
- Each dashboard renders charts with seeded data, no NaN/empty-state crash.
- `exportCsv` downloads a well-formed CSV. basic blocked from all six + exports.

### M15 — Import & Export (`/import-export`)  ·  ops+  — `importEmployeesFromCSV`, `importAttendanceFromCSV`, `exportEmployees`, `exportAttendance`
- Export round-trips (export → re-import). Malformed CSV → validation errors, no partial
  corruption. Round-trip employee/attendance data matches. basic blocked.

### M16 — Alerts & Notifications (`/alerts`)  ·  ops+
- Page renders configured alerts; any toggles/actions persist. basic blocked.

### M17 — Administration
- **User Management `/admin/users`** · ops+ — `listUsers`, `setUserTier`, `getUserStats(master)`:
  list all users; ops sets basic↔ops (not master, not self); master sets any (X2.4).
- **Profile Change Requests `/admin/profile-requests`** · ops+ — `listProfileChangeRequests`,
  `approveProfileChangeRequest`, `rejectProfileChangeRequest`: approve applies the change to
  the employee record; reject leaves it unchanged.
- **User Requests `/admin/requests`** · **master** — `approveUser`, `rejectUser`: approve →
  user active + approval email (M20/C4); reject → declined email (M20/C5); already-handled →
  "already handled". ops blocked (X2.5).
- **Monitoring `/monitoring`** · master — `getHealth` and any system stats render; ops/basic blocked.

### M18 — Health (`getHealth`)  ·  as wired
- Returns DB/connectivity status without leaking secrets.

### M19 — Attendance reconcile (`reconcileAttendance`)  ·  system
- Covered by M12 + X4.2: idempotent per day, never blocks app load.

### M20 — Email notifications  ·  system
- Full suites A–G in the email spec: SES/SigV4 live, reset e2e, signup fan-out,
  best-effort resilience, deliverability, security, regression. All P0 there are P0 here.

---

## 6. Non-functional suites

### N1 — Performance (P1)
- Worker cold-start acceptable; `/` and the heaviest analytics dashboard load within target.
- Directory pagination keeps large lists responsive (no full-table fetch to the client).

### N2 — Security (P0)
- **KYC masking**: Aadhaar/PAN masked in UI and never returned unmasked to a non-owner.
- **Cookies**: session cookie `httpOnly` + `secure` + `sameSite=lax` (X1.4).
- **Injection**: all queries use the parameterized neon tagged template; probe a few inputs
  (quotes, `;`, `--`) → treated as data, no error.
- **No enumeration**: login (X1.5) and reset-request (M20/B2) don't reveal account existence.
- **Secret hygiene**: no secret values in logs/responses (X4.3).

### N3 — Deliverability (P0) — see M20 suite E
- SPF/DKIM/DMARC pass; inbox-not-spam; links point at pre-prod `APP_URL`.

### N4 — Accessibility & responsive (P2)
- Keyboard nav through sidebar + forms; `aria-expanded` on collapsible nav/menus correct.
- Mobile viewport: sidebar collapses to top bar, menu opens/closes, all tiers navigable.

### N5 — Data isolation (P0)
- Confirm pre-prod uses the Neon **branch**, not prod; no test write lands in prod.

---

## 7. Regression & release gate

### Automated (must be green before manual sign-off)
- `./node_modules/.bin/vitest run` — all unit suites pass.
- `./node_modules/.bin/tsc --noEmit` — clean except the 2 known `/settings` errors.
- `./node_modules/.bin/eslint` — clean.
- `./node_modules/.bin/tsr generate` committed (route tree current, incl. `/reset-password`).

### Smoke checklist (fast per-tier pass)
Log in as each of basic / ops / master and, for each: sidebar shows exactly the allowed
groups; open every visible page (no console error, no empty crash); perform one write in
each writable module; confirm one ⛔ page redirects to `/?denied=1`.

### Exit criteria (gate to production)
1. **Every P0 across §3–§6 passes.** No open P1 without a written, accepted follow-up.
2. Tier access matrix (§3) proven at all three layers — nav, guard, **and RPC** — for
   every row.
3. Auth lifecycle (X1) and RBAC de-escalation (X2.3) proven.
4. Best-effort email contract proven (M20 suite D) — email failure never blocks a DB action.
5. No secret leakage (X4.3/N2), no account enumeration (X1.5/M20 B2).
6. Automated suite green; smoke checklist passes for all three tiers.
7. Data isolation confirmed (N5).
8. **Then**, as the deliberate final step, request SES production access before pointing
   prod at live email.

### Sign-off matrix
Record pass/fail per **tier × module** (basic/ops/master × M1–M20) plus each cross-cutting
suite (X1–X5) and non-functional suite (N1–N5). Release requires no open P0.

---

## Known gaps / findings to track
- No rate limiting on `requestPasswordReset` (out of scope for the email slice; track as
  a follow-up).
- `/expenses` route exists but is absent from the sidebar NAV — decide surface vs remove.
- `/settings` remains in the route-path union with no route file (the 2 known `tsc`
  errors) — confirm unreachable.
