# RBAC Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real DB-backed auth with three hierarchical access tiers (basic ⊂ ops ⊂ master), signup-approval flow, tier-gated routes/nav/dashboards, and master/ops admin screens.

**Architecture:** Stateless HS256 JWT in an HttpOnly cookie identifies the user; privileged server functions re-verify the caller's tier from the DB (never trusting the token) so stale tokens confer no privilege. TanStack Start server functions are the only server surface; a pure `tiers.ts` module is the single source of truth for tier rules on both server and client. Routes are guarded in `beforeLoad`, the user rides in router context, and the sidebar/dashboards filter by tier.

**Tech Stack:** TanStack Start 1.168 (server functions, file routes), TanStack Query, Neon Postgres (`@neondatabase/serverless` tagged-template client), zod v4, Web Crypto (PBKDF2 + HMAC — Workers-native, zero new deps), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-rbac-foundation-design.md`

## Global Constraints

- **No new runtime dependencies.** Crypto is Web Crypto only (`crypto.subtle`); bcrypt and JWT libraries are deliberately avoided (Cloudflare Workers compatibility).
- **Package manager is pnpm.** Run commands from the repo root `D:\Projects\quorq-os`.
- **TypeScript is strict with `verbatimModuleSyntax`** — type-only imports MUST use `import type`. `noUnusedLocals`/`noUnusedParameters` are on: don't leave unused imports.
- **zod is v4:** use `z.email()` (top-level), not `z.string().email()`.
- **Server functions:** `createServerFn({ method }).inputValidator(zodSchema).handler(fn)` from `@tanstack/react-start`. Cookie helpers (`getCookie`, `setCookie`, `deleteCookie`) come from `@tanstack/react-start/server`.
- **Import alias:** `#/` maps to `./src/` (e.g. `#/lib/tiers`).
- **Expected-failure contract:** server functions return `{ ok: true, data } | { ok: false, error: string }`. Never throw for expected failures. Unexpected errors are caught, logged with `console.error`, and returned as the exact string `'Something went wrong'`.
- **Exact user-facing copy (from spec):** bad credentials → `Invalid email or password`; pending → `Your account is awaiting approval.`; rejected → `Your signup request was declined.`; duplicate email → `An account with this email already exists`.
- **Tier values:** exactly `'basic' | 'ops' | 'master'`. Status values: exactly `'pending' | 'active' | 'rejected'`.
- **Session cookie name:** `quorq_session`. Token TTL: 24 hours. PBKDF2: SHA-256, 100000 iterations, 16-byte salt, 256-bit output, stored as `salt:iterations:hash` with base64 fields.
- **Styling:** match the existing Tailwind idiom (slate neutrals, blue-600 primary, `rounded-lg`/`rounded-xl` cards). Copy class strings from neighboring code, don't invent a new look.
- **After adding/removing route files**, run `pnpm generate-routes` to regenerate `src/routeTree.gen.ts` before typechecking. Never hand-edit `src/routeTree.gen.ts`.
- **Commit after every task.** Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Map

| File | Responsibility |
|---|---|
| `src/lib/tiers.ts` (new) | Tier type, rank map, `hasTier`, `canSetTier` — pure, shared client/server |
| `src/lib/tiers.test.ts` (new) | Unit tests for tier rules |
| `src/lib/guards.ts` (new) | `requireTier` route-guard helper (throws redirect) |
| `src/server/password.ts` (new) | PBKDF2 hash/verify |
| `src/server/password.test.ts` (new) | Unit tests |
| `src/server/jwt.ts` (new) | HS256 JWT sign/verify |
| `src/server/jwt.test.ts` (new) | Unit tests |
| `src/server/auth.ts` (new) | `signup`, `login`, `logout`, `getCurrentUser` server fns; `AuthUser`, `Result<T>` types |
| `src/server/admin.ts` (new) | `listUsers`, `approveUser`, `rejectUser`, `setUserTier`, `getUserStats` server fns |
| `db/init.sql` (modify) | Add idempotent `users` schema + seed accounts; make todos seed idempotent |
| `scripts/hash-password.mjs` (new) | CLI: print PBKDF2 hash for a password (for seeds) |
| `scripts/apply-schema.mjs` (new) | Run `db/init.sql` against `DATABASE_URL` from `.env.local` |
| `vitest.config.ts` (new) | Test config (node env, `#/` alias) |
| `.dev.vars` (new, gitignored) | Local `AUTH_SECRET` |
| `src/routes/signup.tsx` (modify) | Wire to `signup` fn; drop phone/dob; pending-approval success state |
| `src/routes/login.tsx` (modify) | Wire to `login` fn; tier demo accounts; inverse guard |
| `src/routes/_app.tsx` (modify) | Auth guard in `beforeLoad`; user into router context |
| `src/routes/_app/home.tsx` (modify) | `denied` search param + banner, greeting, logout, stacked tier dashboards |
| `src/routes/_app/admin/requests.tsx` (new) | Master-only pending-signup approval screen |
| `src/routes/_app/admin/users.tsx` (new) | Ops+ user list with tier dropdown |
| `src/components/AppSidebar.tsx` (modify) | `minTier` filtering, Administration section, real user profile block |
| `src/components/dashboards/styles.ts` (new) | Shared card class strings |
| `src/components/dashboards/BasicDashboard.tsx` (new) | Existing home cards, extracted |
| `src/components/dashboards/OpsDashboard.tsx` (new) | Static ops panels |
| `src/components/dashboards/MasterDashboard.tsx` (new) | Real-count admin stat tiles |

---

### Task 1: Vitest config + tier helpers

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/tiers.ts`
- Test: `src/lib/tiers.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `TIERS: readonly ['basic','ops','master']`, `type Tier = 'basic'|'ops'|'master'`, `TIER_RANK: Record<Tier, number>`, `hasTier(userTier: Tier, minTier: Tier): boolean`, `canSetTier(callerTier: Tier, targetCurrentTier: Tier, newTier: Tier): boolean`. Every later task imports from `#/lib/tiers`.

- [ ] **Step 1: Create the vitest config**

The app's `vite.config.ts` loads Cloudflare/devtools plugins that must not run under vitest, so tests get their own config (vitest prefers `vitest.config.ts` over `vite.config.ts` automatically).

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TIER_RANK, canSetTier, hasTier } from './tiers'
import type { Tier } from './tiers'

describe('TIER_RANK', () => {
  it('orders basic < ops < master', () => {
    expect(TIER_RANK.basic).toBeLessThan(TIER_RANK.ops)
    expect(TIER_RANK.ops).toBeLessThan(TIER_RANK.master)
  })
})

describe('hasTier', () => {
  const cases: Array<[Tier, Tier, boolean]> = [
    ['basic', 'basic', true],
    ['basic', 'ops', false],
    ['basic', 'master', false],
    ['ops', 'basic', true],
    ['ops', 'ops', true],
    ['ops', 'master', false],
    ['master', 'basic', true],
    ['master', 'ops', true],
    ['master', 'master', true],
  ]
  it.each(cases)('hasTier(%s, %s) -> %s', (user, min, expected) => {
    expect(hasTier(user, min)).toBe(expected)
  })
})

