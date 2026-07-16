# Clients Authorization + Self-Service Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `/api/clients/*` with staff authentication and role-based authorization (deactivation restricted to `ADMIN`), add a `requireClientAuth()` helper used by a new client self-service profile endpoint, and extend the seed so the new endpoint is testable end-to-end.

**Architecture:** Two new thin HTTP guard helpers (`requireStaffAuth`, `requireClientAuth`) in `server/auth/http/`, each wrapping existing verification logic (a new `StaffAccountRepository.findActiveById` method for staff; the already-existing `clientAuthService.getMe()` for clients) and returning either an authenticated business object or a ready-to-return `NextResponse`. A new permission matrix (`server/shared/authorization/permissions.ts`) gates the one role-sensitive action. Every Clients controller gets a one-line guard call at the top of its body — no business logic moves.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, Vitest (integration tests against a real Postgres instance via `prismaClient`).

## Global Constraints

- Every requirement in `docs/superpowers/specs/2026-07-15-clients-authorization-design.md` is binding; this plan implements that design without deviation.
- `requireStaffAuth()` performs full verification on every call: JWT decode + reload the staff account from the database via `findActiveById` — never JWT-only. Returns a business object (`AuthenticatedStaff`), never a Prisma row.
- `requireClientAuth()` is a thin wrapper around the already-existing `clientAuthService.getMe()` — do not reimplement JWT/DB verification for clients; that logic already lives in `DefaultClientAuthService.getMe()`.
- Authorization is a permission matrix keyed by `Role` (`'ADMIN' | 'AGENT'`, from `server/auth/domain/enums.ts` — the TS string-union type, NOT the Prisma-generated enum used in `prisma/seed.ts`), not inline `if (role === 'ADMIN')` checks in controllers.
- Only `deactivate-client.controller.ts` checks a permission (`client:deactivate`, `ADMIN`-only). The other four Clients controllers require only authentication, no permission check.
- `GET /api/client/me/profile` returns `200 { client: Client | null }` in every success case — a `ClientAccount` with no linked `Client` is normal, never a 404.
- No breaking change to any existing response shape or status code for already-passing tests — `client-me.controller.ts`'s behavior must be identical after migrating to `requireClientAuth()`.
- After every task, run `npx tsc --noEmit` and the relevant `vitest run` — do not proceed to the next task with a red build.
- A code review must run after each of Tasks 2, 4, 6, 8 (mirroring this project's standing rule) — flag this explicitly rather than skipping it.

---

## File Structure

```
server/auth/repositories/staff-account.repository.ts        — MODIFY: add findActiveById to the interface
server/auth/infrastructure/prisma-staff-account.repository.ts — MODIFY: implement findActiveById

server/auth/http/
  require-staff-auth.ts                                      — CREATE: requireStaffAuth()
  require-staff-auth.test.ts                                 — CREATE
  require-client-auth.ts                                      — CREATE: requireClientAuth()
  require-client-auth.test.ts                                 — CREATE
  client-me.controller.ts                                      — MODIFY: migrate onto requireClientAuth()

server/shared/authorization/
  permissions.ts                                               — CREATE: Permission, hasPermission()
  permissions.test.ts                                          — CREATE

server/clients/repositories/client.repository.ts               — MODIFY: add findByClientAccountId to the interface
server/clients/infrastructure/prisma-client.repository.ts       — MODIFY: implement findByClientAccountId
server/clients/services/client.service.ts                       — MODIFY: add findByClientAccountId to the interface
server/clients/services/default-client.service.ts                — MODIFY: implement findByClientAccountId

server/clients/http/
  list-clients.controller.ts                                    — MODIFY: add requireStaffAuth guard
  create-client.controller.ts                                   — MODIFY: add requireStaffAuth guard
  get-client.controller.ts                                      — MODIFY: add requireStaffAuth guard
  update-client.controller.ts                                   — MODIFY: add requireStaffAuth guard
  deactivate-client.controller.ts                                — MODIFY: add requireStaffAuth guard + permission check
  get-my-client-profile.controller.ts                            — CREATE: GET self-service profile
  get-my-client-profile.controller.test.ts                       — CREATE

app/api/client/me/profile/route.ts                              — CREATE: GET re-export

prisma/seed.ts                                                   — MODIFY: link 3 of 4 seeded ClientAccounts to a Client
```

Tests live next to the file they cover (`*.test.ts`), matching every other module in this codebase.

---

## Task 1: `StaffAccountRepository.findActiveById`

**Files:**
- Modify: `server/auth/repositories/staff-account.repository.ts`
- Modify: `server/auth/infrastructure/prisma-staff-account.repository.ts`
- Test: `server/auth/infrastructure/prisma-staff-account.repository.test.ts`

**Interfaces:**
- Consumes: `StaffAccountRecord` (already exists in `staff-account.repository.ts`), `prismaClient` (already exists).
- Produces: `StaffAccountRepository.findActiveById(id: string): Promise<StaffAccountRecord | null>` — returns `null` if the account doesn't exist OR `isActive` is `false`.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe('PrismaStaffAccountRepository', ...)` block in `server/auth/infrastructure/prisma-staff-account.repository.test.ts` (the file currently ends after the `findById` tests — add these as new `it` blocks inside the same top-level `describe`, right after the last existing test):

```ts
  it('finds an active staff account by id via findActiveById', async () => {
    const created = await prismaClient.staffAccount.create({
      data: { email: 'active@atlas.fit', passwordHash: 'hash', name: 'Active Staff', role: 'AGENT' },
    })

    const account = await repository.findActiveById(created.id)

    expect(account?.email).toBe('active@atlas.fit')
  })

  it('returns null from findActiveById when the account is deactivated', async () => {
    const created = await prismaClient.staffAccount.create({
      data: { email: 'inactive@atlas.fit', passwordHash: 'hash', name: 'Inactive Staff', role: 'AGENT', isActive: false },
    })

    const account = await repository.findActiveById(created.id)

    expect(account).toBeNull()
  })

  it('returns null from findActiveById when the id does not exist', async () => {
    const account = await repository.findActiveById('does-not-exist')
    expect(account).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/auth/infrastructure/prisma-staff-account.repository.test.ts`
Expected: FAIL — `repository.findActiveById is not a function`

- [ ] **Step 3: Add `findActiveById` to the interface**

In `server/auth/repositories/staff-account.repository.ts`, add one line to the interface:

```ts
export interface StaffAccountRepository {
  findByEmail(email: string): Promise<StaffAccountRecord | null>
  findById(id: string): Promise<StaffAccountRecord | null>
  /** Returns null if the account does not exist OR is deactivated (isActive: false). */
  findActiveById(id: string): Promise<StaffAccountRecord | null>
}
```

- [ ] **Step 4: Implement `findActiveById`**

In `server/auth/infrastructure/prisma-staff-account.repository.ts`, add the method to `PrismaStaffAccountRepository`:

```ts
  async findActiveById(id: string): Promise<StaffAccountRecord | null> {
    return this.prisma.staffAccount.findFirst({ where: { id, isActive: true } })
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/auth/infrastructure/prisma-staff-account.repository.test.ts`
Expected: all tests pass (7 total: 4 pre-existing + 3 new).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/auth/repositories/staff-account.repository.ts server/auth/infrastructure/prisma-staff-account.repository.ts server/auth/infrastructure/prisma-staff-account.repository.test.ts
git commit -m "feat: add StaffAccountRepository.findActiveById"
```

---

## Task 2: `requireStaffAuth()`

**Files:**
- Create: `server/auth/http/require-staff-auth.ts`
- Test: `server/auth/http/require-staff-auth.test.ts`

**Interfaces:**
- Consumes: `readAccessTokenCookie` (`server/shared/cookies.ts`, already exists), `getContainer().staffAuthService.getMe` (already exists — see note below), `Role` (`server/auth/domain/enums.ts`).
- Produces:
  ```ts
  export type AuthenticatedStaff = { id: string; email: string; name: string; role: Role }
  export type RequireStaffAuthResult =
    | { ok: true; staff: AuthenticatedStaff }
    | { ok: false; response: NextResponse }
  export async function requireStaffAuth(req: NextRequest): Promise<RequireStaffAuthResult>
  ```

**Note on delegation:** `staffAuthService.getMe(accessToken)` (already implemented, used by `staff-me.controller.ts`) already does full verification — JWT decode, `kind === 'staff'` check, and a fresh repository reload with an `isActive` check — and returns `Result<StaffUser, AuthDomainError>` where `StaffUser = { id, name, email, role }` is exactly the `AuthenticatedStaff` shape this task needs. `requireStaffAuth` is therefore a thin wrapper around `getMe`, not a reimplementation — no changes to `Container`'s public surface are needed. Task 1's `findActiveById` exists as a Repository-level building block for a future refactor of `DefaultStaffAuthService.getMe()`'s internals (out of scope here — `getMe()`'s implementation is untouched by this plan) and is exercised directly by its own repository tests.

- [ ] **Step 1: Write the failing tests**

```ts
// server/auth/http/require-staff-auth.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { staffLoginController } from './staff-login.controller'
import { requireStaffAuth } from './require-staff-auth'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', { headers: { cookie } })
}

