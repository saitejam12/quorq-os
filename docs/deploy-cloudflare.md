# Deploying QuorqOS on Cloudflare Workers with Neon

This is an end-to-end guide for running QuorqOS as a **Cloudflare Worker** backed by
**Neon serverless PostgreSQL** — one of the two deployment modes this codebase ships.
The other, an AWS Node server on RDS, is documented in [`deploy-aws.md`](deploy-aws.md).
Both live side by side; you pick one at build time.

## How the two modes coexist

The only runtime differences between the targets are the **database driver** and the
**build/runtime**, and both are selected from a single env var, `DEPLOY_TARGET`:

| Concern         | `DEPLOY_TARGET` unset → **aws** (default) | `DEPLOY_TARGET=cloudflare`                    |
| --------------- | ----------------------------------------- | --------------------------------------------- |
| DB driver       | `pg` (node-postgres, TCP) → RDS/any PG    | `@neondatabase/serverless` (HTTP) → Neon      |
| Build / runtime | Node bundle (`server.js`) in a container  | Cloudflare Worker (`wrangler`)                |
| Secrets source  | `.env` / ECS + Secrets Manager            | `.dev.vars` / `wrangler secret put`           |
| Commands        | `pnpm dev`, `pnpm build`, `pnpm start`    | `pnpm dev:cf`, `pnpm build:cf`, `pnpm deploy` |

