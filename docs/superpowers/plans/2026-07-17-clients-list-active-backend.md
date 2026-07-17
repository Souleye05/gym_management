# Clients — listActive() Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Clients backend so `GET /api/clients` with no `q`/`phone`/`cardNumber` param returns a paginated list of all active clients (instead of `[]`), while `search()`'s existing behavior stays byte-for-byte unchanged.

**Architecture:** A new `ClientRepository.listActive({ page, limit })` method (Prisma `findMany` + `count`, both scoped to `isActive: true`), routed to from `ClientService.listClients(query?, pagination?)` alongside the existing `search()` path. The two paths return a shared `ListClientsResult` shape whose `total` field is present only for the paginated path — never a value that could be mistaken for a real server-side count on the search path.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Zod, Vitest (integration tests against a real Postgres instance via `prismaClient`).

## Global Constraints

- `search(query)`'s existing behavior is untouched — same signature, same empty-query-returns-`[]` semantics, same tests passing unmodified. This plan adds a new method and a new service branch; it does not rewrite `search()`.
- `ListClientsResult = { clients: Client[]; total?: number }` — `total` is present (and reflects a real, `limit`-independent COUNT) only when the result comes from `listActive()`. It is absent (not `0`, not `clients.length`) when the result comes from `search()`, `findByPhone`, or `findByCardNumber` — the field's presence is the signal that pagination applies, not a value to interpret.
- `DEFAULT_LIST_ACTIVE_LIMIT = 100` is a named exported constant (`server/clients/repositories/client.repository.ts`) — never a bare `100` literal repeated across files.
- `listActive()` filters `isActive: true` — deactivated clients never appear in the paginated list, consistent with every other active-client-only read path in this module (`findByPhone` with `activeOnly`, `search`, `findByCardNumber`).
- Response envelope stays `{ success, data, message, errors }` (`server/shared/api-response.ts`, unchanged) — `data` becomes `{ clients, total? }` instead of `{ clients }`; `total` only appears in the JSON body when the service returns it (Zod-free plain object spread, so an absent key does not serialize as `null`).
- After every task, run `npx tsc --noEmit` and the relevant `vitest run` — do not proceed to the next task with a red build. (This project's `npx` binary resolution has been flaky in past sessions — if `npx vitest`/`npx tsc` fail to resolve, fall back to invoking the binary directly via `node node_modules/.pnpm/<package>/node_modules/<bin>` as documented in `.claude/skills/verify/SKILL.md`.)
- A code review must run after each of Tasks 1, 2, 3 (mirroring this project's standing rule) — flag this explicitly to the user at each checkpoint rather than skipping it.

---

## File Structure

```
server/clients/repositories/client.repository.ts               — MODIFY: add listActive interface method, DEFAULT_LIST_ACTIVE_LIMIT, ListActivePagination, ListActiveResult
server/clients/infrastructure/prisma-client.repository.ts       — MODIFY: implement listActive
server/clients/infrastructure/prisma-client.repository.test.ts  — MODIFY: add listActive tests

server/clients/services/client.service.ts                       — MODIFY: change listClients signature/return type, add ListClientsResult
server/clients/services/default-client.service.ts                — MODIFY: implement the query-present/query-absent routing
server/clients/services/default-client.service.test.ts           — MODIFY: update listClients tests for the new return shape

server/clients/http/list-clients.controller.ts                   — MODIFY: pass through page/limit query params, forward total when present
server/clients/http/list-clients.controller.test.ts               — MODIFY: update the "no query params" test for the new behavior, add pagination tests
```

Tests live next to the file they cover (`*.test.ts`), matching every other module in this codebase.

---

## Task 1: `ClientRepository.listActive()`

**Files:**
- Modify: `server/clients/repositories/client.repository.ts`
- Modify: `server/clients/infrastructure/prisma-client.repository.ts`
- Modify: `server/clients/infrastructure/prisma-client.repository.test.ts`

**Interfaces:**
- Consumes: `Client` (`server/clients/domain/entities.ts`, already exists), `prismaClient` (already exists).
- Produces:
  ```ts
  export const DEFAULT_LIST_ACTIVE_LIMIT = 100

  export type ListActivePagination = { page: number; limit: number }
  export type ListActiveResult = { clients: Client[]; total: number }

  // added to ClientRepository:
  listActive(pagination: ListActivePagination): Promise<ListActiveResult>
  ```

- [ ] **Step 1: Write the failing tests**

Add to `server/clients/infrastructure/prisma-client.repository.test.ts`, a new `describe` block (place it after the existing `describe('PrismaClientRepository.search', ...)` block):

```ts
describe('PrismaClientRepository.listActive', () => {
  it('returns active clients and the total count', async () => {
    await repository.create({ name: 'Client A', phone: '+33600000101' })
    await repository.create({ name: 'Client B', phone: '+33600000102' })

    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('excludes deactivated clients from both the list and the total', async () => {
    const created = await repository.create({ name: 'Will Deactivate', phone: '+33600000103' })
    await repository.create({ name: 'Stays Active', phone: '+33600000104' })
    await repository.deactivate(created.id)

    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toHaveLength(1)
    expect(result.clients[0].name).toBe('Stays Active')
    expect(result.total).toBe(1)
  })

  it('respects limit, and total stays independent of it', async () => {
    for (let i = 0; i < 5; i++) {
      await repository.create({ name: `Client ${i}`, phone: `+336000002${i}0` })
    }

    const result = await repository.listActive({ page: 1, limit: 2 })

    expect(result.clients).toHaveLength(2)
    expect(result.total).toBe(5)
  })

  it('returns the second page when requested', async () => {
    const created: string[] = []
    for (let i = 0; i < 3; i++) {
      const client = await repository.create({ name: `Page Client ${i}`, phone: `+336000003${i}0` })
      created.push(client.id)
    }

    const firstPage = await repository.listActive({ page: 1, limit: 2 })
    const secondPage = await repository.listActive({ page: 2, limit: 2 })

    expect(firstPage.clients).toHaveLength(2)
    expect(secondPage.clients).toHaveLength(1)
    const firstPageIds = firstPage.clients.map((c) => c.id)
    const secondPageIds = secondPage.clients.map((c) => c.id)
    expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds))
  })

  it('returns an empty list and zero total when there are no active clients', async () => {
    const result = await repository.listActive({ page: 1, limit: 10 })

    expect(result.clients).toEqual([])
    expect(result.total).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: FAIL — `repository.listActive is not a function`

- [ ] **Step 3: Add `listActive` (and the new exported types) to the repository interface**

In `server/clients/repositories/client.repository.ts`, add near the top (after the existing `PhoneAlreadyUsedError` class, before `CreateClientInput`):

```ts
export const DEFAULT_LIST_ACTIVE_LIMIT = 100

export type ListActivePagination = { page: number; limit: number }
export type ListActiveResult = { clients: Client[]; total: number }
```

Add to the `ClientRepository` interface, after `search`:

```ts
  /** Active clients only, ordered by joinedAt descending. `total` is a real count, independent of `limit`. */
  listActive(pagination: ListActivePagination): Promise<ListActiveResult>
```

- [ ] **Step 4: Implement `listActive` in the Prisma repository**

In `server/clients/infrastructure/prisma-client.repository.ts`, add to `PrismaClientRepository`, after `search`:

```ts
  async listActive({ page, limit }: ListActivePagination): Promise<ListActiveResult> {
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where: { isActive: true },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where: { isActive: true } }),
    ])
    return { clients: rows.map(toDomain), total }
  }