async function loginAndGetAccessTokenCookie(): Promise<string> {
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return accessToken
}

beforeEach(async () => {
  await cleanAuthTables()
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.create({
    data: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
})

describe('requireStaffAuth', () => {
  it('returns the authenticated staff for a valid access token cookie', async () => {
    const accessToken = await loginAndGetAccessTokenCookie()

    const result = await requireStaffAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.staff).toEqual({
        id: expect.any(String),
        name: 'Admin Studio',
        email: 'admin@atlas.fit',
        role: 'ADMIN',
      })
    }
  })

  it('returns a 401 response when no access token cookie is present', async () => {
    const result = await requireStaffAuth(requestWithCookie(''))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response for a malformed access token', async () => {
    const result = await requireStaffAuth(requestWithCookie('access_token=not-a-real-jwt'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response when the staff account has been deactivated', async () => {
    const accessToken = await loginAndGetAccessTokenCookie()
    await prismaClient.staffAccount.update({ where: { email: 'admin@atlas.fit' }, data: { isActive: false } })

    const result = await requireStaffAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})
```

Note on the last test: `staffAuthService.getMe()` maps a deactivated account to `AuthDomainError.code === 'account-inactive'`, and `statusForDomainError` maps that to `403` (not `401`) — confirmed against `server/shared/http-status.ts`. This is intentional and matches the existing `staff-me.controller.ts` behavior exactly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/auth/http/require-staff-auth.test.ts`
Expected: FAIL — `Cannot find module './require-staff-auth'`

- [ ] **Step 3: Write the implementation**

```ts
// server/auth/http/require-staff-auth.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError } from '../../shared/api-response'
import { readAccessTokenCookie } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import type { Role } from '../domain/enums'

export type AuthenticatedStaff = { id: string; email: string; name: string; role: Role }

export type RequireStaffAuthResult =
  | { ok: true; staff: AuthenticatedStaff }
  | { ok: false; response: NextResponse }

export async function requireStaffAuth(req: NextRequest): Promise<RequireStaffAuthResult> {
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError({ code: 'session-expired', message: 'Session expirée.' }), {
        status: 401,
      }),
    }
  }

  const { staffAuthService } = getContainer()
  const result = await staffAuthService.getMe(accessToken)

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) }),
    }
  }

  return { ok: true, staff: result.value }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/auth/http/require-staff-auth.test.ts`
Expected: `Tests  4 passed (4)`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add server/auth/http/require-staff-auth.ts server/auth/http/require-staff-auth.test.ts
git commit -m "feat: add requireStaffAuth() HTTP guard"
```

- [ ] **Step 7: Flag for code review**

This completes the staff-side authentication guard. Per this project's standing rule, run the code-review skill on the diff so far (Tasks 1–2) before proceeding.

---

## Task 3: `requireClientAuth()` and `client-me.controller.ts` migration

**Files:**
- Create: `server/auth/http/require-client-auth.ts`
- Test: `server/auth/http/require-client-auth.test.ts`
- Modify: `server/auth/http/client-me.controller.ts`

**Interfaces:**
- Consumes: `readAccessTokenCookie` (already exists), `getContainer().clientAuthService.getMe` (already exists), `ClientUser` (`server/auth/domain/entities.ts`, already exists).
- Produces:
  ```ts
  export type RequireClientAuthResult =
    | { ok: true; client: ClientUser }
    | { ok: false; response: NextResponse }
  export async function requireClientAuth(req: NextRequest): Promise<RequireClientAuthResult>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// server/auth/http/require-client-auth.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from './client-request-otp.controller'
import { clientVerifyOtpController } from './client-verify-otp.controller'
import { requireClientAuth } from './require-client-auth'

const SIMULATED_OTP_CODE = '123456'

function requestWithCookie(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/client/me/profile', { headers: { cookie } })
}

async function verifyAndGetAccessTokenCookie(phone: string): Promise<string> {
  const requestOtpReq = new NextRequest('https://example.com/api/auth/client/request-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  await clientRequestOtpController(requestOtpReq)

  const verifyReq = new NextRequest('https://example.com/api/auth/client/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: SIMULATED_OTP_CODE }),
  })
  const res = await clientVerifyOtpController(verifyReq)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('verify-otp did not set an access token cookie')
  return accessToken
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'Yasmine Kaddour' } })
})