describe('canSetTier', () => {
  it('denies basic callers entirely', () => {
    expect(canSetTier('basic', 'basic', 'ops')).toBe(false)
  })
  it('lets ops move users between basic and ops', () => {
    expect(canSetTier('ops', 'basic', 'ops')).toBe(true)
    expect(canSetTier('ops', 'ops', 'basic')).toBe(true)
  })
  it('blocks ops from granting master', () => {
    expect(canSetTier('ops', 'basic', 'master')).toBe(false)
    expect(canSetTier('ops', 'ops', 'master')).toBe(false)
  })
  it('blocks ops from revoking master', () => {
    expect(canSetTier('ops', 'master', 'basic')).toBe(false)
    expect(canSetTier('ops', 'master', 'ops')).toBe(false)
  })
  it('lets master set any tier', () => {
    expect(canSetTier('master', 'basic', 'master')).toBe(true)
    expect(canSetTier('master', 'master', 'basic')).toBe(true)
    expect(canSetTier('master', 'ops', 'ops')).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/tiers.test.ts`
Expected: FAIL — cannot resolve `./tiers` (module does not exist yet).

- [ ] **Step 4: Implement the tier module**

Create `src/lib/tiers.ts`:

```ts
export const TIERS = ['basic', 'ops', 'master'] as const

export type Tier = (typeof TIERS)[number]

export const TIER_RANK: Record<Tier, number> = {
  basic: 1,
  ops: 2,
  master: 3,
}

export function hasTier(userTier: Tier, minTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[minTier]
}

// Ops may shuffle users between basic and ops; only master may grant
// or revoke master access.
export function canSetTier(
  callerTier: Tier,
  targetCurrentTier: Tier,
  newTier: Tier,
): boolean {
  if (!hasTier(callerTier, 'ops')) return false
  if (callerTier === 'master') return true
  return targetCurrentTier !== 'master' && newTier !== 'master'
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/tiers.test.ts`
Expected: PASS — 15 tests (1 rank + 9 hasTier + 5 canSetTier).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/tiers.ts src/lib/tiers.test.ts
git commit -m "feat: add tier model with rank helpers and vitest config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Password hashing (PBKDF2)

**Files:**
- Create: `src/server/password.ts`
- Test: `src/server/password.test.ts`

**Interfaces:**
- Consumes: Web Crypto globals only.
- Produces: `hashPassword(password: string): Promise<string>` (returns `salt:iterations:hash`, base64 fields) and `verifyPassword(password: string, stored: string): Promise<boolean>`. Used by Task 5 (`auth.ts`) and mirrored by Task 4's seed script.

- [ ] **Step 1: Write the failing tests**

Create `src/server/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword('wrong password', stored)).toBe(false)
  })

  it('produces a distinct salt (and hash) each call', async () => {
    const a = await hashPassword('same input')
    const b = await hashPassword('same input')
    expect(a).not.toBe(b)
  })

  it('stores salt:iterations:hash with 100000 iterations', async () => {
    const stored = await hashPassword('anything at all')
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[1]).toBe('100000')
  })

  it('rejects malformed stored values instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-valid-format')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/password.test.ts`
Expected: FAIL — cannot resolve `./password`.

- [ ] **Step 3: Implement**

Create `src/server/password.ts`:

```ts
const ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BITS = 256

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return `${toBase64(salt)}:${ITERATIONS}:${toBase64(hash)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltB64, iterationsRaw, hashB64] = stored.split(':')
  const iterations = Number(iterationsRaw)
  if (!saltB64 || !hashB64 || !Number.isInteger(iterations) || iterations <= 0) {
    return false
  }
  let expected: Uint8Array
  let salt: Uint8Array
  try {
    expected = fromBase64(hashB64)
    salt = fromBase64(saltB64)
  } catch {
    return false
  }
  const actual = await derive(password, salt, iterations)
  if (actual.length !== expected.length) return false
  // Constant-time comparison
  let diff = 0
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i]
  }
  return diff === 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/password.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/password.ts src/server/password.test.ts
git commit -m "feat: add PBKDF2 password hashing via Web Crypto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: JWT sign/verify

**Files:**
- Create: `src/server/jwt.ts`
- Test: `src/server/jwt.test.ts`

**Interfaces:**
- Consumes: `TIERS` from `#/lib/tiers` (Task 1); Web Crypto.
- Produces: `type TokenPayload = { sub: number; email: string; name: string; tier: Tier; exp: number }` (exp = unix seconds), `signToken(payload: TokenPayload, secret: string): Promise<string>`, `verifyToken(token: string, secret: string): Promise<TokenPayload | null>`. Used by Tasks 5 and 9.

- [ ] **Step 1: Write the failing tests**

Create `src/server/jwt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { signToken, verifyToken } from './jwt'
import type { TokenPayload } from './jwt'

const SECRET = 'test-secret'

function payload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    sub: 42,
    email: 'user@example.com',
    name: 'Test User',
    tier: 'ops',
    exp: Math.floor(Date.now() / 1000) + 60,
    ...overrides,
  }
}

describe('jwt', () => {
  it('round-trips a valid token', async () => {
    const original = payload()
    const token = await signToken(original, SECRET)
    expect(await verifyToken(token, SECRET)).toEqual(original)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken(payload(), 'other-secret')
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signToken(
      payload({ exp: Math.floor(Date.now() / 1000) - 10 }),
      SECRET,
    )
    expect(await verifyToken(token, SECRET)).toBeNull()
  })

  it('rejects a token whose payload was swapped (tier escalation)', async () => {
    const honest = await signToken(payload({ tier: 'basic' }), SECRET)
    const forgedBody = (await signToken(payload({ tier: 'master' }), SECRET))
      .split('.')[1]
    const [header, , signature] = honest.split('.')
    const forged = `${header}.${forgedBody}.${signature}`
    expect(await verifyToken(forged, SECRET)).toBeNull()
  })

  it('rejects garbage input', async () => {
    expect(await verifyToken('not-a-token', SECRET)).toBeNull()
    expect(await verifyToken('a.b.c', SECRET)).toBeNull()
    expect(await verifyToken('', SECRET)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/server/jwt.test.ts`
Expected: FAIL — cannot resolve `./jwt`.

- [ ] **Step 3: Implement**

Create `src/server/jwt.ts`:

```ts
import { z } from 'zod'
import { TIERS } from '#/lib/tiers'

const PayloadSchema = z.object({
  sub: z.number(),
  email: z.string(),
  name: z.string(),
  tier: z.enum(TIERS),
  exp: z.number(),
})

export type TokenPayload = z.infer<typeof PayloadSchema>

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signToken(
  payload: TokenPayload,
  secret: string,
): Promise<string> {
  const header = b64urlEncode(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  )
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await getKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${header}.${body}`),
  )
  return `${header}.${body}.${b64urlEncode(new Uint8Array(signature))}`
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const key = await getKey(secret)
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(signature),
      encoder.encode(`${header}.${body}`),
    )
  } catch {
    return null
  }
  if (!valid) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
  } catch {
    return null
  }
  const result = PayloadSchema.safeParse(parsed)
  if (!result.success) return null
  if (result.data.exp <= Math.floor(Date.now() / 1000)) return null
  return result.data
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/server/jwt.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS — 25 tests across 3 files.

