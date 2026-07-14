# QuorqOS documentation index

Start with [`/CLAUDE.md`](../CLAUDE.md) for the architecture, commands, and
gotchas. This folder holds deeper, per-topic detail. Open a spec only when you're
working on that feature — each is the authoritative record of what was built and
why.

## Reference

- [`architecture.md`](architecture.md) — **foundation only (2026-07-07)**: auth,
  JWT, PBKDF2, the tier model, guards. The auth/tiers/jwt/password sections are
  still accurate; the routing/nav/module/test-count sections are historical and
  superseded by CLAUDE.md and the feature specs below.
- [`deployment-auth-troubleshooting.md`](deployment-auth-troubleshooting.md) — why
  deployed login broke (prod Worker missing `AUTH_SECRET`/`DATABASE_URL`) and the
  `wrangler secret put` fix.
- [`preprod-test-plan.md`](preprod-test-plan.md) — whole-app pre-production acceptance
  test plan across all three tiers: tier access matrix, per-module suites, cross-cutting
  auth/RBAC/security suites, and the release gate.

## Feature specs (`superpowers/specs/`)

Each feature followed a spec → plan → implementation cycle. Read the spec for the
area you're touching:

| Spec                                                          | Feature                                                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-07-rbac-foundation-design.md`                        | Auth + RBAC foundation: JWT sessions, 3 tiers, signup→approval, guards.                                                                                  |
| `2026-07-08-people-directory-engagement-org-design.md`        | Employee Directory (`/directory`), Engagement (`/engagement`), Org chart (`/org`); `employees`/`recognitions`/`announcements`/`survey_responses` tables. |
| `2026-07-08-my-profile-details-design.md`                     | `/profile` — employee/personal/KYC details; `employee_kyc` table; masking.                                                                               |
| `2026-07-08-job-postings-and-applications-split-design.md`    | Split Hiring into Applications (`/hiring`) + Job Postings (`/postings`); careers columns on `job_openings`; `jd_templates`.                              |
| `2026-07-08-time-tracking-multi-session-utc-design.md`        | Multi-session clock in/out, UTC `timestamptz`, ops+ edit; `time_entries`.                                                                                |
| `2026-07-09-holiday-calendar-auto-leave-clock-edit-design.md` | Master `/calendar` holidays, upcoming-holidays card, daily auto-leave reconciliation, ops+ full clock edit; `holidays`/`app_settings` tables.            |
| `2026-07-09-profile-change-requests-design.md`                | Employee profile change requests → ops+ approval; `profile_change_requests` table; `src/lib/profile-fields.ts` allow-list (Aadhaar/PAN excluded).        |

Implementation plans (broader multi-feature batches) are in `superpowers/plans/`.
