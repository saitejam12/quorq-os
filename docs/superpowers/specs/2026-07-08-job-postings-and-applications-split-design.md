# Split Hiring into Applications + Job Postings — Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Branch:** fablecode
**Sub-project:** refinement of the Hiring module (part of SP-Hiring)

## Goal

Split the single Hiring page (ops+) into two focused pages:

1. **Applications** (`/hiring`) — the existing candidate pipeline (kanban) and funnel KPIs.
2. **Job Postings** (`/postings`) — manage careers-facing job postings.

On the Job Postings page, ops+ users create a posting from a **job-description
template** (chosen in a popup), supplying department, location, and the
full-time/contract distinction. Creating a posting publishes it immediately: it
becomes active, appears in the active list, and is written to the database so a
**separate careers site (a different repository / API) can pull it**. Active
postings can be deactivated by selecting a reason.

## Decisions (from the design dialogue)

- **Postings data model:** extend the existing `job_openings` table with
  careers-facing columns rather than adding a separate table. One source of
  truth; applications stay linked via `applications.job_id`.
- **JD templates:** a seeded `jd_templates` database table (not static code), so
  the "+ New opening" popup fetches them and ops can extend them later.
- **Publishing:** creating a posting from a template publishes it in one step
  (no separate draft/publish flow — YAGNI).

## External careers API contract

The careers site lives in another repository and is out of scope here; this work
only guarantees the data it reads. A published, live posting satisfies:

```sql
SELECT id, role, department, location, employment_type, description,
       published_at, category
FROM job_openings
WHERE published = TRUE AND posting_status = 'active'
ORDER BY published_at DESC;
```

That query is the contract. Deactivating a posting (`posting_status = 'closed'`)
removes it from the careers feed without deleting history.

## Data model

### `job_openings` — new columns (idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`)

| Column                | Type                                       | Meaning                                              |
| --------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `location`            | `VARCHAR(64) NOT NULL DEFAULT 'Hyderabad'` | Posting location                                     |
| `employment_type`     | `VARCHAR(24) NOT NULL DEFAULT 'full-time'` | `full-time` \| `contract` (FTE vs contract)          |
| `description`         | `TEXT`                                     | JD text, copied from the chosen template at creation |
| `published`           | `BOOLEAN NOT NULL DEFAULT FALSE`           | Whether visible on the external careers feed         |
| `published_at`        | `TIMESTAMP`                                | When first published                                 |
| `template_id`         | `INTEGER`                                  | The `jd_templates` row used (reference only)         |
| `posting_status`      | `VARCHAR(16) NOT NULL DEFAULT 'active'`    | Careers lifecycle: `active` \| `closed`              |
| `deactivation_reason` | `VARCHAR(48)`                              | Set when closed                                      |
| `deactivated_at`      | `TIMESTAMP`                                | Set when closed                                      |

The pre-existing `status` column (`critical`/`at_risk`/`in_progress`/`on_track`)
is unchanged and remains the **urgency** badge used by analytics. `posting_status`
is the separate careers **lifecycle**. Both defaults keep already-seeded rows
`active`.

### `jd_templates` (new)