```

Add `ListActivePagination` and `ListActiveResult` to the existing type-only import from `../repositories/client.repository` at the top of the file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/clients/infrastructure/prisma-client.repository.test.ts`
Expected: all tests pass (26 total: 21 pre-existing + 5 new).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/clients/repositories/client.repository.ts server/clients/infrastructure/prisma-client.repository.ts server/clients/infrastructure/prisma-client.repository.test.ts
git commit -m "feat: add ClientRepository.listActive with real pagination"
```

- [ ] **Step 8: Flag for code review**

This completes the repository layer. Per this project's standing rule, run the code-review skill on the diff so far before proceeding.

---

## Task 2: `ClientService.listClients()` routing

**Files:**
- Modify: `server/clients/services/client.service.ts`
- Modify: `server/clients/services/default-client.service.ts`
- Modify: `server/clients/services/default-client.service.test.ts`

**Interfaces:**
- Consumes: `ListActivePagination`, `ListActiveResult`, `DEFAULT_LIST_ACTIVE_LIMIT` (Task 1), `Client` (already exists).
- Produces:
  ```ts
  export type ListClientsResult = { clients: Client[]; total?: number }

  // changed on ClientService (was: listClients(query?: string): Promise<Client[]>):
  listClients(query?: string, pagination?: ListActivePagination): Promise<ListClientsResult>
  ```

This is a breaking change to `ClientService.listClients`'s return type — every caller (Task 3's controller, and this task's own tests) is updated in the same task/plan, so nothing is left half-migrated.

- [ ] **Step 1: Write the failing tests**

Find the existing `describe('DefaultClientService.listClients', ...)` block in `server/clients/services/default-client.service.test.ts` and replace it entirely with:

```ts
describe('DefaultClientService.listClients', () => {
  it('returns search results with no total when a query is provided', async () => {
    const service = new DefaultClientService(fakeClientRepository())

    const result = await service.listClients('yasmine')

    expect(result.clients).toEqual([CLIENT])
    expect(result.total).toBeUndefined()
  })

  it('delegates to listActive with a real total when no query is provided', async () => {
    const repository = fakeClientRepository({
      listActive: async ({ page, limit }) => {
        expect(page).toBe(1)
        expect(limit).toBe(DEFAULT_LIST_ACTIVE_LIMIT)
        return { clients: [CLIENT], total: 1 }
      },
    })
    const service = new DefaultClientService(repository)

    const result = await service.listClients()

    expect(result.clients).toEqual([CLIENT])
    expect(result.total).toBe(1)
  })

  it('delegates to listActive with a real total when the query is an empty string', async () => {
    const repository = fakeClientRepository({
      listActive: async () => ({ clients: [], total: 0 }),
    })
    const service = new DefaultClientService(repository)

    const result = await service.listClients('')

    expect(result.clients).toEqual([])
    expect(result.total).toBe(0)
  })

  it('passes explicit pagination through to listActive', async () => {
    const repository = fakeClientRepository({
      listActive: async (pagination) => {
        expect(pagination).toEqual({ page: 2, limit: 5 })
        return { clients: [], total: 12 }
      },
    })
    const service = new DefaultClientService(repository)

    await service.listClients(undefined, { page: 2, limit: 5 })
  })
})
```

Add `listActive` to the `fakeClientRepository` factory's returned object (it must satisfy the updated `ClientRepository` interface once Task 1 lands, otherwise this file won't type-check) — find the object literal inside `fakeClientRepository` and add, alongside the other methods:

```ts
    listActive: async () => ({ clients: [], total: 0 }),