- [ ] **Step 6: Commit**

```bash
git add src/server/jwt.ts src/server/jwt.test.ts
git commit -m "feat: add HS256 JWT sign/verify via Web Crypto

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: DB schema, seed accounts, and AUTH_SECRET

**Files:**
- Modify: `db/init.sql`
- Create: `scripts/hash-password.mjs`
- Create: `scripts/apply-schema.mjs`
- Create: `.dev.vars`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `.env.local` must already contain `DATABASE_URL` (provisioned by the neon vite plugin). If it doesn't, run `pnpm dev` once to provision, then stop it.
- Produces: `users` table matching the spec; three active seed accounts (`basic@quorq.com`/`basic123` tier basic, `ops@quorq.com`/`ops123` tier ops, `master@quorq.com`/`master123` tier master); `AUTH_SECRET` available as `process.env.AUTH_SECRET` in dev (via `.dev.vars`, which the Cloudflare vite plugin loads and `nodejs_compat` exposes on `process.env`).

- [ ] **Step 1: Create the hash CLI**

Create `scripts/hash-password.mjs` (same algorithm/format as `src/server/password.ts`):

```js
// usage: node scripts/hash-password.mjs <password>
const password = process.argv[2]
if (!password) {
  console.error('usage: node scripts/hash-password.mjs <password>')
  process.exit(1)
}

const ITERATIONS = 100_000
const encoder = new TextEncoder()
const toBase64 = (bytes) => Buffer.from(bytes).toString('base64')

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey(
  'raw',
  encoder.encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
)
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  256,
)
console.log(`${toBase64(salt)}:${ITERATIONS}:${toBase64(new Uint8Array(bits))}`)
```

- [ ] **Step 2: Generate the three seed hashes**

Run each and capture the output line (they will differ every run — that's correct):

```bash
node scripts/hash-password.mjs basic123
node scripts/hash-password.mjs ops123
node scripts/hash-password.mjs master123
```

Expected: each prints one line shaped like `A1b2...==:100000:C3d4...=`.

- [ ] **Step 3: Rewrite `db/init.sql` (idempotent, with users)**

Replace the entire file. Substitute `HASH_BASIC`, `HASH_OPS`, `HASH_MASTER` with the three lines captured in Step 2:

```sql
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
    ('basic@quorq.com', 'Basic Demo', 'HASH_BASIC', 'basic', 'active'),
    ('ops@quorq.com', 'Ops Demo', 'HASH_OPS', 'ops', 'active'),
    ('master@quorq.com', 'Master Demo', 'HASH_MASTER', 'master', 'active')
ON CONFLICT (email) DO NOTHING;
```

- [ ] **Step 4: Create the apply script**

The neon vite plugin only seeds `db/init.sql` when it first provisions a database, so existing databases need this applied manually. Create `scripts/apply-schema.mjs`:

```js
// Applies db/init.sql to the DATABASE_URL in .env.local.
// Statements are ';'-separated; init.sql keeps semicolons out of literals.
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const env = readFileSync('.env.local', 'utf8')
const match = env.match(/^DATABASE_URL=(.+)$/m)
if (!match) {
  console.error('DATABASE_URL not found in .env.local')
  process.exit(1)
}
const sql = neon(match[1].trim())

const script = readFileSync('db/init.sql', 'utf8')
const statements = script
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

for (const statement of statements) {
  await sql.query(statement)
}
console.log(`Applied ${statements.length} statements`)
```

- [ ] **Step 5: Apply and verify**

```bash
node scripts/apply-schema.mjs
```

Expected: `Applied 4 statements`.

```bash
node --input-type=module -e "import { neon } from '@neondatabase/serverless'; import { readFileSync } from 'node:fs'; const url = readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim(); const sql = neon(url); console.log(await sql\`SELECT email, tier, status FROM users ORDER BY id\`)"
```

Expected: three rows — basic/ops/master @quorq.com, statuses all `active`.

- [ ] **Step 6: Configure AUTH_SECRET**

Create `.dev.vars`:

```
AUTH_SECRET=dev-only-secret-do-not-use-in-production
```

Append `.dev.vars` to `.gitignore` (it holds secrets; `*.local` does not cover it):

```
.dev.vars
```

Note for production (no action now): set the real secret with `wrangler secret put AUTH_SECRET`.

- [ ] **Step 7: Commit**

```bash
git add db/init.sql scripts/hash-password.mjs scripts/apply-schema.mjs .gitignore
git commit -m "feat: add users schema, seed tier accounts, and schema scripts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`.dev.vars` must NOT be committed — verify with `git status` that it shows as ignored.)

---

### Task 5: Auth server functions

**Files:**
- Create: `src/server/auth.ts`

**Interfaces:**
- Consumes: `getClient` from `#/db` (returns neon tagged-template client or `undefined`); `hashPassword`/`verifyPassword` (Task 2); `signToken`/`verifyToken` (Task 3); `Tier` (Task 1).
- Produces (used by every later task):
  - `SESSION_COOKIE = 'quorq_session'`, `getAuthSecret(): string`
  - `interface AuthUser { id: number; email: string; name: string; tier: Tier }`
  - `type Result<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `signup({ data: { name, email, password } })` → `Result<null>`
  - `login({ data: { email, password } })` → `Result<AuthUser>` (sets cookie)
  - `logout()` → `Result<null>` (clears cookie)
  - `getCurrentUser()` → `AuthUser | null`

No unit tests here: the interesting logic (hashing, JWT, tiers) is already covered; these functions are thin DB/cookie glue, verified by typecheck now and the smoke test in Task 14.

- [ ] **Step 1: Implement**

Create `src/server/auth.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { getClient } from '#/db'
import { hashPassword, verifyPassword } from '#/server/password'
import { signToken, verifyToken } from '#/server/jwt'
import type { Tier } from '#/lib/tiers'

export const SESSION_COOKIE = 'quorq_session'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 // 24h — spec'd staleness bound

export interface AuthUser {
  id: number
  email: string
  name: string
  tier: Tier
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

const GENERIC_ERROR = 'Something went wrong'

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return secret
}

