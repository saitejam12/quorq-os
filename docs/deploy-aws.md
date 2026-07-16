# Deploying QuorqOS on AWS with RDS PostgreSQL

This is an end-to-end, copy-paste guide for moving QuorqOS **off** Cloudflare Workers +
Neon and **onto** AWS compute + Amazon RDS for PostgreSQL.

It is written specifically for _this_ codebase, so it accounts for the two things that
are actually Cloudflare/Neon-specific and must change in code:

1. **The database driver.** The app talks to Neon over the `@neondatabase/serverless`
   HTTP driver. That driver only speaks to Neon's HTTP proxy — it cannot connect to a
   normal TCP PostgreSQL like RDS. We swap it for `pg` (node-postgres) behind a tiny
   adapter that reproduces the exact Neon API the code uses (`` sql`...` ``,
   `sql.query(text, params)`, `sql.transaction([...])`), so **none of the ~20 server
   files change**.
2. **The runtime/build target.** The app builds a Cloudflare Worker (`wrangler`,
   `.dev.vars`, `@cloudflare/vite-plugin`). AWS runs a normal Node.js process, so we
   build a Node server bundle and run it in a container.

Everything else — auth (stateless JWT via Web Crypto), the raw-SQL server functions,
the schema in `db/init.sql` — is portable as-is.

**Target architecture (recommended): ECS Fargate + Application Load Balancer + RDS.**

```
 Route 53  ─►  ACM cert  ─►  Application Load Balancer (:443)
                                     │  (public subnets)
                                     ▼
                          ECS Fargate service  ── Docker image ◄── ECR
                          (private subnets, Node :3000)
                                     │
                          reads secrets from  ─►  AWS Secrets Manager
                          (DATABASE_URL, AUTH_SECRET)
                                     │
                                     ▼
                          Amazon RDS for PostgreSQL 16
                          (private subnets, TLS required)
```

If you would rather not manage a cluster, **Part L** covers AWS App Runner (simplest),
a single EC2 box (cheapest), and why AWS Amplify/Lambda is a poor fit for this app.

---

## Table of contents

- **Part A — Make the code AWS/RDS-ready** (driver swap, Node build, secrets model)
- **Part B — Prerequisites & naming conventions**
- **Part C — Provision the network (VPC, subnets, security groups)**
- **Part D — Provision RDS PostgreSQL**
- **Part E — Load schema + seed data into RDS**
- **Part F — Containerize the app (Dockerfile)**
- **Part G — Push the image to ECR**
- **Part H — Store secrets in Secrets Manager**
- **Part I — Deploy on ECS Fargate behind an ALB**
- **Part J — HTTPS, custom domain (ACM + Route 53)**
- **Part K — Verify, operate, scale, roll back**
- **Part L — Alternative compute options**
- **Part M — Teardown / cost notes**

---

# Part A — Make the code AWS/RDS-ready

Do all of Part A **before** touching AWS, and verify it locally. These are the only
source changes required.

> **Already applied on branch `aws-rds-deploy`.** The changes below are implemented
> and verified in the repo (`tsc`, `eslint`, `vitest` green; the Node server boots and
> serves SSR + static assets). This section documents what changed and why. The final
> `src/db.ts` is the authoritative version — the snippet here matches it.

## A.1 — Install the Node PostgreSQL driver, drop Cloudflare-only deps

```bash
# from the repo root
pnpm add pg
pnpm add -D @types/pg

# Node HTTP adapter that serves a Web-standard `fetch` handler on Node.js
pnpm add @hono/node-server

# These are only needed for the Cloudflare Worker build; safe to remove for AWS.
# (Leave them if you want to keep the option of deploying to Cloudflare too.)
pnpm remove @cloudflare/vite-plugin wrangler @neondatabase/serverless
```

> If you want to keep Cloudflare as a fallback target, **don't** remove those three;
> just add `pg` + `@hono/node-server` and gate the driver on an env var. The rest of
> this guide assumes the AWS-only path.

## A.2 — Replace the database client (`src/db.ts`)

This is the heart of the migration. The current file uses Neon's HTTP driver. Replace
its entire contents with a `pg` connection pool wrapped in an adapter that exposes the
**same three call shapes** the codebase already uses:

- `` await sql`select ... where id=${x}` `` → tagged template, returns the rows array
- `await sql.query(text, paramsArray)` → parameterized string query, returns rows
- `await sql.transaction([q1, q2, ...])` → runs tagged-template queries atomically

Because those are the _only_ Neon APIs used anywhere in `src/server/**` (verified: 220
tagged-template call-sites, plus `sql.query` and `sql.transaction`; no Neon-specific
fragment/identifier helpers), this adapter is a complete drop-in and **no server file
needs to change**.

Two subtleties the implemented version gets right:

- **Laziness.** The tagged template must _not_ hit the DB when constructed — only when
  awaited. Otherwise `sql.transaction([sql`…`, sql`…`])` would run each query once
  standalone (on construction) **and** again inside the transaction. The pending query
  is a lazy thenable: nothing executes until `.then` runs.
- **Row typing.** Awaiting resolves to `Record<string, any>[]` — the exact shape Neon's
  default query function returned — so every `(await sql`…`)[0] as SomeType` narrowing
  and `.map((row) => …)` callback across `src/server/**` keeps compiling unchanged.