describe('requireClientAuth', () => {
  it('returns the authenticated client for a valid access token cookie', async () => {
    const accessToken = await verifyAndGetAccessTokenCookie('+33612345601')

    const result = await requireClientAuth(requestWithCookie(`access_token=${accessToken}`))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.client).toEqual({ id: expect.any(String), name: 'Yasmine Kaddour', phone: '+33612345601' })
    }
  })

  it('returns a 401 response when no access token cookie is present', async () => {
    const result = await requireClientAuth(requestWithCookie(''))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it('returns a 401 response for a malformed access token', async () => {
    const result = await requireClientAuth(requestWithCookie('access_token=not-a-real-jwt'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/auth/http/require-client-auth.test.ts`
Expected: FAIL — `Cannot find module './require-client-auth'`

- [ ] **Step 3: Write the implementation**

```ts
// server/auth/http/require-client-auth.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromDomainError } from '../../shared/api-response'
import { readAccessTokenCookie } from '../../shared/cookies'
import { statusForDomainError } from '../../shared/http-status'
import { getContainer } from '../../shared/container'
import type { ClientUser } from '../domain/entities'

export type RequireClientAuthResult =
  | { ok: true; client: ClientUser }
  | { ok: false; response: NextResponse }

export async function requireClientAuth(req: NextRequest): Promise<RequireClientAuthResult> {
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError({ code: 'session-expired', message: 'Session expirée.' }), {
        status: 401,
      }),
    }
  }

  const { clientAuthService } = getContainer()
  const result = await clientAuthService.getMe(accessToken)

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) }),
    }
  }

  return { ok: true, client: result.value }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/auth/http/require-client-auth.test.ts`
Expected: `Tests  3 passed (3)`

- [ ] **Step 5: Migrate `client-me.controller.ts` onto `requireClientAuth()`**

Replace the full contents of `server/auth/http/client-me.controller.ts`:

```ts
// server/auth/http/client-me.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { requireClientAuth } from './require-client-auth'

export async function clientMeController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return NextResponse.json(apiSuccess({ user: auth.client }))
}
```

- [ ] **Step 6: Run the existing `client-me.controller.test.ts` to confirm no regression**

Run: `npx vitest run server/auth/http/client-me.controller.test.ts`
Expected: both pre-existing tests still pass unchanged (`Tests  2 passed (2)`) — this confirms the migration preserved exact HTTP behavior.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/auth/http/require-client-auth.ts server/auth/http/require-client-auth.test.ts server/auth/http/client-me.controller.ts
git commit -m "feat: add requireClientAuth() and migrate client-me.controller.ts onto it"
```

---

## Task 4: Permission matrix

**Files:**
- Create: `server/shared/authorization/permissions.ts`
- Test: `server/shared/authorization/permissions.test.ts`