export const signup = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      email: z.email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const email = data.email.toLowerCase()
      const existing = await sql`SELECT id FROM users WHERE email = ${email}`
      if (existing.length > 0) {
        return {
          ok: false,
          error: 'An account with this email already exists',
        }
      }
      const passwordHash = await hashPassword(data.password)
      await sql`
        INSERT INTO users (email, name, password_hash)
        VALUES (${email}, ${data.name}, ${passwordHash})
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('signup failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const login = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.email(),
      password: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<Result<AuthUser>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const rows = await sql`
        SELECT id, email, name, password_hash, tier, status
        FROM users
        WHERE email = ${data.email.toLowerCase()}
      `
      const row = rows[0] as
        | {
            id: number
            email: string
            name: string
            password_hash: string
            tier: Tier
            status: string
          }
        | undefined
      if (!row || !(await verifyPassword(data.password, row.password_hash))) {
        return { ok: false, error: 'Invalid email or password' }
      }
      if (row.status === 'pending') {
        return { ok: false, error: 'Your account is awaiting approval.' }
      }
      if (row.status === 'rejected') {
        return { ok: false, error: 'Your signup request was declined.' }
      }
      const user: AuthUser = {
        id: row.id,
        email: row.email,
        name: row.name,
        tier: row.tier,
      }
      const token = await signToken(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
        },
        getAuthSecret(),
      )
      setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: TOKEN_TTL_SECONDS,
      })
      return { ok: true, data: user }
    } catch (error) {
      console.error('login failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const logout = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Result<null>> => {
    deleteCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true, data: null }
  },
)

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthUser | null> => {
    const token = getCookie(SESSION_COOKIE)
    if (!token) return null
    const payload = await verifyToken(token, getAuthSecret())
    if (!payload) return null
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier,
    }
  },
)
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `src/server/auth.ts` (if unrelated pre-existing errors appear elsewhere, note them but only fix files this plan touches).

- [ ] **Step 3: Commit**

```bash
git add src/server/auth.ts
git commit -m "feat: add signup/login/logout/getCurrentUser server functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Signup page wiring

**Files:**
- Modify: `src/routes/signup.tsx`

**Interfaces:**
- Consumes: `signup`, `getCurrentUser` from `#/server/auth` (Task 5).
- Produces: working signup UX — pending-approval success panel; inverse guard (authenticated users are redirected to `/home`).

Changes to the existing file: drop the `phone` and `dob` fields (the spec's users table has no such columns; employee profiles arrive in sub-project 2), submit `firstName + lastName` as `name`, add a server-error banner and a success state, and add the inverse guard.

- [ ] **Step 1: Rewire the route and form**

In `src/routes/signup.tsx`:

1. Update imports — add `redirect`, the server functions, `useState`, and the success icon:

```ts
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { UserPlus, Loader2, MailCheck } from 'lucide-react'
import { z } from 'zod'
import BrandPanel from '#/components/BrandPanel'
import { getCurrentUser, signup } from '#/server/auth'
```

2. Replace the route definition:

```ts
export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: '/home' })
  },
  component: SignupPage,
})
```

3. Inside `SignupPage`, add state above the `useForm` call, remove the `phone` and `dob` entries from `defaultValues`, and replace `onSubmit`:

```ts
const [serverError, setServerError] = useState('')
const [submitted, setSubmitted] = useState(false)

const form = useForm({
  defaultValues: {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  },
  onSubmit: async ({ value }) => {
    setServerError('')
    const res = await signup({
      data: {
        name: `${value.firstName} ${value.lastName}`.trim(),
        email: value.email,
        password: value.password,
      },
    })
    if (!res.ok) {
      setServerError(res.error)
      return
    }
    setSubmitted(true)
  },
})
```

4. Delete the two `<form.Field name="phone">` and `<form.Field name="dob">` blocks entirely (and the now-unused `today` const at module top if nothing else references it).

5. Add a success panel: immediately after `<BrandPanel />`'s sibling `<div className="flex w-full items-center justify-center p-6 lg:w-1/2">` opens, render conditionally. Replace `<div className="w-full max-w-sm py-8">` content wrapper so the panel body becomes:

```tsx
{submitted ? (
  <div className="w-full max-w-sm py-8 text-center">
    <MailCheck className="mx-auto text-emerald-500" size={48} />
    <h1 className="mt-4 text-2xl font-bold text-slate-900">
      Request submitted
    </h1>
    <p className="mt-2 text-sm text-slate-500">
      A master admin must approve your account. You can sign in once
      it&apos;s approved.
    </p>
    <a
      href="/login"
      className="mt-6 inline-block text-sm text-blue-500 hover:underline"
    >
      Back to sign in
    </a>
  </div>
) : (
  <div className="w-full max-w-sm py-8">
    {/* existing heading, form, and footer links stay here unchanged */}
  </div>
)}
```

6. Show the server error inside the form, directly above the submit button's `<form.Subscribe>`:

```tsx
{serverError ? (
  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
    {serverError}
  </div>
) : null}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `src/routes/signup.tsx` (watch for `noUnusedLocals` — the `today` const must be gone if the dob field was the only user).

- [ ] **Step 3: Commit**

```bash
git add src/routes/signup.tsx
git commit -m "feat: wire signup to server function with pending-approval flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Login page wiring

**Files:**
- Modify: `src/routes/login.tsx`

**Interfaces:**
- Consumes: `login`, `getCurrentUser` from `#/server/auth` (Task 5).
- Produces: working login that sets the session cookie and lands on `/home`; three tier demo quick-fill buttons; inverse guard.

- [ ] **Step 1: Rewire the page**

In `src/routes/login.tsx`:

1. Imports:

```ts
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import BrandPanel from '#/components/BrandPanel'
import { getCurrentUser, login } from '#/server/auth'
```

(The unused `ShieldCheck` import goes away.)

2. Route definition (uncomment/replace the stub):

```ts
export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: '/home' })
  },
  component: LoginPage,
})
```

3. Replace the demo accounts and initial state:

```ts
const demoAccounts = [
  { tier: 'basic', email: 'basic@quorq.com', password: 'basic123' },
  { tier: 'ops', email: 'ops@quorq.com', password: 'ops123' },
  { tier: 'master', email: 'master@quorq.com', password: 'master123' },
] as const
```

```ts
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
```

4. Replace `submit`:

```ts
async function submit(e: React.FormEvent) {
  e.preventDefault()
  setBusy(true)
  setError('')
  const res = await login({ data: { email, password } })
  setBusy(false)
  if (!res.ok) {
    setError(res.error)
    return
  }
  void navigate({ to: '/home' })
}
```

5. Add demo quick-fill buttons directly under the closing `</form>` tag:

```tsx
<div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
  <div className="text-xs font-medium text-slate-500">Demo accounts</div>
  <div className="mt-2 flex gap-2">
    {demoAccounts.map((account) => (
      <button
        key={account.tier}
        type="button"
        onClick={() => {
          setEmail(account.email)
          setPassword(account.password)
        }}
        className="flex-1 rounded-md border border-slate-200 py-1.5 text-xs font-medium capitalize text-slate-600 hover:bg-slate-50"
      >
        {account.tier}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `src/routes/login.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/login.tsx
git commit -m "feat: wire login to JWT auth with tier demo accounts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: App layout auth guard + router context

**Files:**
- Modify: `src/routes/_app.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` (Task 5).
- Produces: every `/_app/*` route receives `context.user: AuthUser` (typed automatically through the route tree). Unauthenticated visitors are redirected to `/login`. Components access it via `Route.useRouteContext()` (route files) or `useRouteContext({ from: '/_app' })` (shared components).

- [ ] **Step 1: Add the guard**

In `src/routes/_app.tsx`, update the imports and route definition (component code unchanged):

```ts
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo, SidebarNav } from '#/components/AppSidebar'
import { getCurrentUser } from '#/server/auth'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: AppLayout,
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_app.tsx
git commit -m "feat: require authentication for app routes, expose user in context

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Admin server functions

**Files:**
- Create: `src/server/admin.ts`

**Interfaces:**
- Consumes: `getClient` from `#/db`; `verifyToken` (Task 3); `SESSION_COOKIE`, `getAuthSecret`, `Result` (Task 5); `TIERS`, `canSetTier`, `hasTier`, `Tier` (Task 1).
- Produces (used by Tasks 10, 11, 13):
  - `interface AdminUser { id: number; email: string; name: string; tier: Tier; status: 'pending' | 'active' | 'rejected'; createdAt: string }`
  - `interface UserStats { pending: number; byTier: Record<Tier, number> }`
  - `listUsers()` → `Result<Array<AdminUser>>` (ops+)
  - `approveUser({ data: { userId } })` / `rejectUser({ data: { userId } })` → `Result<null>` (master)
  - `setUserTier({ data: { userId, tier } })` → `Result<null>` (ops+, `canSetTier` rules, no self-change)
  - `getUserStats()` → `Result<UserStats>` (master)

The authorization rules themselves (`canSetTier`, `hasTier`) are unit-tested in Task 1; these functions are glue that applies them and are exercised in the Task 14 smoke test.

- [ ] **Step 1: Implement**

Create `src/server/admin.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getClient } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import { TIERS, canSetTier, hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { Result } from '#/server/auth'

export interface AdminUser {
  id: number
  email: string
  name: string
  tier: Tier
  status: 'pending' | 'active' | 'rejected'
  createdAt: string
}

export interface UserStats {
  pending: number
  byTier: Record<Tier, number>
}

const GENERIC_ERROR = 'Something went wrong'
const FORBIDDEN = 'You do not have access to perform this action'

type Sql = NonNullable<Awaited<ReturnType<typeof getClient>>>

// Authorization reads the DB, not the token: a stale token must never
// retain privileges after a tier change or deactivation.
async function getCaller(
  sql: Sql,
  minTier: Tier,
): Promise<{ id: number; tier: Tier } | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifyToken(token, getAuthSecret())
  if (!payload) return null
  const rows = await sql`
    SELECT id, tier, status FROM users WHERE id = ${payload.sub}
  `
  const row = rows[0] as
    | { id: number; tier: Tier; status: string }
    | undefined
  if (!row || row.status !== 'active' || !hasTier(row.tier, minTier)) {
    return null
  }
  return { id: row.id, tier: row.tier }
}

export const listUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<Array<AdminUser>>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT id, email, name, tier, status, created_at
        FROM users
        ORDER BY created_at DESC
      `
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id as number,
          email: row.email as string,
          name: row.name as string,
          tier: row.tier as Tier,
          status: row.status as AdminUser['status'],
          createdAt: String(row.created_at),
        })),
      }
    } catch (error) {
      console.error('listUsers failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)

const UserIdSchema = z.object({ userId: z.number() })

async function setPendingStatus(
  userId: number,
  status: 'active' | 'rejected',
): Promise<Result<null>> {
  try {
    const sql = await getClient()
    if (!sql) return { ok: false, error: GENERIC_ERROR }
    const caller = await getCaller(sql, 'master')
    if (!caller) return { ok: false, error: FORBIDDEN }
    const updated = await sql`
      UPDATE users
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId} AND status = 'pending'
      RETURNING id
    `
    if (updated.length === 0) {
      return { ok: false, error: 'Request not found or already handled' }
    }
    return { ok: true, data: null }
  } catch (error) {
    console.error('setPendingStatus failed', error)
    return { ok: false, error: GENERIC_ERROR }
  }
}

export const approveUser = createServerFn({ method: 'POST' })
  .inputValidator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'active'))