Under the hood ([`src/db.ts`](../src/db.ts)) `requireDb()` reads `process.env.DEPLOY_TARGET`
and returns the matching client — [`src/db-drivers/neon.ts`](../src/db-drivers/neon.ts)
on Cloudflare, [`src/db-drivers/pg.ts`](../src/db-drivers/pg.ts) otherwise. Both drivers
expose the identical `` sql`...` `` / `sql.query` / `sql.transaction` surface, so **no
server code changes between modes**. [`vite.config.ts`](../vite.config.ts) resolves `pg`
to an inert stub in the Worker bundle (workerd cannot load Node's `net`/`tls`), so the
node-postgres driver is never bundled for Cloudflare.

Workers cannot open raw TCP sockets, which is the whole reason the Cloudflare mode needs
Neon's HTTP driver rather than `pg`.

---

## Prerequisites

- A **Cloudflare account** with Workers enabled.
- **Wrangler** — bundled as a dev dependency (`pnpm wrangler …`); no global install needed.
- A **Neon** project + database and its **pooled** connection string (`…-pooler…`,
  `sslmode=require`). Create one at <https://neon.new> or the Neon console.
- Node 20+ and `pnpm` (see [`/CLAUDE.md`](../CLAUDE.md) for the toolchain notes).

Authenticate wrangler once:

```bash
pnpm wrangler login
```

---

## 1. Configure the Worker — `wrangler.jsonc`

Already in the repo; adjust for your account:

```jsonc
{
  "name": "quorq-hr",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "vars": { "DEPLOY_TARGET": "cloudflare" }, // selects the Neon driver at runtime
  "routes": [{ "pattern": "quorq.saitezz-m12.in", "custom_domain": true }],
}
```

- `DEPLOY_TARGET` is a plain **var** (not a secret) so the Worker picks the Neon driver.
- `AUTH_SECRET` and `DATABASE_URL` are **secrets**, set separately (below) — never put
  them in `vars` or commit them.
- Change `routes` to your own custom domain, or delete it to deploy to the
  `*.workers.dev` subdomain while testing.

---

## 2. Local development

Cloudflare mode reads its environment from **`.dev.vars`** (gitignored), not `.env` —
the Worker runtime only sees Worker bindings. Create it from the example:

```bash
cp .dev.vars.example .dev.vars
# then edit .dev.vars:
#   DATABASE_URL=postgres://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/quorq?sslmode=require
#   AUTH_SECRET=<long random string>
```

Generate an `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run the Worker dev server:

```bash
pnpm dev:cf
```

On first run the Neon dev plugin ([`neon-vite-plugin.ts`](../neon-vite-plugin.ts)) will
provision/seed a dev branch from `db/init.sql` when `DATABASE_URL` isn't already set.
If you point `DATABASE_URL` at your own Neon branch, apply the schema yourself instead:

```bash
DATABASE_URL='postgres://…neon…/quorq?sslmode=require' node scripts/apply-schema.mjs
DATABASE_URL='postgres://…neon…/quorq?sslmode=require' node scripts/seed-people.mjs        # optional demo employees
DATABASE_URL='postgres://…neon…/quorq?sslmode=require' node scripts/seed-demo-accounts.mjs # basic/ops/master logins
```

> The CLI scripts (`apply-schema`, `seed-people`, `seed-demo-accounts`) run in Node and
> use `pg` against Neon over TCP — they work the same regardless of the deploy target.

---

## 3. Set production secrets

```bash
pnpm wrangler secret put AUTH_SECRET
pnpm wrangler secret put DATABASE_URL
```

Missing either secret is the #1 cause of a deployed login silently failing — see
[`deployment-auth-troubleshooting.md`](deployment-auth-troubleshooting.md). The login
page prints exactly which one is missing to the browser console.

---

## 4. Apply the schema to your production Neon database

```bash
DATABASE_URL='postgres://…prod-neon…/quorq?sslmode=require' node scripts/apply-schema.mjs
DATABASE_URL='postgres://…prod-neon…/quorq?sslmode=require' node scripts/seed-demo-accounts.mjs
```

`apply-schema.mjs` is idempotent (`CREATE … IF NOT EXISTS`) and already seeds the three
demo accounts via `db/init.sql`; `seed-demo-accounts.mjs` re-asserts them to known
passwords. See [`/CLAUDE.md`](../CLAUDE.md) → **Database workflow** for the gotchas.

---

## 5. Build & deploy

```bash
pnpm deploy          # = DEPLOY_TARGET=cloudflare vite build && wrangler deploy
```

or step by step:

```bash
pnpm build:cf        # produces the Worker bundle (dist/server/index.js)
pnpm wrangler deploy
```

Verify:

```bash
pnpm wrangler tail   # live logs
```

Then open your route (or the `*.workers.dev` URL) and sign in. On a brand-new database
with **zero users**, the first signup is auto-promoted to an active **master** (see the
bootstrap logic in [`src/server/auth.ts`](../src/server/auth.ts)); afterwards signups go
through the normal master approval flow.

---

## Switching between AWS and Cloudflare

Nothing is deleted when you switch — both toolchains stay installed and both sets of
files stay in the repo:

- **To Cloudflare:** `pnpm dev:cf` / `pnpm deploy` (uses `wrangler.jsonc`, `.dev.vars`, Neon).
- **To AWS:** `pnpm dev` / `pnpm build` + `pnpm start`, containerised via `Dockerfile`
  (uses `.env`/Secrets Manager, RDS) — full runbook in [`deploy-aws.md`](deploy-aws.md).

The default target is **aws** (i.e. `DEPLOY_TARGET` unset), so `pnpm dev`/`pnpm build`
keep working exactly as before; Cloudflare is opt-in via the `:cf` scripts.

---

## Troubleshooting

| Symptom                                                         | Cause / fix                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Login fails, console shows `AUTH_SECRET`/`DATABASE_URL` MISSING | Secret not set in the Worker. Run `pnpm wrangler secret put …`. See `deployment-auth-troubleshooting.md`. |
| `DATABASE_URL is not configured in the worker environment`      | `.dev.vars` missing locally, or the secret isn't set in prod.                                             |
| Build errors mentioning `pg` / `net` / `tls`                    | Something imported `pg` outside a server-fn handler. `requireDb()` must only be called server-side.       |
| Neon connection errors                                          | Use the **pooled** connection string with `sslmode=require`; confirm the branch/database exists.          |
| App still uses node-postgres on Cloudflare                      | `DEPLOY_TARGET` isn't `cloudflare` at runtime — check `vars.DEPLOY_TARGET` in `wrangler.jsonc`.           |