```sql
CREATE TABLE IF NOT EXISTS jd_templates (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'others',  -- tech | sales | others
    summary VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Seeded with ~7 templates (e.g. Software Engineer, Senior Software Engineer,
Engineering Manager, Account Executive, Sales Manager, Product Manager, HR
Business Partner), each with a realistic `summary` and multi-line `description`.

### Deactivation reasons

A fixed set, validated server-side and offered in the deactivate popup:
`Position filled`, `Budget freeze`, `Role on hold`, `Requirements changed`,
`Duplicate posting`.

## Server functions

### New `src/server/postings.ts` (raw `sql`, `Result<T>`, `getSessionUser`/`canApprove`)

- `getPostings()` (GET) — returns:
  - `templates`: `jd_templates` rows for the popup.
  - `active`: published, `posting_status='active'` postings with applicant counts
    (left join `applications`).
  - `closed`: recently closed postings with their reason and timestamp.
  - `kpis`: active count, published count, opened-this-month count, total applicants.
- `createPosting({ templateId, department, location, employmentType })` (POST,
  ops+) — loads the template, inserts a `job_openings` row copying the template's
  `title` → `role` and `description`, with `category` from the template,
  `published = true`, `published_at = now()`, `posting_status = 'active'`,
  `opened_date = today`, `days_open = 0`, `template_id`. `employment_type`
  validated to `full-time`|`contract`. Returns `Result<null>`.
- `deactivatePosting({ id, reason })` (POST, ops+) — sets
  `posting_status = 'closed'`, `deactivation_reason`, `deactivated_at = now()`.
  Rejects an unknown reason or an already-closed posting. Returns `Result<null>`.

A small pure helper module `src/lib/postings.ts` exports
`DEACTIVATION_REASONS`, `EMPLOYMENT_TYPES`, and
`templateToPosting(template, { department, location, employmentType })` (maps a
template + form inputs to the row fields) — unit-tested.

### `src/server/hiring.ts` changes

- Remove `createJob` (superseded by `createPosting`).
- `getHiring` stays for the Applications page. Its open-roles / open-positions
  counts scope to `posting_status = 'active'`. The `jobs` list it returned (for
  the old table) is dropped from the Applications page.

### Analytics touch-up

`getTalent` in `src/server/metrics.ts` counts `job_openings` for open positions;
scope those counts to `posting_status = 'active'` so closed postings don't inflate
talent metrics. No other analytics change.

## UI

### `src/routes/_app/hiring.tsx` — Applications (ops+)

Trimmed to the candidate pipeline: KPI row (open roles [active], in pipeline, at
offer, joined) and the kanban with per-card "Advance". The "Open positions" table
and "New role" form are removed.

### `src/routes/_app/postings.tsx` — Job Postings (ops+, new)

- KPI row: active postings, published, opened this month, total applicants.
- **Active postings** table: role, department, location, type, applicants,
  a "Published" badge, and a **Deactivate** button per row. Deactivate opens a
  small inline popover/modal with a reason `<select>` + confirm → `deactivatePosting`.
- **Recently closed** section: role, department, reason, closed date.
- **"+ New opening"** button opens a **template modal**: a list/grid of
  `jd_templates` (title + summary + category chip); selecting one reveals the
  fields — department `<select>`, location `<select>` (Hyderabad/Bangalore/Remote/
  Pune), and employment type (Full-time / Contract radio) — then "Publish
  posting" → `createPosting`, closes the modal, and the posting appears in the
  active list (`router.invalidate()`).

Both pages read the user via `Route.useRouteContext()` and are guarded
`requireTier(context.user, 'ops')`. After adding `/postings`, run
`pnpm generate-routes`.

### Sidebar

In `src/components/AppSidebar.tsx`, under "Hiring & Onboarding", replace the
`Hiring` leaf with two leaves — `Applications` → `/hiring` and `Job Postings` →
`/postings` (both `minTier: 'ops'`) — and add `'/postings'` to the `RoutePath`
union.

## Seed (`scripts/seed-people.mjs`)

- Insert `jd_templates` rows (the ~7 templates), before job openings, and keep
  their ids.
- When seeding `job_openings`, set `published = true`, `published_at`,
  `posting_status = 'active'`, a `location`, an `employment_type`
  (mostly full-time, some contract), a `description` (from a matching template),
  and `template_id`, so the Job Postings page and the external feed have data.
- Reset order: add `DELETE FROM jd_templates` (after `job_openings`, since
  `template_id` is a plain column with no FK constraint, order is not critical,
  but delete templates in the reset block for idempotency).

## Testing

- Unit-test `src/lib/postings.ts`: `templateToPosting` field mapping, and the
  `DEACTIVATION_REASONS` / `EMPLOYMENT_TYPES` membership guards.
- `pnpm test`, `pnpm lint`, `pnpm generate-routes`, and `tsc --noEmit` stay clean;
  SQL validated by `apply-schema` + `seed:people` + a live query of the careers
  contract.

## Out of scope

- The careers website / external API itself (different repo).
- Editing a live posting's fields, or editing templates from the UI.
- Draft postings, scheduled publishing, or per-posting application forms.
- Reopening a closed posting.