export const rejectUser = createServerFn({ method: 'POST' })
  .inputValidator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'rejected'))

export const setUserTier = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.number(), tier: z.enum(TIERS) }))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      if (caller.id === data.userId) {
        return { ok: false, error: 'You cannot change your own tier' }
      }
      const rows = await sql`
        SELECT tier FROM users WHERE id = ${data.userId}
      `
      const target = rows[0] as { tier: Tier } | undefined
      if (!target) return { ok: false, error: 'User not found' }
      if (!canSetTier(caller.tier, target.tier, data.tier)) {
        return {
          ok: false,
          error: 'Only a master can grant or revoke master access',
        }
      }
      await sql`
        UPDATE users
        SET tier = ${data.tier}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.userId}
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('setUserTier failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const getUserStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<UserStats>> => {
    try {
      const sql = await getClient()
      if (!sql) return { ok: false, error: GENERIC_ERROR }
      const caller = await getCaller(sql, 'master')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT tier, status, COUNT(*)::int AS count
        FROM users
        GROUP BY tier, status
      `
      const stats: UserStats = {
        pending: 0,
        byTier: { basic: 0, ops: 0, master: 0 },
      }
      for (const row of rows) {
        if (row.status === 'pending') stats.pending += row.count as number
        if (row.status === 'active') {
          stats.byTier[row.tier as Tier] += row.count as number
        }
      }
      return { ok: true, data: stats }
    } catch (error) {
      console.error('getUserStats failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/admin.ts
git commit -m "feat: add tier-enforced admin server functions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Tier guard + User Requests screen (master)

**Files:**
- Create: `src/lib/guards.ts`
- Modify: `src/routes/_app/home.tsx` (route options only — add `validateSearch`)
- Create: `src/routes/_app/admin/requests.tsx`

**Interfaces:**
- Consumes: `hasTier`, `Tier` (Task 1); `AuthUser` (Task 5); `listUsers`, `approveUser`, `rejectUser`, `AdminUser` (Task 9); `context.user` (Task 8).
- Produces: `requireTier(user: AuthUser, minTier: Tier): void` — throws `redirect({ to: '/home', search: { denied: '1' } })` when the tier is insufficient. `/home` accepts an optional `denied: '1'` search param. Route `/admin/requests` exists (Task 12 links to it).

- [ ] **Step 1: Create the guard helper**

Create `src/lib/guards.ts`:

```ts
import { redirect } from '@tanstack/react-router'
import { hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { AuthUser } from '#/server/auth'

export function requireTier(user: AuthUser, minTier: Tier): void {
  if (!hasTier(user.tier, minTier)) {
    throw redirect({ to: '/home', search: { denied: '1' } })
  }
}
```

- [ ] **Step 2: Teach `/home` the `denied` search param**

In `src/routes/_app/home.tsx`, change only the route definition (the banner UI arrives in Task 13):

```ts
export const Route = createFileRoute('/_app/home')({
  validateSearch: (search: Record<string, unknown>) => ({
    denied: search.denied === '1' ? ('1' as const) : undefined,
  }),
  component: HomePage,
})
```

- [ ] **Step 3: Create the requests screen**

Create `src/routes/_app/admin/requests.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, Loader2, X } from 'lucide-react'
import { approveUser, listUsers, rejectUser } from '#/server/admin'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/admin/requests')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'master')
  },
  component: RequestsPage,
})

function RequestsPage() {
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const approve = useMutation({
    mutationFn: (userId: number) => approveUser({ data: { userId } }),
    onSuccess: invalidate,
  })
  const reject = useMutation({
    mutationFn: (userId: number) => rejectUser({ data: { userId } }),
    onSuccess: invalidate,
  })

  const pending =
    usersQuery.data?.filter((user) => user.status === 'pending') ?? []
  const actionError = [approve.data, reject.data].find(
    (result) => result && !result.ok,
  )

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-slate-800">User Requests</h1>
      <p className="mt-1 text-sm text-slate-500">
        Approve or decline signup requests. Approved users join with the
        basic tier.
      </p>

      {usersQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {usersQuery.error.message}
        </div>
      ) : null}
      {actionError && !actionError.ok ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError.error}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <Inbox className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">No pending requests.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((user) => (
                <tr key={user.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve.mutate(user.id)}
                        disabled={approve.isPending || reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => reject.mutate(user.id)}
                        disabled={approve.isPending || reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Regenerate routes and typecheck**

Run: `pnpm generate-routes`
Expected: `src/routeTree.gen.ts` now includes `/_app/admin/requests`.

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guards.ts src/routes/_app/home.tsx src/routes/_app/admin/requests.tsx src/routeTree.gen.ts
git commit -m "feat: add tier route guard and master-only user requests screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: User Management screen (ops+)

**Files:**
- Create: `src/routes/_app/admin/users.tsx`

**Interfaces:**
- Consumes: `requireTier` (Task 10); `listUsers`, `setUserTier` (Task 9); `TIERS`, `canSetTier` (Task 1); `context.user` (Task 8).
- Produces: route `/admin/users` (Task 12 links to it).

- [ ] **Step 1: Create the screen**

Create `src/routes/_app/admin/users.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { listUsers, setUserTier } from '#/server/admin'
import { requireTier } from '#/lib/guards'
import { TIERS, canSetTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/admin/users')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'ops')
  },
  component: UsersPage,
})

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
}