```

Add the new imports at the top of the file, alongside the existing ones:

```ts
import { DEFAULT_LIST_ACTIVE_LIMIT } from '../repositories/client.repository'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: FAIL — either a type error (if `listClients`'s signature hasn't changed yet, `result.total` won't exist) or `service.listClients(...)` returning `Client[]` instead of `{ clients, total? }`. Confirm the failure is about the return shape, not an unrelated break.

- [ ] **Step 3: Update the service interface**

In `server/clients/services/client.service.ts`, add near the top (after the existing imports, before the `ClientService` interface):

```ts
export type ListClientsResult = { clients: Client[]; total?: number }
```

Replace the existing `listClients` line:

```ts
  /** Empty/absent query returns an empty list; otherwise a substring search on name/phone. */
  listClients(query?: string): Promise<Client[]>
```

with:

```ts
  /**
   * Query present → substring search on name/phone, `total` absent (search has no true
   * pagination — a derived total would misleadingly imply one).
   * Query absent/empty → all active clients, paginated; `total` present and independent of `limit`.
   */
  listClients(query?: string, pagination?: ListActivePagination): Promise<ListClientsResult>
```

Add `ListActivePagination` to the existing type-only import from `../repositories/client.repository`.

- [ ] **Step 4: Update the implementation**

In `server/clients/services/default-client.service.ts`, replace the existing `listClients` method:

```ts
  async listClients(query?: string): Promise<Client[]> {
    return guardAgainstLeakingInternals(async () => {
      if (!query || query.trim().length === 0) return []
      return this.clientRepository.search(query)
    })
  }
```

with:

```ts
  async listClients(query?: string, pagination?: ListActivePagination): Promise<ListClientsResult> {
    return guardAgainstLeakingInternals(async () => {
      if (query && query.trim().length > 0) {
        const clients = await this.clientRepository.search(query)
        return { clients }
      }
      return this.clientRepository.listActive(pagination ?? { page: 1, limit: DEFAULT_LIST_ACTIVE_LIMIT })
    })
  }
```

Add `DEFAULT_LIST_ACTIVE_LIMIT` and `ListActivePagination` to the existing type-only import from `../repositories/client.repository`, and `ListClientsResult` to the import from `./client.service`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/clients/services/default-client.service.test.ts`
Expected: all tests pass (25 total: 21 pre-existing minus the 1 replaced `listClients` test plus 4 new = net +3, verify actual count from output rather than assuming).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `server/clients/http/list-clients.controller.ts` are EXPECTED at this point (Task 3 fixes them) — confirm any remaining errors are confined to that one file. If errors appear anywhere else, stop and investigate before proceeding.

- [ ] **Step 7: Commit**

```bash
git add server/clients/services/client.service.ts server/clients/services/default-client.service.ts server/clients/services/default-client.service.test.ts
git commit -m "feat: route ClientService.listClients to listActive when no query is given"
```

- [ ] **Step 8: Flag for code review**

This completes the service layer. Per this project's standing rule, run the code-review skill on the diff so far (Tasks 1-2) before proceeding.

---

## Task 3: Controller and route — `page`/`limit` query params

**Files:**
- Modify: `server/clients/http/list-clients.controller.ts`
- Modify: `server/clients/http/list-clients.controller.test.ts`

**Interfaces:**
- Consumes: `ClientService.listClients` (Task 2), `apiSuccess` (`server/shared/api-response.ts`, already exists).
- Produces: no new exports — `listClientsController`'s signature is unchanged (`(req: NextRequest) => Promise<NextResponse>`); only its response body's `data` shape changes for the no-query-param case (`{ clients }` → `{ clients, total? }`).

- [ ] **Step 1: Write the failing/updated tests**

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

  it('returns all active clients with a total when no query params are given', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Client One', phone: '+33600000201' }, cookie))
    await createClientController(postRequest({ name: 'Client Two', phone: '+33600000202' }, cookie))

    const res = await listClientsController(listRequest('', cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.clients).toHaveLength(2)
    expect(json.data.total).toBe(2)
  })

  it('respects page and limit query params', async () => {
    const cookie = await staffAccessTokenCookie()
    for (let i = 0; i < 3; i++) {
      await createClientController(postRequest({ name: `Paged Client ${i}`, phone: `+336000003${i}0` }, cookie))
    }

    const res = await listClientsController(listRequest('?page=1&limit=2', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(2)
    expect(json.data.total).toBe(3)
  })

  it('searches by q and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Yasmine Kaddour', phone: '+33612345601' }, cookie))

    const res = await listClientsController(listRequest('?q=yasmine', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.total).toBeUndefined()
  })

  it('finds by exact phone and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    await createClientController(postRequest({ name: 'Marc Delaunay', phone: '+33612345602' }, cookie))

    const res = await listClientsController(listRequest('?phone=%2B33612345602', cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].phone).toBe('+33612345602')
    expect(json.data.total).toBeUndefined()
  })

  it('finds by card number and omits total', async () => {
    const cookie = await staffAccessTokenCookie()
    const createRes = await createClientController(postRequest({ name: 'Inès Fabre', phone: '+33612345603' }, cookie))
    const created = (await createRes.json()).data.client

    const res = await listClientsController(listRequest(`?cardNumber=${created.cardNumber}`, cookie))
    const json = await res.json()

    expect(json.data.clients).toHaveLength(1)
    expect(json.data.clients[0].id).toBe(created.id)
    expect(json.data.total).toBeUndefined()
  })

  it('returns an empty list for a card number that does not exist', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await listClientsController(listRequest('?cardNumber=CARD-99999', cookie))
    const json = await res.json()

    expect(json.data.clients).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/http/list-clients.controller.test.ts`
Expected: FAIL — the "no query params" test expects 2 clients + total, but the current controller still calls `clientService.listClients(q ?? undefined)` (single-argument, old signature) so results depend on Task 2's landed changes; if Task 2 is already committed, this fails because the controller doesn't yet parse/forward `page`/`limit` and doesn't forward `total` in the response.

- [ ] **Step 3: Update the controller**

Replace the full contents of `server/clients/http/list-clients.controller.ts`:

```ts
// server/clients/http/list-clients.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { DEFAULT_LIST_ACTIVE_LIMIT } from '../repositories/client.repository'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

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

    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = parsePositiveInt(searchParams.get('limit'), DEFAULT_LIST_ACTIVE_LIMIT)

    const result = await clientService.listClients(q ?? undefined, { page, limit })
    return NextResponse.json(apiSuccess(result))
  })
}
```

Note: the controller imports `DEFAULT_LIST_ACTIVE_LIMIT` from the repository module (a plain exported constant, not a Prisma type or implementation detail) rather than duplicating `100` as a second literal — a single source of truth for the default, consistent with the Global Constraints rule against repeating the bare number across files. This one named-constant import is a narrower dependency than reaching into `server/clients/infrastructure/**` (the actual Prisma layer), which the controller still never touches directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/clients/http/list-clients.controller.test.ts`
Expected: all tests pass (7 total).

- [ ] **Step 5: Run the full Clients HTTP test suite to confirm no regression**

Run: `npx vitest run server/clients/http/`
Expected: all pass (list + create + get + update + deactivate + get-my-client-profile controllers).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (234 pre-existing baseline + net new tests from this plan).

- [ ] **Step 8: Commit**

```bash
git add server/clients/http/list-clients.controller.ts server/clients/http/list-clients.controller.test.ts
git commit -m "feat: expose page/limit query params and total on GET /api/clients"
```

- [ ] **Step 9: Flag for code review**

This completes the plan. Per this project's standing rule, run the code-review skill on the full diff (Tasks 1-3) before considering this plan done.

---

## Task 4: Live verification

**Files:** none (verification only, no code changes).

- [ ] **Step 1: Run the full test suite one final time**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check one final time**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Start the dev server and verify live**

Check for an already-running dev server first: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`. If not running, start it in the background (see `.claude/skills/verify/SKILL.md` for this project's known binary-resolution workarounds if `npm run dev`/`npx next dev` fail to resolve).

```bash
curl -s -c .scratch/list-active-verify.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" -d '{"email":"admin@atlas.fit","password":"admin123"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/list-active-verify.txt http://localhost:3000/api/clients -w "\n%{http_code}\n"
```
Expected: login `200`; list request `200` with a JSON body containing `data.clients` (an array, possibly containing whatever clients already exist in the dev database) and `data.total` (a number).

```bash
curl -s -b .scratch/list-active-verify.txt "http://localhost:3000/api/clients?page=1&limit=1" -w "\n%{http_code}\n"
```
Expected: `200`, `data.clients` has at most 1 entry, `data.total` reflects the real total count (not `1`, unless there's genuinely only one active client in the dev database).

```bash
curl -s -b .scratch/list-active-verify.txt "http://localhost:3000/api/clients?q=nonexistent-search-term-xyz" -w "\n%{http_code}\n"
```
Expected: `200`, `data.clients` is `[]`, `data.total` is `undefined` (absent from the JSON body — check with `| grep -o '"total"'` returning nothing, or inspect the raw body).

- [ ] **Step 4: Clean up**

```bash
rm -f .scratch/list-active-verify.txt
```

No commit needed for this task — verification only.

---

## Out of scope (confirmed by the design doc, do not implement here)

- Frontend `ClientsProvider` migration onto this contract — separate plan, owned by a different agent per this project's frontend/backend role split (`ARCHITECTURE_RULES.md`).
- UI pagination controls (page forward/back) — backend parameter exists, not consumed anywhere yet.
- Mutation cache invalidation, optimistic updates — frontend concerns, noted in the design doc as forward pointers for the frontend plan, not part of this backend work.
- Real `ClientAccount` linking from the client creation screen — unrelated, already out of scope per the original Clients API design.