```ts
// src/db.ts
import { Pool } from 'pg'
import type { PoolClient } from 'pg'

// Awaiting resolves to `Record<string, any>[]` (Neon's default shape). A "pending
// query" is a LAZY thenable carrying its SQL text + params; it does not touch the DB
// until awaited, which is what lets transaction() collect text/values and run them on
// one connection without the standalone execution firing first (double-run).
type Row = Record<string, any>

interface PendingQuery extends PromiseLike<Row[]> {
  text: string
  values: unknown[]
}

export interface SqlClient {
  (strings: TemplateStringsArray, ...values: unknown[]): PendingQuery
  query: (text: string, params?: unknown[]) => Promise<Row[]>
  transaction: (queries: PendingQuery[]) => Promise<any[]>
}

let pool: Pool | undefined
let sql: SqlClient | undefined

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // RDS terminates TLS with the Amazon RDS CA. rejectUnauthorized:false encrypts
      // the link but skips cert verification — harden with `ca` (see §A.6).
      ssl: { rejectUnauthorized: false },
      max: 10, // per container; keep (task count × max) under RDS max_connections
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return pool
}

// Build a `$1,$2,…` parameterized statement from a tagged template.
function build(strings: TemplateStringsArray, values: unknown[]): string {
  let text = strings[0]
  for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
  return text
}

function makeClient(): SqlClient {
  const p = getPool()

  const tagged = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): PendingQuery => {
    const text = build(strings, values)
    let run: Promise<Row[]> | undefined
    // Nothing hits the DB until .then runs (i.e. the caller awaits).
    const exec = () =>
      (run ??= p.query(text, values).then((r) => r.rows as Row[]))
    return {
      text,
      values,
      then: (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected),
    }
  }

  const client = tagged as SqlClient

  client.query = async (text: string, params: unknown[] = []) =>
    (await p.query(text, params)).rows as Row[]

  // Delete/inserts/write-back etc. as one BEGIN/COMMIT on a single connection;
  // any failure rolls the whole batch back.
  client.transaction = async (queries: PendingQuery[]) => {
    const conn: PoolClient = await p.connect()
    try {
      await conn.query('BEGIN')
      const out: unknown[] = []
      for (const q of queries) {
        out.push((await conn.query(q.text, q.values)).rows)
      }
      await conn.query('COMMIT')
      return out
    } catch (err) {
      await conn.query('ROLLBACK')
      throw err
    } finally {
      conn.release()
    }
  }

  return client
}

// Same contract as before: throw a descriptive error if DATABASE_URL is unset,
// and memoize the client. Callers keep doing `const sql = requireDb()`.
export function requireDb(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured in the server environment. ' +
        'Local dev: add it to .env and run `node --env-file=.env server.js`. ' +
        'Production (AWS): inject it from Secrets Manager into the ECS task.',
    )
  }
  if (!sql) sql = makeClient()
  return sql
}
```

> **Why an adapter instead of rewriting queries?** node-postgres has no tagged-template
> API and no `.transaction([...])`. Rewriting 220 call-sites by hand would be error-prone.
> The adapter is ~90 lines and preserves the `Result<T>` semantics, the transaction in
> `updateSalaryComponents` (`src/server/payroll.ts:233`), and the `sql.query(...)`
> dynamic inserts (`src/server/payroll.ts:441`, `onboarding.ts`, `profile-requests.ts`).
> It's covered by a unit test that mocks `pg` (`src/db.adapter.test.ts`): it asserts the
> `$1,$2` substitution, laziness, and the BEGIN/COMMIT/ROLLBACK transaction path.

> **Also updated:** `src/db.test.ts` (assertion no longer expects the old `.dev.vars`
> message), and the two user-facing "run `wrangler secret put`" strings in
> `src/server/auth.ts` and `src/routes/login.tsx` now point at env vars / Secrets Manager.

## A.3 — Build a Node server instead of a Cloudflare Worker

The TanStack Start server entry (`@tanstack/react-start/server-entry`) is a
Web-standard `fetch(request)` handler — the same shape a Worker uses. On AWS we run it
inside a Node process with a thin adapter.