function UsersPage() {
  const { user: caller } = Route.useRouteContext()
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const tierMutation = useMutation({
    mutationFn: (vars: { userId: number; tier: Tier }) =>
      setUserTier({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const mutationError =
    tierMutation.data && !tierMutation.data.ok ? tierMutation.data.error : ''

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-slate-800">User Management</h1>
      <p className="mt-1 text-sm text-slate-500">
        Assign access tiers. Only a master can grant or revoke master access.
      </p>

      {usersQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {usersQuery.error.message}
        </div>
      ) : null}
      {mutationError ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {mutationError}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((user) => {
                const isSelf = user.id === caller.id
                const canEdit =
                  !isSelf &&
                  user.status === 'active' &&
                  TIERS.some(
                    (tier) =>
                      tier !== user.tier &&
                      canSetTier(caller.tier, user.tier, tier),
                  )
                return (
                  <tr key={user.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {user.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-slate-400">
                          (you)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.tier}
                        disabled={!canEdit || tierMutation.isPending}
                        onChange={(e) =>
                          tierMutation.mutate({
                            userId: user.id,
                            tier: e.target.value as Tier,
                          })
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {TIERS.map((tier) => (
                          <option
                            key={tier}
                            value={tier}
                            disabled={
                              tier !== user.tier &&
                              !canSetTier(caller.tier, user.tier, tier)
                            }
                          >
                            {tier}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Regenerate routes and typecheck**

Run: `pnpm generate-routes`
Run: `pnpm exec tsc --noEmit`
Expected: no errors; route tree includes `/_app/admin/users`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_app/admin/users.tsx src/routeTree.gen.ts
git commit -m "feat: add ops+ user management screen with tier controls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Sidebar — tier filtering, admin nav, real profile

**Files:**
- Modify: `src/components/AppSidebar.tsx`

**Interfaces:**
- Consumes: `hasTier`, `Tier` (Task 1); router context user via `useRouteContext({ from: '/_app' })` (Task 8); routes `/admin/requests` (Task 10) and `/admin/users` (Task 11).
- Produces: nav filtered by tier per the spec mapping; Administration section (ops+) with tier-filtered children; profile block showing real name + tier badge.

- [ ] **Step 1: Rewrite the sidebar**

Replace the entire content of `src/components/AppSidebar.tsx` with:

```tsx
import { useState } from 'react'
import { Link, useRouteContext, useRouterState } from '@tanstack/react-router'
import {
  Home,
  Radio,
  LayoutGrid,
  ClipboardList,
  Wallet,
  CalendarDays,
  FileText,
  Users,
  LifeBuoy,
  Layers,
  Split,
  Shield,
  Settings,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

type NavLeaf = {
  label: string
  // Only routed pages get `to`; the rest are placeholders that render as
  // buttons until their routes are scaffolded (sub-projects 2-6).
  to?: '/home' | '/admin/requests' | '/admin/users'
  minTier?: Tier
}

type NavItem = NavLeaf & {
  icon: LucideIcon
  children?: Array<NavLeaf>
}

const NAV: Array<NavItem> = [
  { label: 'Home', icon: Home, to: '/home' },
  { label: 'Engage', icon: Radio },
  {
    label: 'My Worklife',
    icon: LayoutGrid,
    children: [
      { label: 'Profile' },
      { label: 'Attendance' },
      { label: 'Shifts' },
      { label: 'Assets' },
    ],
  },
  {
    label: 'To do',
    icon: ClipboardList,
    children: [
      { label: 'Approvals' },
      { label: 'Tasks' },
      { label: 'Reviews' },
    ],
  },
  {
    label: 'Salary',
    icon: Wallet,
    children: [
      { label: 'Payslips' },
      { label: 'IT Statement' },
      { label: 'YTD Reports' },
      { label: 'Loans' },
    ],
  },
  {
    label: 'Leave',
    icon: CalendarDays,
    children: [
      { label: 'Apply Leave' },
      { label: 'Leave Balance' },
      { label: 'Holidays' },
    ],
  },
  { label: 'Document Center', icon: FileText },
  { label: 'Helpdesk', icon: LifeBuoy },
  { label: 'People', icon: Users, minTier: 'ops' },
  { label: 'Request Hub', icon: Layers, minTier: 'ops' },
  { label: 'Workflow Delegates', icon: Split, minTier: 'ops' },
  {
    label: 'Administration',
    icon: Shield,
    minTier: 'ops',
    children: [
      { label: 'User Requests', to: '/admin/requests', minTier: 'master' },
      { label: 'User Management', to: '/admin/users', minTier: 'ops' },
    ],
  },
]

const TIER_BADGE: Record<Tier, string> = {
  basic: 'bg-slate-100 text-slate-600',
  ops: 'bg-emerald-100 text-emerald-700',
  master: 'bg-indigo-100 text-indigo-700',
}

const rowBase =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
        Q
      </div>
      <span className="text-lg font-bold text-slate-900">
        Quorq<span className="text-blue-600">OS</span>
      </span>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useRouteContext({ from: '/_app' })
  const [open, setOpen] = useState<string | null>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const visible = NAV.filter((item) =>
    hasTier(user.tier, item.minTier ?? 'basic'),
  )

  return (
    <div className="flex h-full flex-col">
      {/* nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map((item) => {
          const Icon = item.icon
          const active = item.to !== undefined && pathname === item.to

          if (item.children) {
            const children = item.children.filter((child) =>
              hasTier(user.tier, child.minTier ?? 'basic'),
            )
            const isOpen = open === item.label
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : item.label)}
                  className={`${rowBase} w-full text-slate-600 hover:bg-slate-100`}
                  aria-expanded={isOpen}
                >
                  <Icon size={18} className="shrink-0 text-slate-500" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-400 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen ? (
                  <div className="mt-1 space-y-1 pl-11">
                    {children.map((child) =>
                      child.to ? (
                        <Link
                          key={child.label}
                          to={child.to}
                          onClick={onNavigate}
                          className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                            pathname === child.to
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <button
                          key={child.label}
                          type="button"
                          onClick={onNavigate}
                          className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {child.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            )
          }

          const content = (
            <>
              <Icon
                size={18}
                className={`shrink-0 ${
                  active ? 'text-blue-600' : 'text-slate-500'
                }`}
              />
              <span>{item.label}</span>
            </>
          )

          const className = `${rowBase} ${
            active
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100'
          }`

          if (item.to) {
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onNavigate}
                className={className}
              >
                {content}
              </Link>
            )
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={onNavigate}
              className={`${className} w-full text-left`}
            >
              {content}
            </button>
          )
        })}
      </nav>
      {/* profile */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {user.name}
          </div>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_BADGE[user.tier]}`}
          >
            {user.tier}
          </span>
        </div>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-600"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: filter sidebar by access tier with admin section and profile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Tiered dashboards on /home + logout

**Files:**
- Create: `src/components/dashboards/styles.ts`
- Create: `src/components/dashboards/BasicDashboard.tsx`
- Create: `src/components/dashboards/OpsDashboard.tsx`
- Create: `src/components/dashboards/MasterDashboard.tsx`
- Modify: `src/routes/_app/home.tsx`

**Interfaces:**
- Consumes: `logout` (Task 5); `getUserStats` (Task 9); `hasTier` (Task 1); `context.user` (Task 8); `denied` search param (Task 10).
- Produces: `/home` renders stacked dashboards — Master panels (master only, real counts), Ops panels (ops+, static), Basic cards (everyone) — plus working logout, dynamic greeting with the user's name, and the access-denied banner.

- [ ] **Step 1: Create the shared style strings**

Create `src/components/dashboards/styles.ts`:

```ts
export const cardBase =
  'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
export const cardTitle = 'text-base font-semibold text-slate-900'
export const sectionTitle =
  'text-xs font-semibold uppercase tracking-wide text-slate-400'
```

- [ ] **Step 2: Extract the basic dashboard**

Create `src/components/dashboards/BasicDashboard.tsx` (this is the existing card grid moved out of `home.tsx`, unchanged visually):

```tsx
import { ArrowRight, ClipboardCheck, Palmtree } from 'lucide-react'
import { cardBase, cardTitle } from './styles'

export default function BasicDashboard() {
  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {/* Review */}
      <div className={cardBase}>
        <h3 className={cardTitle}>Review</h3>
        <div className="mt-6 flex flex-col items-center justify-center text-center">
          <ClipboardCheck className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">
            Hurrah! You&apos;ve nothing to review.
          </p>
        </div>
      </div>

      {/* Upcoming Holidays */}
      <div className={cardBase}>
        <h3 className={cardTitle}>Upcoming Holidays</h3>
        <div className="mt-6 flex flex-col items-center justify-center text-center">
          <Palmtree className="text-emerald-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">
            Uh oh! No holidays to show.
          </p>
        </div>
      </div>

      {/* Payslip */}
      <div className={cardBase}>
        <div className="flex items-center justify-between">
          <h3 className={cardTitle}>Payslip</h3>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600"
            aria-label="Open payslip"
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div
            className="relative h-28 w-28 rounded-full"
            style={{
              background: 'conic-gradient(#2f6b7e 0% 82%, #bfe3cf 82% 100%)',
            }}
          >
            <div className="absolute inset-4 rounded-full bg-white" />
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-800">
              May 2026
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900">31</div>
            <div className="text-xs text-slate-500">Paid Days</div>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <PayRow color="bg-slate-800" label="Gross Pay" />
          <PayRow color="bg-emerald-300" label="Deduction" />
          <PayRow color="bg-teal-600" label="Net Pay" />
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-medium">
          <button className="text-blue-600 hover:underline">Download</button>
          <button className="text-blue-600 hover:underline">
            Show Salary
          </button>
        </div>
      </div>
    </section>
  )
}

function PayRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`h-3 w-1 rounded-sm ${color}`} />
        {label}
      </span>
      <span className="tracking-widest text-slate-400">*****</span>
    </div>
  )
}
```

- [ ] **Step 3: Create the ops dashboard**

Create `src/components/dashboards/OpsDashboard.tsx`:

```tsx
import { ClipboardList, UsersRound } from 'lucide-react'
import { cardBase, cardTitle, sectionTitle } from './styles'

export default function OpsDashboard() {
  return (
    <section>
      <h3 className={sectionTitle}>Operations</h3>
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className={cardBase}>
          <h3 className={cardTitle}>Team Overview</h3>
          <div className="mt-6 flex flex-col items-center justify-center text-center">
            <UsersRound className="text-slate-300" size={48} />
            <p className="mt-4 text-sm text-slate-500">
              Team insights arrive with the People module.
            </p>
          </div>
        </div>
        <div className={cardBase}>
          <h3 className={cardTitle}>Approvals Queue</h3>
          <div className="mt-6 flex flex-col items-center justify-center text-center">
            <ClipboardList className="text-slate-300" size={48} />
            <p className="mt-4 text-sm text-slate-500">
              Leave and request approvals arrive with the Leave module.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create the master dashboard**

Create `src/components/dashboards/MasterDashboard.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { getUserStats } from '#/server/admin'
import { cardBase, sectionTitle } from './styles'

export default function MasterDashboard() {
  const { data } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await getUserStats()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  return (
    <section>
      <h3 className={sectionTitle}>Administration</h3>
      <div className="mt-3 grid grid-cols-2 gap-5 md:grid-cols-4">
        <Link to="/admin/requests" className={`${cardBase} hover:border-blue-300`}>
          <StatBody label="Pending requests" value={data?.pending} highlight />
        </Link>
        <div className={cardBase}>
          <StatBody label="Basic users" value={data?.byTier.basic} />
        </div>
        <div className={cardBase}>
          <StatBody label="Ops users" value={data?.byTier.ops} />
        </div>
        <div className={cardBase}>
          <StatBody label="Master users" value={data?.byTier.master} />
        </div>
      </div>
    </section>
  )
}

function StatBody({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number | undefined
  highlight?: boolean
}) {
  return (
    <div>
      <div
        className={`text-3xl font-bold ${
          highlight && value ? 'text-blue-600' : 'text-slate-900'
        }`}
      >
        {value ?? '—'}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite home.tsx**

Replace the entire content of `src/routes/_app/home.tsx` with:

```tsx
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Bell, Power, X } from 'lucide-react'
import { logout } from '#/server/auth'
import { hasTier } from '#/lib/tiers'
import BasicDashboard from '#/components/dashboards/BasicDashboard'
import OpsDashboard from '#/components/dashboards/OpsDashboard'
import MasterDashboard from '#/components/dashboards/MasterDashboard'

export const Route = createFileRoute('/_app/home')({
  validateSearch: (search: Record<string, unknown>) => ({
    denied: search.denied === '1' ? ('1' as const) : undefined,
  }),
  component: HomePage,
})

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function HomePage() {
  const { user } = Route.useRouteContext()
  const { denied } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    await router.invalidate()
    void navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* top bar */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-lg font-semibold text-slate-800">Home</h1>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative text-slate-500 hover:text-slate-700"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-600"
            aria-label="Log out"
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 p-6">
        {denied ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>You do not have access to that page.</span>
            <Link
              to="/home"
              aria-label="Dismiss"
              className="text-amber-500 hover:text-amber-700"
            >
              <X size={16} />
            </Link>
          </div>
        ) : null}

        {/* hero */}
        <section className="relative overflow-hidden">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold text-slate-900">
              {getGreeting()}, {user.name}
            </h2>
          </div>
          <div className="pointer-events-none absolute right-0 top-0 hidden h-40 w-96 opacity-90 xl:block">
            <SunsetIllustration />
          </div>
        </section>

        {/* stacked tier dashboards: higher tiers see extra panels on top */}
        <div className="mt-6 space-y-8">
          {user.tier === 'master' ? <MasterDashboard /> : null}
          {hasTier(user.tier, 'ops') ? <OpsDashboard /> : null}
          <BasicDashboard />
        </div>
      </div>
    </div>
  )
}

function SunsetIllustration() {
  return (
    <svg viewBox="0 0 384 160" className="h-full w-full" fill="none">
      <circle cx="300" cy="70" r="26" fill="#f97362" opacity="0.9" />
      <path
        d="M0 110 C 60 90, 120 120, 180 100 S 300 80, 384 96"
        stroke="#94a3b8"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M40 130 C 120 110, 200 140, 260 120 S 360 118, 384 124"
        stroke="#cbd5e1"
        strokeWidth="1.5"
        fill="none"
      />
      <rect x="150" y="86" width="34" height="18" rx="4" fill="#60a5fa" />
      <circle cx="158" cy="106" r="3.5" fill="#334155" />
      <circle cx="176" cy="106" r="3.5" fill="#334155" />
    </svg>
  )
}
```

- [ ] **Step 6: Typecheck and run tests**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test`
Expected: PASS — 25 tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboards src/routes/_app/home.tsx
git commit -m "feat: stack tier dashboards on home with logout and denied notice

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Final verification and smoke test

**Files:** none (verification only).

- [ ] **Step 1: Full automated checks**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: tests PASS (25), tsc silent, lint clean (fix any issues in files this plan touched).

- [ ] **Step 2: Boot the dev server**

Run `pnpm dev` in the background. Wait for it to report ready on port 3000.

- [ ] **Step 3: HTTP smoke checks**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```
Expected: `200`.

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/home
```
Expected: a redirect status (`302` or `307`) with redirect URL ending in `/login` — proves the auth guard runs server-side.

- [ ] **Step 4: Browser smoke checklist**

Verify in a real browser (or report to the human partner to verify) at `http://localhost:3000`:

1. `/home` without a session → lands on `/login`.
2. Login as `basic@quorq.com` / `basic123`: sidebar shows NO People / Request Hub / Workflow Delegates / Administration; home shows only the basic cards; profile block shows "Basic Demo" + `basic` badge; visiting `/admin/users` directly → bounced to `/home` with the amber "You do not have access" banner.
3. Log out (power icon) → back at `/login`; `/home` is locked again.
4. Login as `ops@quorq.com` / `ops123`: sidebar adds People, Request Hub, Workflow Delegates, Administration → User Management; home adds the Operations panels; `/admin/users` works and the master option is disabled in tier dropdowns; `/admin/requests` → bounced with banner.
5. Login as `master@quorq.com` / `master123`: Administration shows User Requests + User Management; home adds the Administration stat tiles with real counts; `/admin/requests` works.
6. Full approval loop: sign up a new account at `/signup` → "Request submitted" panel → try logging in with it → "Your account is awaiting approval." → as master, approve it under User Requests → new user can now log in and sees the basic view; pending count on the master dashboard reflects the change.
7. As master in User Management, change the new user's tier to `ops` → log in as that user → ops nav appears.

- [ ] **Step 5: Stop the dev server and finish**

Stop the background dev server. Confirm `git status` is clean (everything committed) and `.dev.vars` is untracked/ignored.

---

## Self-Review Notes

- Spec coverage: tier model (T1), users schema + seeds (T4), PBKDF2 (T2), JWT + cookie (T3, T5), signup→pending (T6), login status messages (T7), `_app` guard + context (T8), DB-verified admin authorization (T9), requests screen master-only (T10), users screen ops+ with master-grant rules (T11), sidebar mapping + profile badge (T12), stacked dashboards + denied banner + logout (T13), testing + manual smoke (T1-T3, T14). Forgot-password intentionally untouched (spec: out of scope).
- Type names cross-checked: `Tier`, `AuthUser`, `Result`, `AdminUser`, `UserStats`, `TokenPayload`, `SESSION_COOKIE`, `getAuthSecret`, `requireTier`, `hasTier`, `canSetTier` are used with identical signatures across tasks.
- The `HASH_BASIC`/`HASH_OPS`/`HASH_MASTER` markers in Task 4 are generated-at-build values with an exact generation command, not placeholders.
