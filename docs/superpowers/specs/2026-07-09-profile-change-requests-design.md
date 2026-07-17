# Profile change requests with ops+ approval

**Date:** 2026-07-09
**Branch:** fablecode
**Status:** approved

## Summary

Employees no longer edit their profile directly. Instead they submit a **profile
change request** from a single modal covering every editable field (except
Aadhaar and PAN). An ops+ reviewer approves the whole request — applying every
changed field to the employee record — or rejects it with a reason shown back to
the employee.

## Decisions (locked)

- **Field scope:** every editable profile field except Aadhaar and PAN — employee
  details, personal details, and bank details.
- **Direct edit replaced:** the current inline "Save changes" personal form is
  removed; all changes flow through the request → approval path.
- **Approval:** approve-all or reject-with-reason (no per-field decisions).
- One **pending request per employee** at a time; the request path is the single
  edit mechanism for everyone, and a reviewer cannot approve their own request.

## Requestable fields (`src/lib/profile-fields.ts`)

A single constant allow-list is the source of truth for both the modal UI and
server-side application. Each entry: `{ key, label, table, column, max, type,
required? }`.

| key                   | table.column                      | type     | max | required |
| --------------------- | --------------------------------- | -------- | --- | -------- |
| name                  | employees.name                    | text     | 120 | yes      |
| email                 | employees.email                   | email    | 160 | yes      |
| department            | employees.department              | text     | 64  |          |
| designation           | employees.designation             | text     | 120 |          |
| employmentType        | employees.employment_type         | text     | 24  |          |
| location              | employees.location                | text     | 64  |          |
| dateOfJoining         | employees.date_of_joining         | date     | —   |          |
| phone                 | employees.phone                   | text     | 24  |          |
| currentAddress        | employees.current_address         | textarea | 400 |          |
| permanentAddress      | employees.permanent_address       | textarea | 400 |          |
| emergencyContactName  | employees.emergency_contact_name  | text     | 120 |          |
| emergencyContactPhone | employees.emergency_contact_phone | text     | 24  |          |
| bankName              | employee_kyc.bank_name            | text     | 120 |          |
| bankAccountNumber     | employee_kyc.bank_account_number  | text     | 40  |          |
| bankIfsc              | employee_kyc.bank_ifsc            | text     | 20  |          |

Aadhaar and PAN are absent from the list, so no code path can request them.

Pure helpers (unit-tested, no DB):

- `pickAllowed(input): Record<string, string>` — keeps only allow-listed keys,
  trims to strings, drops Aadhaar/PAN/unknown keys.
- `diffChanges(current, proposed): Record<string, string>` — only keys whose
  proposed value differs from current.
- `validateChanges(changes): Array<string>` — error messages for required fields
  emptied (`name`, `email`) or values exceeding `max`.

## Schema (`db/init.sql`)

Idempotent; no semicolons in comments; no `DO $$` blocks.

```sql
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
```

`changes` holds only the changed fields as `{ key: newValueString }` (dates as
`YYYY-MM-DD`).

## Server (`src/server/profile-requests.ts`)

All return `Result<T>` and resolve the caller via `getSessionUser()` (which
already returns `employeeId` and `tier`); review actions gate on
`hasTier(user.tier, 'ops')`.

- `submitProfileChangeRequest({ changes })` — any linked employee. `pickAllowed`
  → read current values → `diffChanges` → `validateChanges`. Errors if nothing
  changed, validation fails, or a pending request already exists. Inserts a
  pending row.
- `getMyProfileChangeRequest()` — the caller's most recent request (or null), for
  the profile-page banner.
- `listProfileChangeRequests()` — ops+. Pending requests, each enriched with the
  employee's **current** value per changed field so the reviewer sees current →
  requested.
- `approveProfileChangeRequest({ id })` — ops+, and not the caller's own request.
  Applies each changed field: a single dynamic `UPDATE employees SET ...` for
  employee/personal columns and an upsert into `employee_kyc` for bank columns —
  column names taken only from the allow-list constant, values parameterized.
  Marks `approved`, sets `reviewed_at`/`reviewed_by`.
- `rejectProfileChangeRequest({ id, reason })` — ops+, not own. Requires a
  non-empty reason (≤300). Marks `rejected`.

## UI

**Profile page (`/profile`):** remove the inline `PersonalForm` and its direct
`updateMyPersonalDetails` save. Add:

- A **"Request changes"** button that opens a modal listing every field in
  `PROFILE_FIELDS` (grouped Employee / Personal / Bank), pre-filled from the
  current record, rendered by `type` (text/textarea/date/email). Aadhaar/PAN are
  not present. On submit, the client diffs against the pre-filled values and sends
  only changed fields to `submitProfileChangeRequest`, then invalidates the route.
- A **status banner** driven by `getMyProfileChangeRequest()`: pending ("Change
  request awaiting review" + the list of fields), or rejected ("Your last request
  was declined: <reason>"). Approved/empty shows nothing.
- The Employee / Personal / KYC sections remain read-only displays (KYC still
  masks Aadhaar and salary account).

`updateMyPersonalDetails` is removed from `profile.ts` (no remaining caller).

**Review screen:** new route `src/routes/_app/admin/profile-requests.tsx`,
`beforeLoad: requireTier(context.user, 'ops')`, titled "Profile Change Requests".
Sidebar: add `/admin/profile-requests` to the `RoutePath` union and a leaf under
Administration with `minTier: 'ops'` (the existing "User Requests" stays master).
Uses `useQuery(listProfileChangeRequests)` + `useMutation` for approve/reject with
invalidate, mirroring `admin/requests.tsx`. Each pending request is a card:
employee name/department, a table of field label / current → requested, an
**Approve** button and a **Reject** control that reveals a reason input. Empty
state mirrors the signup queue's inbox illustration.

## Seed (`scripts/seed-people.mjs`)

Clear `profile_change_requests`, then seed 2 pending sample requests (different
employees, a mix of personal and bank fields) so the review screen is populated
in the demo.

## Testing & verification

- Unit tests (`src/lib/profile-fields.test.ts`): `pickAllowed` drops
  Aadhaar/PAN/unknown keys and trims; `diffChanges` returns only changed keys;
  `validateChanges` flags emptied `name`/`email` and over-long values.
- `pnpm test`, `pnpm lint`, `tsc --noEmit` clean on touched files.
- Live SQL smoke: submit a request (appears pending), approve it, confirm the
  values land in `employees`/`employee_kyc` and status flips to approved; reject
  another and confirm the reason persists.

## Out of scope

- Per-field approval.
- Editing Aadhaar/PAN through any flow.
- Exempting ops+/master from the request flow for their own edits (single path;
  self-approval blocked).
- Notifying the employee outside the on-page banner.