**Interfaces:**
- Consumes: `Role` (`server/auth/domain/enums.ts`, already exists).
- Produces:
  ```ts
  export type Permission = 'client:list' | 'client:read' | 'client:create' | 'client:update' | 'client:deactivate'
  export function hasPermission(role: Role, permission: Permission): boolean
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// server/shared/authorization/permissions.test.ts
import { describe, expect, it } from 'vitest'
import { hasPermission, type Permission } from './permissions'

const ALL_PERMISSIONS: Permission[] = ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate']

describe('hasPermission', () => {
  it('grants ADMIN every client permission', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission('ADMIN', permission)).toBe(true)
    }
  })

  it('grants AGENT every permission except client:deactivate', () => {
    expect(hasPermission('AGENT', 'client:list')).toBe(true)
    expect(hasPermission('AGENT', 'client:read')).toBe(true)
    expect(hasPermission('AGENT', 'client:create')).toBe(true)
    expect(hasPermission('AGENT', 'client:update')).toBe(true)
    expect(hasPermission('AGENT', 'client:deactivate')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/shared/authorization/permissions.test.ts`
Expected: FAIL — `Cannot find module './permissions'`

- [ ] **Step 3: Write the implementation**

```ts
// server/shared/authorization/permissions.ts
import type { Role } from '../../auth/domain/enums'

export type Permission = 'client:list' | 'client:read' | 'client:create' | 'client:update' | 'client:deactivate'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate'],
  AGENT: ['client:list', 'client:read', 'client:create', 'client:update'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/shared/authorization/permissions.test.ts`
