# My Profile — Employee / Personal / KYC Details — Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Sub-project:** part of 2 (Employee core — My Worklife), extends the People modules

## Goal

Turn the `/profile` placeholder into a real self-service profile that shows the
logged-in user's own record in three categories:

1. **Employee details** — emp code, name, email, department, designation,
   employment type, location, date of joining. Read-only.
2. **Personal details** — phone, current address, permanent address, emergency
   contact name, emergency contact phone. Editable by the user themselves.
3. **KYC information** — bank (name / account number / IFSC), Aadhaar number,
   PAN number. Read-only on this page.

## Decisions (from the design dialogue)

- **Page:** only `/profile` (My Profile). The directory profile (`/directory/$id`)
  is untouched.
- **KYC access:** self + ops/master. Because `/profile` is self-service, the
  caller always views their own KYC, so no cross-user check is needed here. The
  access model is enforced structurally (see Schema) so KYC cannot leak through
  peer-facing queries.
- **Editing:** display everything; the user may self-edit their **Personal
  details** only. Employee details and KYC are read-only / admin-managed for now.
- **All new fields are optional** (nullable). Only name and email remain required
  (they already are on `employees`).

## Data model

Idempotent additions to `db/init.sql` (applied by `scripts/apply-schema.mjs`,
which splits on `;`).

Personal details and the employee code go on `employees` as nullable columns:

```sql
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_code VARCHAR(24);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_address VARCHAR(400);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address VARCHAR(400);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(24);
```

KYC lives in its **own** table, one row per employee:

```sql
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
```

**Why a separate KYC table.** The directory's `getEmployee` runs
`SELECT * FROM employees`. Any KYC column placed on `employees` would be fetched
and shipped in that server-function payload to peers viewing a directory profile,
even if the UI never renders it. Isolating KYC in its own table means peer-facing
queries physically cannot expose it — the "self + ops/master" rule is enforced at
the data layer, not merely hidden in the UI. Personal-detail columns are safe on
`employees` because `getEmployee` builds its response object from an explicit
field list and never spreads the row.

## Server functions

New file `src/server/profile.ts` — raw `sql` via `requireDb()`, `Result<T>`
contract from `src/server/auth.ts`. The caller is resolved from the session
cookie (verify token → look up the `users` row → read `employee_id`), never from
untrusted token fields.

- `getMyProfile()` (GET) → resolves the caller's `employee_id`. Returns
  `{ employee, personal, kyc } | null`. `null` when the caller has no linked
  employee record (e.g. a fresh signup) or no valid session. `kyc` is `null` when
  no `employee_kyc` row exists. Self-only, so KYC is always the caller's own.
- `updateMyPersonalDetails({ phone?, currentAddress?, permanentAddress?,
emergencyContactName?, emergencyContactPhone? })` (POST) → updates only the
  caller's own `employees` row. No tier check — it is self-service. Each field is
  an optional, length-bounded string, trimmed; empty string is stored as `NULL`.
  Returns `Result<null>`; errors if the caller has no linked employee record.

## UI

`src/routes/_app/profile.tsx` becomes a data route: `loader` calls
`getMyProfile()`; the component renders three `Card`s from the shared
`src/components/ui.tsx` kit. When `getMyProfile` returns `null`, the page shows a
friendly empty state ("Your account isn't linked to an employee record yet.").

1. **Employee details** — read-only field rows.
2. **Personal details** — an editable form (the five personal fields) with a Save
   button wired to `updateMyPersonalDetails`, followed by `router.invalidate()`.
   Mirrors the `OrgAccessCard` edit pattern in `directory/$id.tsx`: local state,
   dirty check, saving spinner, success/error message.
3. **KYC information** — read-only rows. Account number and Aadhaar are masked to
   their last 4 characters via a pure `mask()` helper; PAN is shown in full. A
   "not on file" hint shows when `kyc` is `null`.

The existing `PayslipCard` is kept, rendered below the three cards.

A small `mask(value, visible = 4)` helper (in `src/lib/mask.ts`) returns a string
with all but the last `visible` characters replaced by `•`, and handles
`null`/short values gracefully. It is pure and unit-tested.

## Seed

Extend `scripts/seed-people.mjs`:

- Reset order gains `DELETE FROM employee_kyc` **before** `DELETE FROM employees`
  (FK dependency).
- `mkEmployee` / insert gains deterministic values for `emp_code`
  (`QRQ-####`, sequential), `phone`, `current_address`, `permanent_address`,
  `emergency_contact_name`, `emergency_contact_phone` (curated pools + the
  existing seeded PRNG — still no faker).
- After inserting each employee, insert one `employee_kyc` row with deterministic
  fake `bank_name`, `bank_account_number`, `bank_ifsc`,
  `aadhaar_number` (12 digits), `pan_number` (`AAAAA9999A` shape).

Determinism and idempotency are preserved: re-running `pnpm seed:people`
reproduces identical data.

## Testing

- Unit-test `mask()` — masking long values, values shorter than the visible
  window, and `null`/empty input.
- DB-touching server functions are not unit-tested, consistent with the existing
  suite (`tiers.test.ts`, `jwt.test.ts`, `org.test.ts` cover pure logic only).
- `pnpm test`, `pnpm lint`, and `pnpm generate-routes` must pass; the SQL is
  validated by running `apply-schema` + `seed:people` against the Neon dev DB.

## Out of scope

- Editing Employee details or KYC from this page (admin-managed / later pass).
- KYC on the directory profile and any ops/master view of _other_ people's KYC
  (the access model is recorded for when that view is built, but no such view
  ships here).
- Document uploads, profile photos, and change-history/audit for personal edits.