**A.3.1 — `vite.config.ts`: remove the Cloudflare plugin.**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import { cloudflare } from '@cloudflare/vite-plugin'   // ← delete
// import neon from './neon-vite-plugin.ts'               // ← delete (Neon dev plugin)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    // cloudflare({ viteEnvironment: { name: 'ssr' } }),  // ← delete
    // neon,                                              // ← delete
    tailwindcss(),
    tanstackStart(), // emits the SSR server bundle
    viteReact(),
  ],
})
```

`vite build` now produces `dist/client/` (static assets) plus `dist/server/server.js`,
an SSR bundle whose default export is `{ fetch }` (verified for
`@tanstack/react-start@1.168.x`). Delete `wrangler.jsonc` and `neon-vite-plugin.ts`.

**A.3.2 — Add a Node entrypoint (`server.js`) that serves static assets + SSR.**

On Cloudflare the platform served `dist/client/*` for us; a bare Node server has to do
it itself, then fall back to the SSR `fetch` handler. Committed as plain JS so
`node server.js` runs it directly (no transpile step):

```js
// server.js  (repo root) — abbreviated; see the file for the full content-type map
import { serve } from '@hono/node-server'
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import handler from './dist/server/server.js' // default export: { fetch(request): Response }

const CLIENT_DIR = join(process.cwd(), 'dist', 'client')

async function tryServeStatic(pathname) {
  const filePath = join(CLIENT_DIR, normalize(pathname)) // reject path traversal:
  if (!filePath.startsWith(CLIENT_DIR)) return null
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null
  const body = await readFile(filePath)
  const cacheControl = pathname.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable' // Vite fingerprints /assets
    : 'public, max-age=3600'
  return new Response(body, {
    headers: {
      'content-type': typeFor(extname(filePath)),
      'cache-control': cacheControl,
    },
  })
}

const fetch = async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const asset = await tryServeStatic(new URL(request.url).pathname)
    if (asset) return asset
  }
  return handler.fetch(request)
}

serve(
  { fetch, port: Number(process.env.PORT ?? 3000), hostname: '0.0.0.0' },
  (info) => console.log(`QuorqOS listening on http://0.0.0.0:${info.port}`),
)
```

> **Build entry path.** For this version the SSR entry is `dist/server/server.js`. If a
> future TanStack Start version moves it (e.g. `.output/server/index.mjs`), run
> `find dist -name '*.js' | grep -i server` after `pnpm build` and update the import —
> it's the only path `server.js` depends on.

**A.3.3 — `package.json` scripts.** Replace the Cloudflare `deploy` script and add a
Node start command:

```jsonc
{
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "start": "node server.js", // runs the built Node server
    "test": "vitest run",
    "lint": "eslint",
    // remove:  "deploy": "npm run build && wrangler deploy"
  },
}
```

> `node server.js` runs the transpiled entry. If you keep `server.ts` as TypeScript,
> either add a `tsc`/`esbuild` step to emit `server.js`, or run it with
> `node --experimental-strip-types server.ts` (Node 22+). Simplest: keep a tiny
> committed `server.js` in plain JS with the import above.

## A.4 — Config & secrets model

Cloudflare read secrets from `.dev.vars` / `wrangler secret`. Node reads
`process.env`. The two variables the app needs (`src/server/auth.ts`, `src/db.ts`) are:

| Variable       | Purpose                                   | Where it comes from on AWS     |
| -------------- | ----------------------------------------- | ------------------------------ |
| `DATABASE_URL` | RDS connection string (with TLS)          | Secrets Manager → ECS task env |
| `AUTH_SECRET`  | HS256 JWT signing key (Web Crypto)        | Secrets Manager → ECS task env |
| `PORT`         | Port the Node server binds (default 3000) | ECS task env (plain)           |
| `APP_VERSION`  | Shown by the health endpoint (optional)   | ECS task env (plain)           |

The **`DATABASE_URL`** for RDS looks like:

```
postgres://quorq_app:STRONG_PASSWORD@quorq-db.abc123.us-east-1.rds.amazonaws.com:5432/quorq?sslmode=require
```

Generate a strong `AUTH_SECRET` (do **not** reuse the Neon one blindly, but note that
changing it invalidates all existing JWTs, forcing everyone to log in again):

```bash
openssl rand -base64 48
```

For **local dev after the swap**, create a `.env` at the repo root and load it (e.g.
`node --env-file=.env server.js`, or add `import 'dotenv/config'` if you install
`dotenv`). The Vite dev server picks up `.env` automatically for `import.meta.env`, but
server code reads `process.env`, so pass `--env-file=.env` when you run the built server
locally.

## A.5 — Schema/seed scripts now use `pg`

`scripts/apply-schema.mjs` and `scripts/seed-people.mjs` were on the Neon driver and
read `DATABASE_URL` only from `.env.local`. Both were converted to `pg` and share a new
helper, `scripts/db-url.mjs`, that resolves the URL from **either** the process
environment (for AWS/RDS runs) **or** `.env.local` (unchanged local workflow):

```js
// scripts/db-url.mjs
import { readFileSync } from 'node:fs'

export function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim()
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
  console.error('DATABASE_URL not set (env or .env.local).')
  process.exit(1)
}
export const SSL = { rejectUnauthorized: false } // RDS requires TLS; verify per §A.6
```

`apply-schema.mjs` now opens a `pg.Client` with that URL and runs the same `;`-split of
`db/init.sql` (init.sql keeps semicolons out of comments/literals — gotcha #2).
`seed-people.mjs` keeps its ~1300 lines unchanged except for a tiny Neon-compatible
shim over a `pg.Pool` (a tagged template that resolves to `r.rows`, plus
`sql.query(text, params)` for the bulk inserts) and an `await pool.end()` at the end so
the process exits.

Run either with `DATABASE_URL` set in the shell (points at RDS, never Neon):

```bash
DATABASE_URL='postgres://…?sslmode=require' node scripts/apply-schema.mjs   # apply schema
DATABASE_URL='postgres://…?sslmode=require' node scripts/seed-people.mjs    # seed demo data
```

## A.6 — (Recommended) Verify the RDS server certificate

`ssl: { rejectUnauthorized: false }` encrypts traffic but does not verify RDS's
identity. To fully verify, download Amazon's RDS CA bundle, ship it in the image, and
reference it:

```bash
curl -o certs/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

```ts
// in src/db.ts getPool(), replace the ssl option:
import { readFileSync } from 'node:fs'
// ...
ssl: {
  ca: readFileSync(process.env.RDS_CA_PATH ?? '/app/certs/rds-global-bundle.pem', 'utf8'),
  rejectUnauthorized: true,
},
```

Add `COPY certs/ ./certs/` to the Dockerfile (Part F). You can start with
`rejectUnauthorized:false` to get running, then harden to full verification.

## A.7 — Verify Part A locally

All of these pass on branch `aws-rds-deploy`:

```bash
./node_modules/.bin/tsc --noEmit   # only the 2 known /settings errors (see CLAUDE.md)
./node_modules/.bin/eslint         # clean
./node_modules/.bin/vitest run     # 16 files, 98 tests (incl. src/db.adapter.test.ts)
pnpm build                         # emits dist/client/ + dist/server/server.js

# Boot the Node server (Pool is lazy, so it starts without a reachable DB):
DATABASE_URL='postgres://u:p@127.0.0.1:5432/quorq?sslmode=require' \
  AUTH_SECRET='dev-secret' PORT=3000 node server.js
# GET /login → 200 HTML (SSR); GET / → 307 to /login (anon guard);
# GET /assets/<hash>.js and /favicon.ico → 200 with correct content-types.
```

For a full end-to-end check, point `DATABASE_URL` at a real Postgres (local Docker or
RDS), run the schema + seed from §A.5, then log in with `master@quorq.com` / `master123`.

---

# Part B — Prerequisites & naming conventions

**Tools:** an AWS account with admin (or equivalent) access, the AWS CLI v2
(`aws --version`), Docker, and `psql` (from `libpq`/`postgresql-client`) for the schema
load.

```bash
aws configure           # set access key, secret, default region, output=json
aws sts get-caller-identity   # sanity check
```

**Placeholders used throughout** — export these so the commands are copy-paste:

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export APP=quorq
export DB_NAME=quorq
export DB_USER=quorq_app
export DB_PASSWORD='CHANGE_ME_strong_password'     # store this; you'll need it once
```

Everything below can also be done in the AWS Console; the CLI is shown because it's
unambiguous and reproducible. Pick **one region** and stay in it — RDS, ECS, ECR, ALB,
and ACM must all be in the same region (except CloudFront, which we don't use here).

---

# Part C — Provision the network (VPC, subnets, security groups)

You can reuse the account's **default VPC** to get running fast, then harden later. This
section creates a small purpose-built VPC with public subnets (for the ALB) and private
subnets (for Fargate + RDS). If you prefer the default VPC, skip to C.5 for the security
groups only.

## C.1 — VPC

```bash
export VPC_ID=$(aws ec2 create-vpc --cidr-block 10.20.0.0/16 \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$APP-vpc}]" \
  --query Vpc.VpcId --output text)
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
```

## C.2 — Subnets (2 public, 2 private, across 2 AZs)

RDS and ALB both require **two subnets in two Availability Zones**.

```bash
export AZ1=${AWS_REGION}a AZ2=${AWS_REGION}b

export PUB1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.1.0/24 \
  --availability-zone $AZ1 --query Subnet.SubnetId --output text)
export PUB2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.2.0/24 \
  --availability-zone $AZ2 --query Subnet.SubnetId --output text)
export PRIV1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.11.0/24 \
  --availability-zone $AZ1 --query Subnet.SubnetId --output text)
export PRIV2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.20.12.0/24 \
  --availability-zone $AZ2 --query Subnet.SubnetId --output text)

# Public subnets get public IPs on launch
aws ec2 modify-subnet-attribute --subnet-id $PUB1 --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $PUB2 --map-public-ip-on-launch
```

## C.3 — Internet gateway + public route table

```bash
export IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW --vpc-id $VPC_ID

export RT_PUB=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $RT_PUB --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW
aws ec2 associate-route-table --route-table-id $RT_PUB --subnet-id $PUB1
aws ec2 associate-route-table --route-table-id $RT_PUB --subnet-id $PUB2
```

## C.4 — NAT gateway (so Fargate tasks in private subnets can pull the image & reach Secrets Manager)

Fargate needs outbound internet to pull from ECR and read Secrets Manager unless you add
VPC endpoints. A single NAT gateway is the simplest (it costs ~$32/mo + data). The
cheaper alternative is VPC endpoints for ECR/S3/Secrets Manager/CloudWatch — noted at
the end of this section.

```bash
export EIP=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
export NAT=$(aws ec2 create-nat-gateway --subnet-id $PUB1 --allocation-id $EIP \
  --query NatGateway.NatGatewayId --output text)
aws ec2 wait nat-gateway-available --nat-gateway-ids $NAT

export RT_PRIV=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id $RT_PRIV --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT
aws ec2 associate-route-table --route-table-id $RT_PRIV --subnet-id $PRIV1
aws ec2 associate-route-table --route-table-id $RT_PRIV --subnet-id $PRIV2
```

> **Cost-saver alternative:** skip the NAT gateway and instead create interface VPC
> endpoints for `com.amazonaws.$AWS_REGION.ecr.api`, `.ecr.dkr`,
> `.secretsmanager`, `.logs`, plus an S3 **gateway** endpoint (ECR layers live in S3).
> More setup, but no hourly NAT charge. For a first deploy, use the NAT gateway.

## C.5 — Security groups

Three tiers: ALB (open to the world on 80/443), the app (only from the ALB, on 3000),
and RDS (only from the app, on 5432).

```bash
# ALB SG — public ingress
export SG_ALB=$(aws ec2 create-security-group --group-name $APP-alb-sg \
  --description "ALB ingress" --vpc-id $VPC_ID --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_ALB --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG_ALB --protocol tcp --port 443 --cidr 0.0.0.0/0

# App/Fargate SG — only the ALB may reach the container port
export SG_APP=$(aws ec2 create-security-group --group-name $APP-app-sg \
  --description "Fargate tasks" --vpc-id $VPC_ID --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_APP --protocol tcp --port 3000 \
  --source-group $SG_ALB

# RDS SG — only the app may reach Postgres
export SG_DB=$(aws ec2 create-security-group --group-name $APP-db-sg \
  --description "RDS Postgres" --vpc-id $VPC_ID --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG_DB --protocol tcp --port 5432 \
  --source-group $SG_APP
```

> To load the schema from your laptop (Part E) you'll **temporarily** allow your own IP
> to the RDS SG, then revoke it. Don't leave RDS open to `0.0.0.0/0`.

---

# Part D — Provision RDS PostgreSQL

## D.1 — DB subnet group (the private subnets)

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name $APP-db-subnets \
  --db-subnet-group-description "$APP private db subnets" \
  --subnet-ids $PRIV1 $PRIV2
```

## D.2 — Create the instance

`db.t4g.micro` (2 vCPU burstable, ARM, cheapest) is fine for demo/preprod; move to
`db.t4g.small`/`db.m7g.large` for real load. `--no-publicly-accessible` keeps it
private.

```bash
aws rds create-db-instance \
  --db-instance-identifier $APP-db \
  --engine postgres \
  --engine-version 16.4 \
  --db-instance-class db.t4g.micro \
  --allocated-storage 20 \
  --storage-type gp3 \
  --db-name $DB_NAME \
  --master-username $DB_USER \
  --master-user-password "$DB_PASSWORD" \
  --db-subnet-group-name $APP-db-subnets \
  --vpc-security-group-ids $SG_DB \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-publicly-accessible \
  --no-multi-az \
  --tags Key=app,Value=$APP

aws rds wait db-instance-available --db-instance-identifier $APP-db
```

> **Production hardening:** `--multi-az` for failover, `--deletion-protection`,
> `--performance-insights`, a larger `--backup-retention-period`, and consider
> **Aurora Serverless v2 for PostgreSQL** if you want autoscaling capacity (same wire
> protocol; the app doesn't care). For a managed master password, use
> `--manage-master-user-password` and RDS will store it in Secrets Manager for you.

## D.3 — Capture the endpoint and build the connection string

```bash
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier $APP-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)
echo "RDS endpoint: $DB_HOST"

export DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME?sslmode=require"
echo "$DATABASE_URL"
```

`sslmode=require` matters: RDS accepts TLS, and the `pg` `ssl` option in `src/db.ts`
enforces it. Keep this string secret — it goes into Secrets Manager (Part H), never into
git or a URL query string.

---

# Part E — Load schema + seed data into RDS

The DB is private, so run the loader either from your laptop through a **temporary** SG
opening, or from a one-off ECS task / EC2 bastion in the VPC. The laptop route is
fastest for a first load.

## E.1 — Temporarily allow your IP

```bash
export MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id $SG_DB \
  --protocol tcp --port 5432 --cidr ${MY_IP}/32
```

## E.2 — Apply the schema

Option A — the `pg` applier from A.5 (handles the `;`-split exactly like the original):

```bash
DATABASE_URL="$DATABASE_URL" node scripts/apply-schema-pg.mjs
# → "Applied N statements"
```

Option B — raw `psql` (equivalent; `db/init.sql` is idempotent):

```bash
PGPASSWORD="$DB_PASSWORD" psql \
  "host=$DB_HOST port=5432 dbname=$DB_NAME user=$DB_USER sslmode=require" \
  -f db/init.sql
```

## E.3 — Seed the ~142 demo employees

Use your pg-adapted `seed-people.mjs` (A.5) with `DATABASE_URL` set in the env:

```bash
DATABASE_URL="$DATABASE_URL" node scripts/seed-people.mjs
```

## E.4 — Verify, then close your IP

```bash
PGPASSWORD="$DB_PASSWORD" psql \
  "host=$DB_HOST port=5432 dbname=$DB_NAME user=$DB_USER sslmode=require" \
  -c "select count(*) from employees;"

# revoke the temporary access
aws ec2 revoke-security-group-ingress --group-id $SG_DB \
  --protocol tcp --port 5432 --cidr ${MY_IP}/32
```

> **Demo accounts** (from CLAUDE.md): `basic@quorq.com` / `ops@quorq.com` /
> `master@quorq.com`, password `<tier>123`. Confirm they exist after seeding.

---

# Part F — Containerize the app (Dockerfile)

Multi-stage build: install + build in one stage, ship only production deps + the built
output in a slim runtime stage.

```dockerfile
# Dockerfile
# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build           # emits client + SSR server bundle into dist/

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY server.js ./server.js
COPY certs ./certs           # RDS CA bundle (A.6); omit if not verifying the cert
EXPOSE 3000
CMD ["node", "server.js"]
```

```
# .dockerignore
node_modules
dist
.git
.env
.env.local
.dev.vars
*.log
```

Build and smoke-test locally against RDS (with your IP temporarily allowed, or a local
Postgres):

```bash
docker build -t $APP:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_SECRET="$(openssl rand -base64 48)" \
  $APP:local
# open http://localhost:3000
```

> If your Docker host is arm64 (Apple Silicon) but Fargate runs x86_64 (default), build
> for the target arch: `docker buildx build --platform linux/amd64 -t $APP:local .`
> — or set the task's `cpuArchitecture` to `ARM64` (Part I) and keep native arm64.

---

# Part G — Push the image to ECR

```bash
# 1. Create the repo (once)
aws ecr create-repository --repository-name $APP \
  --image-scanning-configuration scanOnPush=true \
  --query repository.repositoryUri --output text
export ECR=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP

# 2. Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 3. Tag & push (use an immutable tag — git SHA — not just :latest)
export TAG=$(git rev-parse --short HEAD)
docker buildx build --platform linux/amd64 -t $ECR:$TAG -t $ECR:latest --push .
```

---

# Part H — Store secrets in Secrets Manager

Create one secret per value. ECS injects them into the task at launch; the app reads
them as `process.env`.

```bash
export DB_SECRET_ARN=$(aws secretsmanager create-secret \
  --name $APP/DATABASE_URL --secret-string "$DATABASE_URL" \
  --query ARN --output text)

export AUTH_SECRET_ARN=$(aws secretsmanager create-secret \
  --name $APP/AUTH_SECRET --secret-string "$(openssl rand -base64 48)" \
  --query ARN --output text)
```

> Rotating `AUTH_SECRET` later logs everyone out (JWTs become invalid). Rotating
> `DATABASE_URL` (e.g. password change) requires a new deployment or task restart to
> pick up the value.

---

# Part I — Deploy on ECS Fargate behind an ALB

## I.1 — IAM roles

**Task execution role** (lets ECS pull the image, read the secrets, write logs):

```bash
cat > /tmp/ecs-trust.json <<'JSON'
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole" } ] }
JSON

export EXEC_ROLE_ARN=$(aws iam create-role --role-name $APP-ecs-exec \
  --assume-role-policy-document file:///tmp/ecs-trust.json \
  --query Role.Arn --output text)

aws iam attach-role-policy --role-name $APP-ecs-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Allow reading exactly the two secrets
cat > /tmp/secrets-policy.json <<JSON
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": "secretsmanager:GetSecretValue",
    "Resource": ["$DB_SECRET_ARN", "$AUTH_SECRET_ARN"] } ] }
JSON
aws iam put-role-policy --role-name $APP-ecs-exec \
  --policy-name $APP-read-secrets --policy-document file:///tmp/secrets-policy.json
```

(A separate **task role** for app-level AWS calls isn't needed — the app only talks to
Postgres. Skip it, or create an empty one.)

## I.2 — CloudWatch log group

```bash
aws logs create-log-group --log-group-name /ecs/$APP
```

## I.3 — ECS cluster

```bash
aws ecs create-cluster --cluster-name $APP-cluster \
  --capacity-providers FARGATE --settings name=containerInsights,value=enabled
```

## I.4 — Task definition

```bash
cat > /tmp/taskdef.json <<JSON
{
  "family": "$APP-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "$ECR:$TAG",
      "essential": true,
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "environment": [
        { "name": "PORT", "value": "3000" },
        { "name": "NODE_ENV", "value": "production" },
        { "name": "APP_VERSION", "value": "$TAG" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "$DB_SECRET_ARN" },
        { "name": "AUTH_SECRET",  "valueFrom": "$AUTH_SECRET_ARN" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$APP",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "web"
        }
      }
    }
  ]
}
JSON

aws ecs register-task-definition --cli-input-json file:///tmp/taskdef.json
```

## I.5 — Application Load Balancer + target group

```bash
export ALB_ARN=$(aws elbv2 create-load-balancer --name $APP-alb \
  --type application --scheme internet-facing \
  --subnets $PUB1 $PUB2 --security-groups $SG_ALB \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

export ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

# Target group of type 'ip' (Fargate awsvpc). Health check hits the app.
export TG_ARN=$(aws elbv2 create-target-group --name $APP-tg \
  --protocol HTTP --port 3000 --vpc-id $VPC_ID --target-type ip \
  --health-check-path / --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
  --matcher HttpCode=200-399 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# HTTP listener (Part J adds HTTPS on 443 and redirects 80→443)
aws elbv2 create-listener --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

> **Health check path:** `/` requires an authenticated session and redirects anonymous
> users to `/login` (a 302), which the `200-399` matcher accepts. If you'd rather have a
> dedicated unauthenticated health route, the app already has health server functions
> in `src/server/health.ts` — expose one at a stable path (e.g. `/api/health`) and point
> `--health-check-path` at it for a cleaner signal.

## I.6 — The ECS service

```bash
cat > /tmp/service.json <<JSON
{
  "cluster": "$APP-cluster",
  "serviceName": "$APP-web",
  "taskDefinition": "$APP-web",
  "desiredCount": 2,
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["$PRIV1", "$PRIV2"],
      "securityGroups": ["$SG_APP"],
      "assignPublicIp": "DISABLED"
    }
  },
  "loadBalancers": [
    { "targetGroupArn": "$TG_ARN", "containerName": "web", "containerPort": 3000 }
  ],
  "healthCheckGracePeriodSeconds": 60,
  "deploymentConfiguration": {
    "minimumHealthyPercent": 100, "maximumPercent": 200
  }
}
JSON

aws ecs create-service --cli-input-json file:///tmp/service.json
aws ecs wait services-stable --cluster $APP-cluster --services $APP-web
```

Test over plain HTTP first:

```bash
curl -I http://$ALB_DNS/          # expect 200 or a 302 to /login
echo "Open: http://$ALB_DNS/"
```

If tasks crash-loop, jump to **Part K** (logs). The most common first-deploy failures
are: wrong `server.js` import path (A.3.2), image built for the wrong CPU arch (Part F),
or the task can't reach Secrets Manager/ECR (missing NAT gateway or VPC endpoints, C.4).

---

# Part J — HTTPS, custom domain (ACM + Route 53)

The app sets auth cookies; serve it over TLS in production.

## J.1 — Request a certificate

```bash
export DOMAIN=quorq.example.com
export CERT_ARN=$(aws acm request-certificate --domain-name $DOMAIN \
  --validation-method DNS --query CertificateArn --output text)
```

Add the CNAME that ACM shows (`aws acm describe-certificate --certificate-arn $CERT_ARN`)
to your DNS. If the domain is in Route 53, create the validation record there; ACM
validates automatically within minutes.

```bash
aws acm wait certificate-validated --certificate-arn $CERT_ARN
```

## J.2 — HTTPS listener + HTTP→HTTPS redirect

```bash
aws elbv2 create-listener --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Change the port-80 listener to redirect to 443 (find its ARN first)
export L80=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN \
  --query "Listeners[?Port==\`80\`].ListenerArn" --output text)
aws elbv2 modify-listener --listener-arn $L80 --port 80 --protocol HTTP \
  --default-actions '[{"Type":"redirect","RedirectConfig":{"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}}]'
```

## J.3 — Point the domain at the ALB (Route 53 alias)

```bash
export HZ=$(aws route53 list-hosted-zones-by-name --dns-name example.com \
  --query 'HostedZones[0].Id' --output text | cut -d/ -f3)
export ALB_ZONE=$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)

cat > /tmp/dns.json <<JSON
{ "Changes": [ { "Action": "UPSERT", "ResourceRecordSet": {
  "Name": "$DOMAIN", "Type": "A",
  "AliasTarget": { "HostedZoneId": "$ALB_ZONE", "DNSName": "$ALB_DNS", "EvaluateTargetHealth": true }
} } ] }
JSON
aws route53 change-resource-record-sets --hosted-zone-id $HZ --change-batch file:///tmp/dns.json
```

Now `https://$DOMAIN` serves the app. Log in with a demo account to confirm the cookie
round-trip works end-to-end over TLS.

---

# Part K — Verify, operate, scale, roll back

**Logs.** Tail the running task:

```bash
aws logs tail /ecs/$APP --follow --format short
```

`src/server/auth.ts` exposes `getAuthDiagnostics`, which reports (booleans only)
whether `AUTH_SECRET` and `DATABASE_URL` are present — handy for confirming the secrets
injected correctly without leaking values.

**Redeploy a new version.** Build+push a new tag, register a new task-def revision with
that image, and update the service (rolling, zero-downtime with the 100/200 config):

```bash
export TAG=$(git rev-parse --short HEAD)
docker buildx build --platform linux/amd64 -t $ECR:$TAG --push .
# edit /tmp/taskdef.json image to $ECR:$TAG, then:
aws ecs register-task-definition --cli-input-json file:///tmp/taskdef.json
aws ecs update-service --cluster $APP-cluster --service $APP-web \
  --task-definition $APP-web --force-new-deployment
```

**Roll back.** Point the service at a previous task-def revision:

```bash
aws ecs update-service --cluster $APP-cluster --service $APP-web \
  --task-definition $APP-web:PREVIOUS_REVISION_NUMBER
```

**Autoscaling** (scale tasks on CPU):

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs --resource-id service/$APP-cluster/$APP-web \
  --scalable-dimension ecs:service:DesiredCount --min-capacity 2 --max-capacity 6

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs --resource-id service/$APP-cluster/$APP-web \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu70 --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration \
  '{"TargetValue":70,"PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"}}'
```

**Connection budget.** Each task's pool (`max: 10` in `src/db.ts`) × task count must stay
under RDS `max_connections` (≈ 87 on `db.t4g.micro`). With 6 tasks × 10 = 60, you're
fine. If you scale higher, lower the pool `max`, bump the instance class, or put
**RDS Proxy** in front of Postgres and point `DATABASE_URL` at the proxy endpoint.

**Backups.** RDS automated backups are on (`--backup-retention-period 7`). Take a manual
snapshot before schema changes: `aws rds create-db-snapshot --db-instance-identifier
$APP-db --db-snapshot-identifier $APP-pre-migration`.

**CI/CD (optional).** A GitHub Actions job that builds, pushes to ECR, and forces a new
deployment on push to `master`:

```yaml
# .github/workflows/deploy.yml
name: deploy
on: { push: { branches: [master] } }
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-oidc-deploy
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |
          TAG=${GITHUB_SHA::7}
          docker buildx build --platform linux/amd64 \
            -t $ECR_URI:$TAG --push .
          aws ecs update-service --cluster quorq-cluster \
            --service quorq-web --force-new-deployment
        env:
          ECR_URI: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/quorq
```

(Set up a GitHub OIDC IAM role rather than long-lived keys.)

---

# Part L — Alternative compute options

You do **not** have to use ECS. The code changes in Part A (pg driver + Node build) are
what matter; the compute is swappable. RDS (Parts C–E) is identical for all of these.

| Option                                  | Best for                                               | Trade-offs                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECS Fargate + ALB** (this guide)      | Production; predictable, scalable, no servers to patch | Most moving parts to set up once                                                                                                                                                                                                                                                                    |
| **AWS App Runner**                      | Fastest path to a URL from a container                 | Point it at the ECR image; it manages TLS, scaling, and the load balancer. Connect to RDS via a **VPC connector** (App Runner → your private subnets → `SG_DB`). Fewer knobs, slightly less control.                                                                                                |
| **Single EC2 + Docker**                 | Cheapest; demos/preprod                                | You patch the OS, run the container (systemd or `docker run`), and terminate TLS yourself (Caddy/nginx or an ALB). Put it in a public subnet with `SG_APP`+`SG_DB` rules; no NAT needed.                                                                                                            |
| **EC2 without Docker**                  | Minimalism                                             | `git pull`, `pnpm install --prod`, `pnpm build`, run `node server.js` under `pm2`/systemd. Same driver/build changes apply.                                                                                                                                                                         |
| **Elastic Beanstalk (Docker platform)** | Managed EC2 with rolling deploys                       | Deploy the same image via a `Dockerrun`/`Dockerfile`; Beanstalk provisions the ALB + ASG. A middle ground between App Runner and raw EC2.                                                                                                                                                           |
| **AWS Amplify Hosting / Lambda**        | Not recommended here                                   | Amplify's SSR compute and Lambda are cold-start and connection-churn hostile to a pooled TCP Postgres, and this app isn't wired for the Lambda adapter. If you must, front RDS with **RDS Proxy** and use a Web-adapter for Lambda — significant extra work for no benefit over Fargate/App Runner. |

**App Runner quick path** (if you choose it): create an `apprunner` service from
`$ECR:$TAG`, set the port to `3000`, add `DATABASE_URL` and `AUTH_SECRET` as secrets
referencing Secrets Manager, and attach a **VPC connector** bound to `$PRIV1/$PRIV2` +
`$SG_APP` so it can reach RDS. App Runner gives you an HTTPS URL immediately and you can
map a custom domain in its console — skipping Parts I and J entirely.

---

# Part M — Teardown / cost notes

**Rough monthly cost of the ECS path** (us-east-1, always-on): RDS `db.t4g.micro`
~$13 + 20 GB gp3 ~$2; ECS Fargate 2× (0.5 vCPU/1 GB) ~$30; ALB ~$16 + LCUs; NAT gateway
~$32 + data. Ballpark **$90–110/mo**. Cut it hard by using App Runner (no NAT, no ALB)
or a single EC2 box, and by scaling the service to `desiredCount: 1` off-hours.

**Teardown** (reverse order to avoid dependency errors):

```bash
aws ecs update-service --cluster $APP-cluster --service $APP-web --desired-count 0
aws ecs delete-service --cluster $APP-cluster --service $APP-web --force
aws ecs delete-cluster --cluster $APP-cluster
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
aws elbv2 delete-target-group --target-group-arn $TG_ARN
aws rds delete-db-instance --db-instance-identifier $APP-db --skip-final-snapshot
aws ecr delete-repository --repository-name $APP --force
aws secretsmanager delete-secret --secret-id $APP/DATABASE_URL --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id $APP/AUTH_SECRET --force-delete-without-recovery
aws ec2 delete-nat-gateway --nat-gateway-id $NAT
# then detach/delete IGW, delete subnets, route tables, security groups, and the VPC
```

---

## Migration checklist (tl;dr)

Part A (code) is **done on branch `aws-rds-deploy`**; Parts B–M are the AWS steps.

- [x] `pnpm add pg @hono/node-server` (+ `@types/pg`); removed Cloudflare/Neon deps
- [x] Replaced `src/db.ts` with the lazy `pg` adapter (A.2) — no server files changed
- [x] Removed Cloudflare + Neon plugins from `vite.config.ts`; added `server.js` Node entry (A.3)
- [x] Confirmed the built server entry is `dist/server/server.js`
- [x] pg-based `apply-schema.mjs` + `db-url.mjs` + seed shim (A.5); `tsc`/`eslint`/`vitest` green
- [ ] VPC, subnets, SGs, NAT (Part C); RDS instance (Part D)
- [ ] Apply schema + seed into RDS over TLS (Part E)
- [ ] Dockerfile builds for `linux/amd64`; runs locally against RDS (Part F)
- [ ] Push image to ECR (Part G); secrets in Secrets Manager (Part H)
- [ ] ECS task def, ALB, target group, service healthy (Part I)
- [ ] ACM cert + Route 53 alias + 80→443 redirect (Part J)
- [ ] Log in with a demo account over `https://` end-to-end

```

```