Expected: `Tests  2 passed (2)`

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add server/shared/authorization
git commit -m "feat: add role-based permission matrix for Clients actions"
```

- [ ] **Step 7: Flag for code review**

This completes the authentication and authorization primitives (Tasks 1–4). Per this project's standing rule, run the code-review skill on the diff so far before proceeding to wire them into the Clients controllers.

---

## Task 5: Guard the 5 Clients controllers

**Files:**
- Modify: `server/clients/http/list-clients.controller.ts`
- Modify: `server/clients/http/create-client.controller.ts`
- Modify: `server/clients/http/get-client.controller.ts`
- Modify: `server/clients/http/update-client.controller.ts`
- Modify: `server/clients/http/deactivate-client.controller.ts`
- Modify: `server/clients/http/list-clients.controller.test.ts`
- Modify: `server/clients/http/create-client.controller.test.ts`
- Modify: `server/clients/http/get-client.controller.test.ts`
- Modify: `server/clients/http/update-client.controller.test.ts`
- Modify: `server/clients/http/deactivate-client.controller.test.ts`

**Interfaces:**
- Consumes: `requireStaffAuth` (Task 2), `hasPermission` (Task 4), `apiFailure` (`server/shared/api-response.ts`, already exists).
- Produces: no new exports — each controller's existing signature (`(req: NextRequest) => Promise<NextResponse>` or `(req, id) => Promise<NextResponse>`) is unchanged; only the body gains a guard.

This task adds a request-authentication check to every route. Existing controller tests that call these functions directly with a bare `NextRequest` (no cookie) will now correctly fail with a 401 unless updated — so each test file needs a helper to obtain a valid staff session, matching the pattern already used in `staff-me.controller.test.ts`.

- [ ] **Step 1: Write the failing test additions for `list-clients.controller.test.ts`**

Replace the full contents of `server/clients/http/list-clients.controller.test.ts`:

```ts
// server/clients/http/list-clients.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { listClientsController } from './list-clients.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function listRequest(query: string, cookie: string): NextRequest {
  return new NextRequest(`https://example.com/api/clients${query}`, { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('listClientsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await listClientsController(new NextRequest('https://example.com/api/clients'))

    expect(res.status).toBe(401)
  })

  it('returns an empty list with no query params', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await listClientsController(listRequest('', cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.clients).toEqual([])
  })

  it('searches by q', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }, cookie))

    const res = await listClientsController(listRequest('?q=yasmine', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
  })

  it('finds by exact phone', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))

    const res = await listClientsController(listRequest('?phone=%2B33612345602', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].phone).toBe('+33612345602')
  })

  it('finds by card number', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Inès Fabre', phone: '+33612345603' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await listClientsController(listRequest(`?cardNumber=${created.cardNumber}`, cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].id).toBe(created.id)
  })

  it('returns an empty list for a card number that does not exist', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await listClientsController(listRequest('?cardNumber=CARD-99999', cookie))
    const json = await res.json()

    expect(json.data.clients).toEqual([])
  })
})
```

- [ ] **Step 2: Write the failing test additions for `create-client.controller.test.ts`**

Replace the full contents of `server/clients/http/create-client.controller.test.ts`:

```ts
// server/clients/http/create-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('createClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const req = new NextRequest('https://example.com/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No Session', phone: '+33612345699' }),
    })

    const res = await createClientController(req)

    expect(res.status).toBe(401)
  })

  it('creates a client and returns 201 with a formatted card number', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.client.name).toBe('Yasmine Kaddour')
    expect(json.data.client.cardNumber).toMatch(/^CARD-\d{5,}$/)
    expect(json.data.client.cardSequence).toBeUndefined()
  })

  it('returns 400 for an invalid payload', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await createClientController(postRequest({ name: '', phone: '123' }, cookie))

    expect(res.status).toBe(400)
  })

  it('returns 409 when the phone is already used by an active client', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'First', phone: '+33612345601' }, cookie))

    const res = await createClientController(postRequest({ name: 'Second', phone: '+33612345601' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.success).toBe(false)
  })
})
```

- [ ] **Step 3: Write the failing test additions for `get-client.controller.test.ts`**

Replace the full contents of `server/clients/http/get-client.controller.test.ts`:

```ts
// server/clients/http/get-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { getClientController } from './get-client.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function getRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('getClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await getClientController(new NextRequest('https://example.com/api/clients/x'), 'some-id')

    expect(res.status).toBe(401)
  })

  it('returns the client for a valid id', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await getClientController(getRequest(cookie), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.id).toBe(created.id)
  })

  it('returns 404 for an unknown id', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await getClientController(getRequest(cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 4: Write the failing test additions for `update-client.controller.test.ts`**

Replace the full contents of `server/clients/http/update-client.controller.test.ts`:

```ts
// server/clients/http/update-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { updateClientController } from './update-client.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin Studio', role: 'ADMIN' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@atlas.fit', password: 'admin123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('updateClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const req = new NextRequest('https://example.com/api/clients/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    })

    const res = await updateClientController(req, 'some-id')

    expect(res.status).toBe(401)
  })

  it('updates the client name', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Original', phone: '+33612345603' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: 'Updated' }, cookie), created.id)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Updated')
  })

  it('returns 404 for an unknown id', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await updateClientController(patchRequest({ name: 'X' }, cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid payload', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Valid', phone: '+33612345604' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await updateClientController(patchRequest({ name: '' }, cookie), created.id)

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 5: Write the failing test additions for `deactivate-client.controller.test.ts`**

Replace the full contents of `server/clients/http/deactivate-client.controller.test.ts`:

```ts
// server/clients/http/deactivate-client.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { createClientController } from './create-client.controller'
import { deactivateClientController } from './deactivate-client.controller'
import { getClientController } from './get-client.controller'

async function staffAccessTokenCookie(email: string, password: string, role: 'ADMIN' | 'AGENT'): Promise<string> {
  const passwordHash = await argon2.hash(password)
  await prismaClient.staffAccount.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: 'Staff', role },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

function adminCookie(): Promise<string> {
  return staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')
}

function agentCookie(): Promise<string> {
  return staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')
}

function postRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function deleteRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients/x', { method: 'DELETE', headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('deactivateClientController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await deactivateClientController(new NextRequest('https://example.com/api/clients/x', { method: 'DELETE' }), 'some-id')

    expect(res.status).toBe(401)
  })

  it('returns 403 when the staff member is an AGENT, not ADMIN', async () => {
    const admin = await adminCookie()
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345605' }, admin))
    const created = (await createRes.json()).data.client

    const agent = await agentCookie()
    const res = await deactivateClientController(deleteRequest(agent), created.id)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.success).toBe(false)
  })

  it('deactivates an existing client when the staff member is ADMIN', async () => {
    const admin = await adminCookie()
    const createRes = await createClientController(postRequest({ name: 'To Deactivate', phone: '+33612345606' }, admin))
    const created = (await createRes.json()).data.client

    const res = await deactivateClientController(deleteRequest(admin), created.id)

    expect(res.status).toBe(200)

    const getRes = await getClientController(new NextRequest('https://example.com/api/clients/x', { headers: { cookie: admin } }), created.id)
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for an unknown id when the staff member is ADMIN', async () => {
    const admin = await adminCookie()

    const res = await deactivateClientController(deleteRequest(admin), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 6: Run all 5 test files to verify they fail**

Run: `npx vitest run server/clients/http/`
Expected: FAIL — every non-401 test fails because the controllers don't guard yet, so `getClient`/`updateClient`/etc. run without a session but currently succeed anyway (no guard exists), and the new 401/403 tests fail because no guard returns those statuses.

- [ ] **Step 7: Add the guard to `list-clients.controller.ts`**

```ts
// server/clients/http/list-clients.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'

export async function listClientsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { searchParams } = new URL(req.url)
    const cardNumber = searchParams.get('cardNumber')
    const phone = searchParams.get('phone')
    const q = searchParams.get('q')

    const { clientService } = getContainer()

    if (cardNumber) {
      const client = await clientService.findByCardNumber(cardNumber)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    if (phone) {
      const client = await clientService.findByPhone(phone)
      return NextResponse.json(apiSuccess({ clients: client ? [client] : [] }))
    }

    const clients = await clientService.listClients(q ?? undefined)
    return NextResponse.json(apiSuccess({ clients }))
  })
}
```

- [ ] **Step 8: Add the guard to `create-client.controller.ts`**

```ts
// server/clients/http/create-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { CreateClientSchema } from '../dto/client.dto'

export async function createClientController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = CreateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { clientService } = getContainer()
    const result = await clientService.createClient(parsed.data)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }, 'Client créé'), { status: 201 })
  })
}
```

- [ ] **Step 9: Add the guard to `get-client.controller.ts`**

```ts
// server/clients/http/get-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'

export async function getClientController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.getClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }))
  })
}
```

- [ ] **Step 10: Add the guard to `update-client.controller.ts`**

```ts
// server/clients/http/update-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { UpdateClientSchema } from '../dto/client.dto'

export async function updateClientController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = UpdateClientSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { clientService } = getContainer()
    const result = await clientService.updateClient(id, parsed.data)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ client: result.value }, 'Client mis à jour'))
  })
}
```

- [ ] **Step 11: Add the guard and permission check to `deactivate-client.controller.ts`**

```ts
// server/clients/http/deactivate-client.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure, apiSuccess } from '../../shared/api-response'
import { apiFailureFromClientDomainError, statusForClientDomainError } from '../../shared/client-api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { hasPermission } from '../../shared/authorization/permissions'

export async function deactivateClientController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  if (!hasPermission(auth.staff.role, 'client:deactivate')) {
    return NextResponse.json(apiFailure('forbidden'), { status: 403 })
  }

  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const result = await clientService.deactivateClient(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromClientDomainError(result.error), {
        status: statusForClientDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess(null, 'Client désactivé'))
  })
}
```

- [ ] **Step 12: Run all 5 test files to verify they pass**

Run: `npx vitest run server/clients/http/`
Expected: all pass — 6 (list) + 4 (create) + 3 (get) + 4 (update) + 4 (deactivate) = 21 tests.

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 14: Run the full test suite to confirm no regression elsewhere**

Run: `npx vitest run`
Expected: all tests pass (189 pre-existing + new tests from Tasks 1–5).

- [ ] **Step 15: Commit**

```bash
git add server/clients/http
git commit -m "feat: require staff authentication on all Clients routes, ADMIN-only deactivation"
```

- [ ] **Step 16: Flag for code review**

This completes the authorization wiring for the staff CRUD routes — the core security fix. Per this project's standing rule, run the code-review skill on the diff so far before proceeding to the self-service endpoint.

---

## Task 6: `ClientRepository.findByClientAccountId` and `ClientService.findByClientAccountId`

**Files:**
- Modify: `server/clients/repositories/client.repository.ts`
- Modify: `server/clients/infrastructure/prisma-client.repository.ts`
- Modify: `server/clients/services/client.service.ts`
- Modify: `server/clients/services/default-client.service.ts`
- Test: `server/clients/infrastructure/prisma-client.repository.test.ts`
- Test: `server/clients/services/default-client.service.test.ts`

**Interfaces:**
- Consumes: `Client` (already exists), `prismaClient` (already exists).
- Produces:
  - `ClientRepository.findByClientAccountId(clientAccountId: string): Promise<Client | null>`
  - `ClientService.findByClientAccountId(clientAccountId: string): Promise<Client | null>`

- [ ] **Step 1: Write the failing repository test**

Add to `server/clients/infrastructure/prisma-client.repository.test.ts`, a new `describe` block (place it after the existing `describe('PrismaClientRepository.findByCardSequence', ...)` block):

```ts
describe('PrismaClientRepository.findByClientAccountId', () => {
  it('finds a client linked to the given clientAccountId', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33600000010', name: 'Linked Account' } })
    const created = await prismaClient.client.create({
      data: { name: 'Linked Client', phone: '+33600000011', clientAccountId: account.id },
    })

    const found = await repository.findByClientAccountId(account.id)

    expect(found?.id).toBe(created.id)
  })

  it('returns null when no client is linked to the given clientAccountId', async () => {
    const found = await repository.findByClientAccountId('does-not-exist')
    expect(found).toBeNull()
  })
})
```

This test file's `prismaClient` import already exists at the top of the file (`import { prismaClient } from '../../shared/prisma-client'`) — reuse it directly for the `clientAccount.create` setup call.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: FAIL — `repository.findByClientAccountId is not a function`

- [ ] **Step 3: Add `findByClientAccountId` to the repository interface**

In `server/clients/repositories/client.repository.ts`, add to `ClientRepository`:

```ts
  /** Looks up the Client linked to a ClientAccount, if any. A ClientAccount links to at most one Client. */
  findByClientAccountId(clientAccountId: string): Promise<Client | null>
```

- [ ] **Step 4: Implement `findByClientAccountId` in the Prisma repository**

In `server/clients/infrastructure/prisma-client.repository.ts`, add to `PrismaClientRepository`:

```ts
  async findByClientAccountId(clientAccountId: string): Promise<Client | null> {
    const row = await this.prisma.client.findUnique({ where: { clientAccountId } })
    return row ? toDomain(row) : null
  }
```

- [ ] **Step 5: Run the repository test to verify it passes**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: all tests pass (20 total: 18 pre-existing + 2 new).

- [ ] **Step 6: Write the failing service test**

Add to `server/clients/services/default-client.service.test.ts`, a new `describe` block (place it after the existing `describe('DefaultClientService.findByCardNumber', ...)` block). First add `findByClientAccountId` to the `fakeClientRepository` factory's returned object (it must satisfy the updated `ClientRepository` interface once Step 3 lands, otherwise this file won't type-check):

```ts
// inside fakeClientRepository's returned object, alongside the other methods:
    findByClientAccountId: async () => null,
```

Then add the new test block:

```ts
describe('DefaultClientService.findByClientAccountId', () => {
  it('delegates to the repository and returns the linked client', async () => {
    const repository = fakeClientRepository({
      findByClientAccountId: async (clientAccountId) => (clientAccountId === 'acc-1' ? CLIENT : null),
    })
    const service = new DefaultClientService(repository)

    const found = await service.findByClientAccountId('acc-1')

    expect(found?.id).toBe('c1')
  })

  it('returns null when no client is linked', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const found = await service.findByClientAccountId('acc-unknown')

    expect(found).toBeNull()
  })
})
```

- [ ] **Step 7: Run the service test to verify it fails**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: FAIL — `service.findByClientAccountId is not a function`

- [ ] **Step 8: Add `findByClientAccountId` to the service interface**

In `server/clients/services/client.service.ts`, add to `ClientService`:

```ts
  /** Looks up the Client linked to a ClientAccount, if any. Returns null if none is linked. */
  findByClientAccountId(clientAccountId: string): Promise<Client | null>
```

- [ ] **Step 9: Implement `findByClientAccountId` in `DefaultClientService`**

In `server/clients/services/default-client.service.ts`, add to `DefaultClientService`:

```ts
  async findByClientAccountId(clientAccountId: string): Promise<Client | null> {
    return guardAgainstLeakingInternals(() => this.clientRepository.findByClientAccountId(clientAccountId))
  }
```

- [ ] **Step 10: Run the service test to verify it passes**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: all tests pass (19 total: 17 pre-existing + 2 new).

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 12: Commit**

```bash
git add server/clients/repositories server/clients/infrastructure/prisma-client.repository.ts server/clients/infrastructure/prisma-client.repository.test.ts server/clients/services
git commit -m "feat: add findByClientAccountId to ClientRepository and ClientService"
```

---

## Task 7: `GET /api/client/me/profile` endpoint

**Files:**
- Create: `server/clients/http/get-my-client-profile.controller.ts`
- Test: `server/clients/http/get-my-client-profile.controller.test.ts`
- Create: `app/api/client/me/profile/route.ts`

**Interfaces:**
- Consumes: `requireClientAuth` (Task 3), `getContainer().clientService.findByClientAccountId` (Task 6), `apiSuccess` (already exists).
- Produces: `getMyClientProfileController(req: NextRequest): Promise<NextResponse>`, and the live `GET /api/client/me/profile` endpoint.

- [ ] **Step 1: Write the failing tests**

```ts
// server/clients/http/get-my-client-profile.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from '../../auth/http/client-request-otp.controller'
import { clientVerifyOtpController } from '../../auth/http/client-verify-otp.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { getMyClientProfileController } from './get-my-client-profile.controller'

const SIMULATED_OTP_CODE = '123456'

async function verifyAndGetAccessTokenCookie(phone: string): Promise<string> {
  const requestOtpReq = new NextRequest('https://example.com/api/auth/client/request-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  await clientRequestOtpController(requestOtpReq)

  const verifyReq = new NextRequest('https://example.com/api/auth/client/verify-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code: SIMULATED_OTP_CODE }),
  })
  const res = await clientVerifyOtpController(verifyReq)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('verify-otp did not set an access token cookie')
  return `access_token=${accessToken}`
}

function profileRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/client/me/profile', { headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanClientsTable()
})

describe('getMyClientProfileController', () => {
  it('returns 401 when no client session is present', async () => {
    const res = await getMyClientProfileController(new NextRequest('https://example.com/api/client/me/profile'))

    expect(res.status).toBe(401)
  })

  it('returns { client: null } when the session has no linked Client', async () => {
    await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'No Link' } })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345601')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client).toBeNull()
  })

  it('returns the linked Client when the session has one', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345602', name: 'Has Link' } })
    await prismaClient.client.create({
      data: { name: 'Has Link', phone: '+33612345602', clientAccountId: account.id },
    })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345602')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client.name).toBe('Has Link')
    expect(json.data.client.cardNumber).toMatch(/^CARD-\d{5,}$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/clients/http/get-my-client-profile.controller.test.ts`
Expected: FAIL — `Cannot find module './get-my-client-profile.controller'`

- [ ] **Step 3: Write the controller**

```ts
// server/clients/http/get-my-client-profile.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireClientAuth } from '../../auth/http/require-client-auth'

export async function getMyClientProfileController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)
    return NextResponse.json(apiSuccess({ client }))
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/clients/http/get-my-client-profile.controller.test.ts`
Expected: `Tests  3 passed (3)`

- [ ] **Step 5: Write the route handler**

```ts
// app/api/client/me/profile/route.ts
export { getMyClientProfileController as GET } from '@/server/clients/http/get-my-client-profile.controller'
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/clients/http/get-my-client-profile.controller.ts server/clients/http/get-my-client-profile.controller.test.ts app/api/client/me/profile
git commit -m "feat: add GET /api/client/me/profile self-service endpoint"
```

---

## Task 8: Extend the seed

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma.clientAccount`, `prisma.client` (Prisma-generated, already exist).
- Produces: no new exports — this is a data-only change to the seed script.

- [ ] **Step 1: Modify `prisma/seed.ts`**

Replace the full contents:

```ts
// prisma/seed.ts
import { Role } from '../lib/generated/prisma/client'
import argon2 from 'argon2'
import { prismaClient as prisma } from '../server/shared/prisma-client'

const STAFF_SEED = [
  { email: 'admin@atlas.fit', password: 'admin123', name: 'Admin Studio', role: Role.ADMIN },
  { email: 'agent@atlas.fit', password: 'agent123', name: 'Agent Caisse', role: Role.AGENT },
]

const CLIENT_ACCOUNT_SEED = [
  { phone: '+33612345601', name: 'Yasmine Kaddour', linkToClient: true },
  { phone: '+33612345602', name: 'Marc Delaunay', linkToClient: true },
  { phone: '+33612345603', name: 'Inès Fabre', linkToClient: true },
  { phone: '+33612345604', name: 'Karim Benali', linkToClient: false },
]

async function main() {
  for (const staff of STAFF_SEED) {
    const passwordHash = await argon2.hash(staff.password)
    await prisma.staffAccount.upsert({
      where: { email: staff.email },
      update: { passwordHash, name: staff.name, role: staff.role },
      create: { email: staff.email, passwordHash, name: staff.name, role: staff.role },
    })
  }

  for (const seed of CLIENT_ACCOUNT_SEED) {
    const account = await prisma.clientAccount.upsert({
      where: { phone: seed.phone },
      update: { name: seed.name },
      create: { phone: seed.phone, name: seed.name },
    })

    if (seed.linkToClient) {
      const existingClient = await prisma.client.findUnique({ where: { clientAccountId: account.id } })
      if (!existingClient) {
        await prisma.client.create({
          data: { name: seed.name, phone: seed.phone, clientAccountId: account.id },
        })
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
```

Note: the `findUnique` + conditional `create` (rather than an `upsert`) is necessary because `Client` has no natural unique key derived from the seed data to upsert against other than `clientAccountId` itself, and `Client.phone` is intentionally not `@unique` in the schema (service-level uniqueness only) — this makes the seed idempotent across repeated runs without relying on a database constraint that doesn't exist.

- [ ] **Step 2: Run the seed against the dev database**

Run: `npx prisma db seed`
Expected: exits 0 with no error output. This is destructive-adjacent (writes to the real dev database) — confirm with the user before running if there's any doubt about which database `DATABASE_URL` currently points to; this project's established workflow already runs seeds routinely against the dev DB, so proceed if `DATABASE_URL` is the known local/dev instance.

- [ ] **Step 3: Verify the linkage manually**

Run: `npx prisma studio` is not necessary — instead verify via a quick script-free check using the already-passing test suite's pattern, or inspect directly:

```bash
npx tsx -e "import { prismaClient } from './server/shared/prisma-client'; prismaClient.client.findMany({ where: { clientAccountId: { not: null } } }).then(rows => { console.log(rows.map(r => ({ name: r.name, clientAccountId: r.clientAccountId }))); return prismaClient.\$disconnect() })"
```

Expected: 3 rows printed (Yasmine Kaddour, Marc Delaunay, Inès Fabre), each with a non-null `clientAccountId`. Karim Benali's `ClientAccount` should have no corresponding row.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: link 3 of 4 seeded ClientAccounts to a Client record"
```

- [ ] **Step 6: Flag for code review**

This completes the plan (Tasks 5–8 since the last checkpoint). Per this project's standing rule, run the code-review skill on the full diff before considering this plan done.

---

## Task 9: Live verification

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Run the full test suite one final time**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check one final time**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Create a scratch directory for cookie jars and verify the security fix live**

Create a local scratch directory inside the repo (git-ignored, not `/tmp` — keeps cookie jars out of any OS-level temp cleanup during a long verification session):

```bash
mkdir -p .scratch/clients-auth-verify
```

Check for an already-running dev server first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`. If not running, start `npm run dev` in the background.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/clients
```
Expected: `401` (previously this returned `200` with a full client list to anyone, unauthenticated — this is the fix in effect).

- [ ] **Step 4: Verify a logged-in ADMIN can still list clients**

```bash
curl -s -c .scratch/clients-auth-verify/admin.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@atlas.fit","password":"admin123"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/clients-auth-verify/admin.txt http://localhost:3000/api/clients -w "\n%{http_code}\n"
```
Expected: login `200`, list request `200` with a JSON body. Note the `id` of any client in the response body — Step 5 needs one.

- [ ] **Step 5: Verify an AGENT cannot deactivate a client**

```bash
curl -s -c .scratch/clients-auth-verify/agent.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@atlas.fit","password":"agent123"}' -o /dev/null -w "%{http_code}\n"
```

Using a client `id` observed in Step 4's response body (substitute it below — if none exists yet, first create one with `curl -s -b .scratch/clients-auth-verify/admin.txt -X POST http://localhost:3000/api/clients -H "Content-Type: application/json" -d '{"name":"Verify Target","phone":"+33699999900"}'` and use the returned `data.client.id`):

```bash
curl -s -b .scratch/clients-auth-verify/agent.txt -X DELETE "http://localhost:3000/api/clients/<CLIENT_ID>" -w "\n%{http_code}\n"
```
Expected: agent login `200`, deactivate attempt `403`.

- [ ] **Step 6: Verify the self-service endpoint with a seeded, linked client account**

```bash
curl -s -X POST http://localhost:3000/api/auth/client/request-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345601"}' -o /dev/null -w "%{http_code}\n"

curl -s -c .scratch/clients-auth-verify/client-linked.txt -X POST http://localhost:3000/api/auth/client/verify-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345601","code":"123456"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/clients-auth-verify/client-linked.txt http://localhost:3000/api/client/me/profile -w "\n%{http_code}\n"
```
Expected: request-otp `200`, verify-otp `200`, profile request `200` with `data.client.name === "Yasmine Kaddour"`.

- [ ] **Step 7: Verify the null-profile case with the unlinked seeded account**

```bash
curl -s -X POST http://localhost:3000/api/auth/client/request-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345604"}' -o /dev/null -w "%{http_code}\n"

curl -s -c .scratch/clients-auth-verify/client-unlinked.txt -X POST http://localhost:3000/api/auth/client/verify-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345604","code":"123456"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/clients-auth-verify/client-unlinked.txt http://localhost:3000/api/client/me/profile -w "\n%{http_code}\n"
```
Expected: profile request `200` with `data.client === null`.

- [ ] **Step 8: Clean up the scratch directory**

```bash
rm -rf .scratch/clients-auth-verify
```

No commit needed for this task — verification only.

---

## Out of scope (confirmed by the design doc, do not implement here)

- Wiring the frontend staff module (`clients-provider.tsx`) onto the now-protected backend — separate future plan.
- Wiring the frontend `MyProfileProvider` onto `GET /api/client/me/profile` — separate future plan.
- Real `Subscription`/`Session`/`Payment` models or including them in the self-service profile response.
- Additional roles (`MANAGER`, `COACH`) — the permission matrix is structured to accept them easily but none are added here.
- General `/api/*` middleware-level protection — this plan protects only the specific Clients and self-service routes named above.
