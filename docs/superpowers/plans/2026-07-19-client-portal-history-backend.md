# Client Portal History Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real `Subscription`/`Session` Prisma models and enrich `GET /api/client/me/profile` with the connected client's real subscription/session history, replacing the mock data currently spliced into `MyProfileProvider`.

**Architecture:** Two new single-aggregate repositories (`SubscriptionRepository`, `SessionRepository`) — pure data access, no business judgment — orchestrated by one `ClientHistoryService` that derives "current subscription" (a temporal business rule) from raw repository results. The existing `get-my-client-profile.controller.ts` is extended to call this new service alongside the existing `ClientService`, merging both into one response. Mirrors `server/clients/**`'s established Clean Architecture layering exactly.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Vitest (integration tests against a real Postgres instance via `prismaClient`).

## Global Constraints

- Read-only for this plan — no write endpoints, no Zod DTOs for creating/updating Subscription/Session. That is explicitly deferred to a future staff-CRUD plan.
- `Payment` is NOT a separate model — `amountPaid`/`paymentMethod` stay embedded fields on `Subscription` and `Session`. This is a documented, deliberate divergence from `ARCHITECTURE_RULES.md` §4's literal wording (see design doc's "Décisions retenues" section) — do not "fix" this during implementation.
- Repositories are pure data access — `findLatestByClientId`, never `findCurrentByClientId`. The notion of "current" (is this subscription still valid as of now?) is a business judgment computed only in `DefaultClientHistoryService`, never in a repository or a Prisma query's `WHERE` clause.
- `Session` models the `VISITOR` case (`clientId` nullable, `visitorName`/`visitorPhone`) even though this plan's read path only ever queries by `clientId` (visitors have no login, so never call this endpoint) — this avoids a second schema migration when the future staff-CRUD plan arrives.
- A database-level CHECK constraint enforces `SessionType` ↔ (`clientId`/`visitorName`/`visitorPhone`) consistency — hand-written migration SQL, since Prisma's schema DSL cannot express conditional multi-column constraints (same precedent as the existing `clients_phone_active_key` partial unique index).
- `createdByStaffId` (nullable, FK to `StaffAccount.id`, `onDelete: SetNull`) exists on both `Subscription` and `Session` as an audit field, deliberately left unpopulated by this plan (no write path exists yet).
- No backend computation of `subscriptionStatus` — the API returns raw `Subscription` fields (`endDate`, `suspended`, etc.); the frontend's existing, unchanged `computeSubscriptionStatus()` continues to derive status from that data.
- `sessionHistory` in the API response is capped at the 20 most recent sessions (`RECENT_SESSIONS_LIMIT`, a constant internal to `DefaultClientHistoryService`, not exposed via any query param). `subscriptionHistory` (i.e. `subscriptions`) is NOT capped.
- The `GET /api/client/me/profile` response shape stays constant in every case: `client`, `subscription`, `subscriptionHistory`, `sessionHistory` are always all four present (never omitted), even when `client` is `null` (in which case `subscription: null, subscriptionHistory: [], sessionHistory: []`).
- Every unexpected repository failure is caught by a `guardAgainstLeakingInternals` wrapper in `DefaultClientHistoryService` (same pattern as `server/clients/services/default-client.service.ts`) — no raw Prisma error message, code, or constraint name may ever reach an HTTP response.
- After every task, run `npx tsc --noEmit` and the relevant `vitest run` — do not proceed to the next task with a red build. (This project's `npx` binary resolution has been unreliable in past sessions — if it fails to resolve, invoke the binary directly via `node node_modules/.pnpm/<package>/node_modules/<bin>`, documented in `.claude/skills/verify/SKILL.md`.)
- A code review must run after each of Tasks 1, 4, 5, 7 (schema, both repositories complete, service complete, controller complete) — flag this explicitly to the user at each checkpoint rather than skipping it.

---

## File Structure

```
prisma/schema.prisma                                              — MODIFY: add Subscription/Session models, PlanId/SessionType/PaymentMethod enums, inverse relations on Client/StaffAccount
prisma/migrations/<timestamp>_add_subscription_session/           — CREATE: auto-generated
prisma/migrations/<timestamp>_add_session_type_consistency_check/ — CREATE: hand-written CHECK constraint

server/client-portal-history/
  domain/
    entities.ts                                                    — CREATE: Subscription, Session types
  repositories/
    subscription.repository.ts                                     — CREATE: SubscriptionRepository interface
    session.repository.ts                                          — CREATE: SessionRepository interface
  infrastructure/
    prisma-subscription.repository.ts                               — CREATE: PrismaSubscriptionRepository
    prisma-session.repository.ts                                    — CREATE: PrismaSessionRepository
    test-helpers/
      clean-client-portal-history-tables.ts                         — CREATE: truncates subscriptions/sessions between tests
  services/
    client-history.service.ts                                       — CREATE: ClientHistoryService interface, ClientHistory type
    default-client-history.service.ts                                — CREATE: DefaultClientHistoryService

server/shared/container.ts                                          — MODIFY: wire clientHistoryService

server/clients/http/
  get-my-client-profile.controller.ts                                — MODIFY: merge in subscription/session history
  get-my-client-profile.controller.test.ts                            — MODIFY: extend with history assertions

prisma/seed.ts                                                       — MODIFY: add realistic Subscription/Session rows for the 3 linked clients
```

Tests live next to the file they cover (`*.test.ts`), matching every other module in this codebase.

---

## Task 1: Prisma schema — `Subscription`/`Session` models, enums, CHECK constraint

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_subscription_session/migration.sql` (generated by Prisma CLI)
- Create: `prisma/migrations/<timestamp>_add_session_type_consistency_check/migration.sql` (hand-written)

**Interfaces:**
- Produces: `PrismaClient.subscription`/`PrismaClient.session` accessors, fields as below. `PlanId`, `SessionType`, `PaymentMethod` enums importable from `../../../lib/generated/prisma/client`.

- [ ] **Step 1: Add the enums and models to `prisma/schema.prisma`**

Add these blocks after the existing `Client` model, before `RefreshToken`:

```prisma
enum PlanId {
  MONTHLY
  QUARTERLY
  BIANNUAL
  ANNUAL
}

enum SessionType {
  SUBSCRIBER
  VISITOR
}

enum PaymentMethod {
  CASH
  CARD
  MOBILE_MONEY
}

model Subscription {
  id               String    @id @default(cuid())
  clientId         String
  planId           PlanId
  startDate        DateTime
  endDate          DateTime
  suspended        Boolean   @default(false)
  amountPaid       Int
  paymentMethod    PaymentMethod
  createdByStaffId String?
  createdAt        DateTime  @default(now())

  client         Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdByStaff StaffAccount? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([clientId, endDate])
  @@map("subscriptions")
}

model Session {
  id               String        @id @default(cuid())
  type             SessionType
  clientId         String?
  visitorName      String?
  visitorPhone     String?
  amountPaid       Int
  paymentMethod    PaymentMethod
  createdByStaffId String?
  checkedInAt      DateTime      @default(now())

  client         Client?       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdByStaff StaffAccount? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  // SessionType <-> (clientId/visitorName/visitorPhone) consistency is enforced by a
  // database CHECK constraint (sessions_type_consistency_check), applied via a hand-written
  // migration since Prisma's DSL cannot express conditional multi-column constraints. See
  // migration 20260719_add_session_type_consistency_check. Do not let a future
  // `prisma migrate dev` diff drop it; hand-verify the drift check output.
  @@index([clientId, checkedInAt])
  @@map("sessions")
}
```

- [ ] **Step 2: Add the inverse relation fields to the existing `Client` model**

In `prisma/schema.prisma`, find the `Client` model and add two lines inside it (after the existing `clientAccount` relation field, do not duplicate the model):

```prisma
  subscriptions Subscription[]
  sessions      Session[]
```

- [ ] **Step 3: Add the inverse relation fields to the existing `StaffAccount` model**

In `prisma/schema.prisma`, find the `StaffAccount` model and add two lines inside it (after the existing `loginLogs` relation field):

```prisma
  createdSubscriptions Subscription[]
  createdSessions      Session[]
```

- [ ] **Step 4: Generate and apply the first migration**

Run: `npx prisma migrate dev --name add_subscription_session`
Expected: output ends with `Your database is now in sync with your schema.` and a new folder appears under `prisma/migrations/`.

- [ ] **Step 5: Create an empty migration for the CHECK constraint**

Run: `npx prisma migrate dev --create-only --name add_session_type_consistency_check`
Expected: a new empty migration folder is created (no schema diff exists yet to auto-generate from, since the CHECK constraint isn't expressible in `schema.prisma`).

- [ ] **Step 6: Write the CHECK constraint SQL**

Open the new empty `prisma/migrations/<timestamp>_add_session_type_consistency_check/migration.sql` and replace its content:

```sql
-- Enforces that a Session's populated fields match its type discriminator: a SUBSCRIBER
-- session must have clientId set and no visitor fields; a VISITOR session must have both
-- visitor fields set and no clientId. Prisma's schema DSL cannot express a conditional
-- multi-column CHECK constraint, so this is hand-written — same precedent as the existing
-- clients_phone_active_key partial unique index (see migration
-- 20260716074516_add_client_phone_active_unique_index).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_type_consistency_check" CHECK (
  ("type" = 'SUBSCRIBER' AND "clientId" IS NOT NULL AND "visitorName" IS NULL AND "visitorPhone" IS NULL)
  OR
  ("type" = 'VISITOR' AND "clientId" IS NULL AND "visitorName" IS NOT NULL AND "visitorPhone" IS NOT NULL)
);
```

- [ ] **Step 7: Apply the CHECK constraint migration**

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 8: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to .\lib\generated\prisma`

- [ ] **Step 9: Manually verify the CHECK constraint rejects an inconsistent row**

Run (adjust the psql connection command for your environment, matching `DATABASE_URL` in `.env`):

```bash
psql "$DATABASE_URL" -c "INSERT INTO sessions (id, type, \"clientId\", \"visitorName\", \"amountPaid\", \"paymentMethod\") VALUES ('test-check', 'SUBSCRIBER', NULL, 'Should Fail', 8, 'CASH');"
```

Expected: the `INSERT` fails with a constraint violation error mentioning `sessions_type_consistency_check`. This is a manual sanity check, not a substitute for Task 4's automated test — if this INSERT succeeds, stop and fix the constraint before proceeding.

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing unrelated errors in the parallel frontend sub-project, if any, are out of scope — same exclusion pattern as prior plans in this project).

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Subscription/Session Prisma models with type-consistency CHECK constraint"
```

- [ ] **Step 12: Flag for code review**

This completes the schema layer. Per this project's standing rule, run the code-review skill on the diff so far before proceeding.

---

## Task 2: Domain layer — `Subscription`/`Session` entities

**Files:**
- Create: `server/client-portal-history/domain/entities.ts`

**Interfaces:**
- Consumes: nothing (domain layer has zero dependencies on other layers).
- Produces:
  - `Subscription` type: `{ id: string; clientId: string; planId: PlanId; startDate: Date; endDate: Date; suspended: boolean; amountPaid: number; paymentMethod: PaymentMethod; createdAt: Date }`
  - `Session` type: `{ id: string; type: SessionType; clientId: string | null; visitorName: string | null; visitorPhone: string | null; amountPaid: number; paymentMethod: PaymentMethod; checkedInAt: Date }`
  - `PlanId`, `SessionType`, `PaymentMethod` — re-exported from the Prisma-generated client (these are simple string-union enums with no Prisma-specific behavior, safe for the domain layer to reference directly, same as `Role` is re-exported and consumed in `server/auth/domain/enums.ts`).

- [ ] **Step 1: Check how the existing `Role` enum is re-exported for the domain layer, to follow the same pattern**

Run: read `server/auth/domain/enums.ts` in full. Confirm it does `export type Role = 'ADMIN' | 'AGENT'` (a hand-written string union, NOT `import { Role } from '.../lib/generated/prisma/client'`) — the established convention in this codebase is to hand-write domain-layer enum types as plain string unions, not import Prisma's generated enum type, keeping the domain layer's only dependency on Prisma being structural type-shape agreement, not an actual import.

- [ ] **Step 2: Write `entities.ts`**

```ts
// server/client-portal-history/domain/entities.ts
export type PlanId = 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL'
export type SessionType = 'SUBSCRIBER' | 'VISITOR'
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY'

export type Subscription = {
  id: string
  clientId: string
  planId: PlanId
  startDate: Date
  endDate: Date
  suspended: boolean
  amountPaid: number
  paymentMethod: PaymentMethod
  createdAt: Date
}

export type Session = {
  id: string
  type: SessionType
  clientId: string | null
  visitorName: string | null
  visitorPhone: string | null
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: Date
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (domain files have no imports, so this should be trivially clean).

- [ ] **Step 4: Commit**

```bash
git add server/client-portal-history/domain
git commit -m "feat: add Subscription/Session domain entities"
```

---

## Task 3: `SubscriptionRepository` interface and Prisma implementation

**Files:**
- Create: `server/client-portal-history/repositories/subscription.repository.ts`
- Create: `server/client-portal-history/infrastructure/prisma-subscription.repository.ts`
- Create: `server/client-portal-history/infrastructure/test-helpers/clean-client-portal-history-tables.ts`
- Test: `server/client-portal-history/infrastructure/prisma-subscription.repository.test.ts`

**Interfaces:**
- Consumes: `Subscription` (Task 2, `server/client-portal-history/domain/entities.ts`), `prismaClient` (`server/shared/prisma-client.ts`, already exists).
- Produces:
  ```ts
  export interface SubscriptionRepository {
    findAllByClientId(clientId: string): Promise<Subscription[]>
    findLatestByClientId(clientId: string): Promise<Subscription | null>
  }
  ```
  `PrismaSubscriptionRepository implements SubscriptionRepository`, plus `cleanClientPortalHistoryTables(): Promise<void>` test helper (shared by this and Task 4's session repository tests).

- [ ] **Step 1: Write the repository interface**

```ts
// server/client-portal-history/repositories/subscription.repository.ts
import type { Subscription } from '../domain/entities'

export interface SubscriptionRepository {
  /** All subscriptions for a client, ordered by endDate descending (most recent first). */
  findAllByClientId(clientId: string): Promise<Subscription[]>
  /**
   * The subscription with the latest endDate for a client, or null if none exist. Pure data
   * access — no judgment about whether it's still valid ("current"); that's the service's job.
   */
  findLatestByClientId(clientId: string): Promise<Subscription | null>
}
```

- [ ] **Step 2: Write the test-helper for table cleanup**

```ts
// server/client-portal-history/infrastructure/test-helpers/clean-client-portal-history-tables.ts
import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all rows from the subscriptions and sessions tables. Call before each integration test for isolation. */
export async function cleanClientPortalHistoryTables(): Promise<void> {
  await prismaClient.session.deleteMany()
  await prismaClient.subscription.deleteMany()
}
```

Note: `session` is deleted first since it has no FK dependency on `subscription`, but both have `onDelete: Cascade` from `Client` anyway — order here doesn't strictly matter, but deleting the table with no dependents first is a harmless convention to follow.

- [ ] **Step 3: Write the failing integration tests**

```ts
// server/client-portal-history/infrastructure/prisma-subscription.repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientPortalHistoryTables } from './test-helpers/clean-client-portal-history-tables'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { PrismaClientRepository } from '../../clients/infrastructure/prisma-client.repository'
import { PrismaSubscriptionRepository } from './prisma-subscription.repository'

const clientRepository = new PrismaClientRepository(prismaClient)
const repository = new PrismaSubscriptionRepository(prismaClient)

async function createTestClient(phone: string): Promise<string> {
  const client = await clientRepository.create({ name: 'Test Client', phone })
  return client.id
}

beforeEach(async () => {
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('PrismaSubscriptionRepository.findAllByClientId', () => {
  it('returns all subscriptions for a client, ordered by endDate descending', async () => {
    const clientId = await createTestClient('+33600001001')
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'QUARTERLY',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-05-01'),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })

    const results = await repository.findAllByClientId(clientId)

    expect(results).toHaveLength(2)
    expect(results[0].planId).toBe('QUARTERLY')
    expect(results[1].planId).toBe('MONTHLY')
  })

  it('returns an empty array when the client has no subscriptions', async () => {
    const clientId = await createTestClient('+33600001002')

    const results = await repository.findAllByClientId(clientId)

    expect(results).toEqual([])
  })

  it('never returns another client\'s subscriptions', async () => {
    const clientId = await createTestClient('+33600001003')
    const otherClientId = await createTestClient('+33600001004')
    await prismaClient.subscription.create({
      data: {
        clientId: otherClientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })

    const results = await repository.findAllByClientId(clientId)

    expect(results).toEqual([])
  })
})

describe('PrismaSubscriptionRepository.findLatestByClientId', () => {
  it('returns the subscription with the latest endDate', async () => {
    const clientId = await createTestClient('+33600001005')
    await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    const latest = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'QUARTERLY',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-05-01'),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })

    const result = await repository.findLatestByClientId(clientId)

    expect(result?.id).toBe(latest.id)
  })

  it('returns null when the client has no subscriptions', async () => {
    const clientId = await createTestClient('+33600001006')

    const result = await repository.findLatestByClientId(clientId)

    expect(result).toBeNull()
  })

  it('includes a suspended subscription if it is still the latest by endDate', async () => {
    const clientId = await createTestClient('+33600001007')
    const suspended = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'ANNUAL',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-01-01'),
        suspended: true,
        amountPaid: 350,
        paymentMethod: 'MOBILE_MONEY',
      },
    })

    const result = await repository.findLatestByClientId(clientId)

    expect(result?.id).toBe(suspended.id)
    expect(result?.suspended).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run server/client-portal-history/infrastructure/prisma-subscription.repository.test.ts`
Expected: FAIL — `Cannot find module './prisma-subscription.repository'`

- [ ] **Step 5: Write the Prisma implementation**

```ts
// server/client-portal-history/infrastructure/prisma-subscription.repository.ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Subscription } from '../domain/entities'
import type { SubscriptionRepository } from '../repositories/subscription.repository'

type PrismaSubscriptionRow = {
  id: string
  clientId: string
  planId: string
  startDate: Date
  endDate: Date
  suspended: boolean
  amountPaid: number
  paymentMethod: string
  createdAt: Date
}

function toDomain(row: PrismaSubscriptionRow): Subscription {
  return {
    id: row.id,
    clientId: row.clientId,
    planId: row.planId as Subscription['planId'],
    startDate: row.startDate,
    endDate: row.endDate,
    suspended: row.suspended,
    amountPaid: row.amountPaid,
    paymentMethod: row.paymentMethod as Subscription['paymentMethod'],
    createdAt: row.createdAt,
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findAllByClientId(clientId: string): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { clientId },
      orderBy: { endDate: 'desc' },
    })
    return rows.map(toDomain)
  }

  async findLatestByClientId(clientId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findFirst({
      where: { clientId },
      orderBy: { endDate: 'desc' },
    })
    return row ? toDomain(row) : null
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/client-portal-history/infrastructure/prisma-subscription.repository.test.ts`
Expected: all tests pass (7 total across the 2 describe blocks above).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/client-portal-history/repositories/subscription.repository.ts server/client-portal-history/infrastructure/prisma-subscription.repository.ts server/client-portal-history/infrastructure/prisma-subscription.repository.test.ts server/client-portal-history/infrastructure/test-helpers
git commit -m "feat: add SubscriptionRepository interface and Prisma implementation"
```

---

## Task 4: `SessionRepository` interface, Prisma implementation, and CHECK constraint test

**Files:**
- Create: `server/client-portal-history/repositories/session.repository.ts`
- Create: `server/client-portal-history/infrastructure/prisma-session.repository.ts`
- Test: `server/client-portal-history/infrastructure/prisma-session.repository.test.ts`

**Interfaces:**
- Consumes: `Session` (Task 2), `prismaClient` (already exists).
- Produces:
  ```ts
  export interface SessionRepository {
    findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
  }
  ```
  `PrismaSessionRepository implements SessionRepository`.

- [ ] **Step 1: Write the repository interface**

```ts
// server/client-portal-history/repositories/session.repository.ts
import type { Session } from '../domain/entities'

export interface SessionRepository {
  /** The N most recent sessions for a client, ordered by checkedInAt descending. */
  findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
}
```

- [ ] **Step 2: Write the failing integration tests**

```ts
// server/client-portal-history/infrastructure/prisma-session.repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientPortalHistoryTables } from './test-helpers/clean-client-portal-history-tables'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { PrismaClientRepository } from '../../clients/infrastructure/prisma-client.repository'
import { PrismaSessionRepository } from './prisma-session.repository'

const clientRepository = new PrismaClientRepository(prismaClient)
const repository = new PrismaSessionRepository(prismaClient)

async function createTestClient(phone: string): Promise<string> {
  const client = await clientRepository.create({ name: 'Test Client', phone })
  return client.id
}

beforeEach(async () => {
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('PrismaSessionRepository.findRecentByClientId', () => {
  it('returns sessions ordered by checkedInAt descending', async () => {
    const clientId = await createTestClient('+33600002001')
    await prismaClient.session.create({
      data: {
        type: 'SUBSCRIBER',
        clientId,
        amountPaid: 8,
        paymentMethod: 'CASH',
        checkedInAt: new Date('2026-01-01T10:00:00Z'),
      },
    })
    const mostRecent = await prismaClient.session.create({
      data: {
        type: 'SUBSCRIBER',
        clientId,
        amountPaid: 8,
        paymentMethod: 'CARD',
        checkedInAt: new Date('2026-01-05T10:00:00Z'),
      },
    })

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(mostRecent.id)
  })

  it('respects the limit parameter', async () => {
    const clientId = await createTestClient('+33600002002')
    for (let i = 0; i < 5; i++) {
      await prismaClient.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId,
          amountPaid: 8,
          paymentMethod: 'CASH',
          checkedInAt: new Date(2026, 0, i + 1),
        },
      })
    }

    const results = await repository.findRecentByClientId(clientId, 2)

    expect(results).toHaveLength(2)
  })

  it('returns an empty array when the client has no sessions', async () => {
    const clientId = await createTestClient('+33600002003')

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toEqual([])
  })

  it('never returns another client\'s sessions', async () => {
    const clientId = await createTestClient('+33600002004')
    const otherClientId = await createTestClient('+33600002005')
    await prismaClient.session.create({
      data: { type: 'SUBSCRIBER', clientId: otherClientId, amountPaid: 8, paymentMethod: 'CASH' },
    })

    const results = await repository.findRecentByClientId(clientId, 20)

    expect(results).toEqual([])
  })

  it('maps a VISITOR session correctly (clientId null, visitor fields populated)', async () => {
    // Confirms the repository's row mapper correctly round-trips the VISITOR shape even
    // though this plan's actual callers only ever query by clientId (never encountering a
    // VISITOR row in practice) — the Session domain type must still map it correctly since
    // the schema/repository already support it for the future staff-CRUD plan.
    await prismaClient.session.create({
      data: {
        type: 'VISITOR',
        visitorName: 'Nadia Ferrand',
        visitorPhone: '+33698765432',
        amountPaid: 8,
        paymentMethod: 'CASH',
      },
    })

    // No client-scoped query would return this row (it has no clientId), so directly
    // assert the constraint/mapping shape via a raw check instead of going through
    // findRecentByClientId (which requires a clientId this row deliberately lacks).
    const row = await prismaClient.session.findFirst({ where: { type: 'VISITOR' } })
    expect(row?.clientId).toBeNull()
    expect(row?.visitorName).toBe('Nadia Ferrand')
  })
})

describe('sessions_type_consistency_check constraint', () => {
  it('rejects a SUBSCRIBER session with a visitor field set', async () => {
    await expect(
      prismaClient.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId: null,
          visitorName: 'Should Fail',
          amountPaid: 8,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects a VISITOR session with no visitor fields set', async () => {
    await expect(
      prismaClient.session.create({
        data: {
          type: 'VISITOR',
          amountPaid: 8,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects a SUBSCRIBER session with no clientId', async () => {
    await expect(
      prismaClient.session.create({
        data: {
          type: 'SUBSCRIBER',
          amountPaid: 8,
          paymentMethod: 'CASH',
        },
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/client-portal-history/infrastructure/prisma-session.repository.test.ts`
Expected: FAIL — `Cannot find module './prisma-session.repository'` (the `sessions_type_consistency_check` describe block's tests will fail for a different reason at this point since `prismaClient.session` itself doesn't exist without Task 1 — confirm Task 1 is already applied; if these three tests instead fail because the INSERT unexpectedly succeeds, STOP — the constraint from Task 1 Step 6-7 isn't actually applied, go back and fix it before continuing).

- [ ] **Step 4: Write the Prisma implementation**

```ts
// server/client-portal-history/infrastructure/prisma-session.repository.ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { Session } from '../domain/entities'
import type { SessionRepository } from '../repositories/session.repository'

type PrismaSessionRow = {
  id: string
  type: string
  clientId: string | null
  visitorName: string | null
  visitorPhone: string | null
  amountPaid: number
  paymentMethod: string
  checkedInAt: Date
}

function toDomain(row: PrismaSessionRow): Session {
  return {
    id: row.id,
    type: row.type as Session['type'],
    clientId: row.clientId,
    visitorName: row.visitorName,
    visitorPhone: row.visitorPhone,
    amountPaid: row.amountPaid,
    paymentMethod: row.paymentMethod as Session['paymentMethod'],
    checkedInAt: row.checkedInAt,
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findRecentByClientId(clientId: string, limit: number): Promise<Session[]> {
    const rows = await this.prisma.session.findMany({
      where: { clientId },
      orderBy: { checkedInAt: 'desc' },
      take: limit,
    })
    return rows.map(toDomain)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/client-portal-history/infrastructure/prisma-session.repository.test.ts`
Expected: all tests pass (8 total: 5 in `findRecentByClientId` + 3 in `sessions_type_consistency_check`).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/client-portal-history/repositories/session.repository.ts server/client-portal-history/infrastructure/prisma-session.repository.ts server/client-portal-history/infrastructure/prisma-session.repository.test.ts
git commit -m "feat: add SessionRepository interface and Prisma implementation"
```

- [ ] **Step 8: Flag for code review**

This completes the repository layer (Tasks 2-4). Per this project's standing rule, run the code-review skill on the diff so far before proceeding.

---

## Task 5: `ClientHistoryService` — orchestration and "current subscription" business rule

**Files:**
- Create: `server/client-portal-history/services/client-history.service.ts`
- Create: `server/client-portal-history/services/default-client-history.service.ts`
- Test: `server/client-portal-history/services/default-client-history.service.test.ts`

**Interfaces:**
- Consumes: `Subscription`, `Session` (Task 2), `SubscriptionRepository` (Task 3), `SessionRepository` (Task 4).
- Produces:
  ```ts
  export type ClientHistory = {
    currentSubscription: Subscription | null
    subscriptions: Subscription[]
    recentSessions: Session[]
  }

  export interface ClientHistoryService {
    getHistory(clientId: string): Promise<ClientHistory>
  }
  ```
  `DefaultClientHistoryService implements ClientHistoryService`, constructor takes `(subscriptionRepository: SubscriptionRepository, sessionRepository: SessionRepository)`.

- [ ] **Step 1: Write the service interface**

```ts
// server/client-portal-history/services/client-history.service.ts
import type { Session, Subscription } from '../domain/entities'

export type ClientHistory = {
  currentSubscription: Subscription | null
  subscriptions: Subscription[]
  recentSessions: Session[]
}

export interface ClientHistoryService {
  getHistory(clientId: string): Promise<ClientHistory>
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// server/client-portal-history/services/default-client-history.service.test.ts
import { describe, expect, it } from 'vitest'
import type { Session, Subscription } from '../domain/entities'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import { DefaultClientHistoryService } from './default-client-history.service'

const ACTIVE_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date(),
}

const EXPIRED_SUBSCRIPTION: Subscription = {
  ...ACTIVE_SUBSCRIPTION,
  id: 'sub2',
  endDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
}

const SUSPENDED_SUBSCRIPTION: Subscription = {
  ...ACTIVE_SUBSCRIPTION,
  id: 'sub3',
  suspended: true,
}

const SESSION: Session = {
  id: 'sess1',
  type: 'SUBSCRIBER',
  clientId: 'c1',
  visitorName: null,
  visitorPhone: null,
  amountPaid: 8,
  paymentMethod: 'CASH',
  checkedInAt: new Date(),
}

function fakeSubscriptionRepository(overrides: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    findAllByClientId: async () => [],
    findLatestByClientId: async () => null,
    ...overrides,
  }
}

function fakeSessionRepository(overrides: Partial<SessionRepository> = {}): SessionRepository {
  return {
    findRecentByClientId: async () => [],
    ...overrides,
  }
}

describe('DefaultClientHistoryService.getHistory', () => {
  it('returns the latest subscription as current when it has not expired', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [ACTIVE_SUBSCRIPTION],
        findLatestByClientId: async () => ACTIVE_SUBSCRIPTION,
      }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription?.id).toBe('sub1')
  })

  it('returns null for current when the latest subscription has expired', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [EXPIRED_SUBSCRIPTION],
        findLatestByClientId: async () => EXPIRED_SUBSCRIPTION,
      }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription).toBeNull()
  })

  it('returns null for current when the client has no subscriptions', async () => {
    const service = new DefaultClientHistoryService(fakeSubscriptionRepository(), fakeSessionRepository())

    const history = await service.getHistory('c1')

    expect(history.currentSubscription).toBeNull()
  })

  it('treats a suspended-but-unexpired subscription as still current', async () => {
    // "Current" here means "on file and not yet expired" — the active/suspended/expiring
    // distinction is a display concern computed by the frontend's computeSubscriptionStatus(),
    // not by this backend (see design doc's "statut non calculé côté backend" decision).
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [SUSPENDED_SUBSCRIPTION],
        findLatestByClientId: async () => SUSPENDED_SUBSCRIPTION,
      }),
      fakeSessionRepository(),
    )

    const history = await service.getHistory('c1')

    expect(history.currentSubscription?.id).toBe('sub3')
    expect(history.currentSubscription?.suspended).toBe(true)
  })

  it('returns the full subscriptions list and recent sessions unchanged', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [ACTIVE_SUBSCRIPTION, EXPIRED_SUBSCRIPTION],
        findLatestByClientId: async () => ACTIVE_SUBSCRIPTION,
      }),
      fakeSessionRepository({ findRecentByClientId: async () => [SESSION] }),
    )

    const history = await service.getHistory('c1')

    expect(history.subscriptions).toEqual([ACTIVE_SUBSCRIPTION, EXPIRED_SUBSCRIPTION])
    expect(history.recentSessions).toEqual([SESSION])
  })

  it('passes the RECENT_SESSIONS_LIMIT constant (20) to findRecentByClientId', async () => {
    const calls: number[] = []
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        findRecentByClientId: async (_clientId, limit) => {
          calls.push(limit)
          return []
        },
      }),
    )

    await service.getHistory('c1')

    expect(calls).toEqual([20])
  })

  it('never lets a raw repository error message escape getHistory', async () => {
    const service = new DefaultClientHistoryService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeSessionRepository(),
    )

    await expect(service.getHistory('c1')).rejects.toThrow('internal-error')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/client-portal-history/services/default-client-history.service.test.ts`
Expected: FAIL — `Cannot find module './default-client-history.service'`

- [ ] **Step 4: Write the implementation**

```ts
// server/client-portal-history/services/default-client-history.service.ts
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { ClientHistory, ClientHistoryService } from './client-history.service'

const RECENT_SESSIONS_LIMIT = 20

/**
 * Same anti-leak boundary as DefaultClientService (server/clients/services/default-client.service.ts):
 * any unexpected error (Prisma, connection) is logged server-side and rethrown as a generic
 * error whose message is safe to eventually surface in an HTTP response. No Prisma message,
 * code, or constraint name is ever allowed past this boundary.
 */
async function guardAgainstLeakingInternals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error('[ClientHistoryService] unexpected repository failure', cause)
    throw new Error('internal-error')
  }
}

export class DefaultClientHistoryService implements ClientHistoryService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async getHistory(clientId: string): Promise<ClientHistory> {
    return guardAgainstLeakingInternals(async () => {
      const [subscriptions, latestSubscription, recentSessions] = await Promise.all([
        this.subscriptionRepository.findAllByClientId(clientId),
        this.subscriptionRepository.findLatestByClientId(clientId),
        this.sessionRepository.findRecentByClientId(clientId, RECENT_SESSIONS_LIMIT),
      ])

      // "Current" is a temporal business judgment (is this subscription still valid as of
      // now?), not a data-access concern — deliberately kept out of the repository layer so
      // this rule can evolve (grace periods, a future stored status...) without touching
      // persistence. A suspended-but-unexpired subscription still counts as current; the
      // active/suspended/expiring distinction is a frontend display concern.
      const now = new Date()
      const currentSubscription = latestSubscription && latestSubscription.endDate > now ? latestSubscription : null

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/client-portal-history/services/default-client-history.service.test.ts`
Expected: all tests pass (7 total).

- [ ] **Step 6: Verify no forbidden imports leaked into the service layer**

Run: `grep -n "next/server\|@prisma/client\|generated/prisma" server/client-portal-history/services/*.ts`
Expected: no output (services depend only on domain/repository interfaces, never Prisma or Next.js types directly).

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/client-portal-history/services
git commit -m "feat: add ClientHistoryService deriving current subscription from repository data"
```

- [ ] **Step 9: Flag for code review**

This completes the service layer. Per this project's standing rule, run the code-review skill on the diff so far (Task 5) before proceeding.

---

## Task 6: Composition root — wire `clientHistoryService`

**Files:**
- Modify: `server/shared/container.ts`

**Interfaces:**
- Consumes: `PrismaSubscriptionRepository` (Task 3), `PrismaSessionRepository` (Task 4), `DefaultClientHistoryService` (Task 5), `prismaClient` (already imported in this file).
- Produces: `Container.clientHistoryService: ClientHistoryService`, accessible via the existing `getContainer()` function.

- [ ] **Step 1: Modify `container.ts`**

Add imports (alongside the existing clients imports):

```ts
import { PrismaSubscriptionRepository } from '../client-portal-history/infrastructure/prisma-subscription.repository'
import { PrismaSessionRepository } from '../client-portal-history/infrastructure/prisma-session.repository'
import { DefaultClientHistoryService } from '../client-portal-history/services/default-client-history.service'
import type { ClientHistoryService } from '../client-portal-history/services/client-history.service'
```

Add `clientHistoryService` to the `Container` type:

```ts
export type Container = {
  staffAuthService: StaffAuthService
  clientAuthService: ClientAuthService
  refreshTokenLookupService: RefreshTokenLookupService
  clientService: ClientService
  clientHistoryService: ClientHistoryService
}
```

Inside `createContainer()`, before the `return` statement, add:

```ts
  const subscriptionRepository = new PrismaSubscriptionRepository(prismaClient)
  const sessionRepository = new PrismaSessionRepository(prismaClient)
  const clientHistoryService = new DefaultClientHistoryService(subscriptionRepository, sessionRepository)
```

Update the `return` statement:

```ts
  return { staffAuthService, clientAuthService, refreshTokenLookupService, clientService, clientHistoryService }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full existing test suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: all previously-passing tests still pass (243 as of the last plan in this project, plus the new tests from Tasks 3-5 of this plan).

- [ ] **Step 4: Commit**

```bash
git add server/shared/container.ts
git commit -m "feat: wire ClientHistoryService into the composition root"
```

---

## Task 7: Extend `get-my-client-profile.controller.ts`

**Files:**
- Modify: `server/clients/http/get-my-client-profile.controller.ts`
- Modify: `server/clients/http/get-my-client-profile.controller.test.ts`

**Interfaces:**
- Consumes: `getContainer()` (Task 6), `requireClientAuth` (already exists), `apiSuccess` (already exists).
- Produces: no new exports — `getMyClientProfileController`'s signature is unchanged (`(req: NextRequest) => Promise<NextResponse>`); only its response body's `data` shape changes (`{ client }` → `{ client, subscription, subscriptionHistory, sessionHistory }`).

- [ ] **Step 1: Write the failing/updated tests**

Replace the full contents of `server/clients/http/get-my-client-profile.controller.test.ts`:

```ts
// server/clients/http/get-my-client-profile.controller.test.ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { clientRequestOtpController } from '../../auth/http/client-request-otp.controller'
import { clientVerifyOtpController } from '../../auth/http/client-verify-otp.controller'
import { cleanClientsTable } from '../infrastructure/test-helpers/clean-clients-table'
import { cleanClientPortalHistoryTables } from '../../client-portal-history/infrastructure/test-helpers/clean-client-portal-history-tables'
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
  await cleanClientPortalHistoryTables()
  await cleanClientsTable()
})

describe('getMyClientProfileController', () => {
  it('returns 401 when no client session is present', async () => {
    const res = await getMyClientProfileController(new NextRequest('https://example.com/api/client/me/profile'))

    expect(res.status).toBe(401)
  })

  it('returns null/empty history when the session has no linked Client', async () => {
    await prismaClient.clientAccount.create({ data: { phone: '+33612345601', name: 'No Link' } })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345601')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.client).toBeNull()
    expect(json.data.subscription).toBeNull()
    expect(json.data.subscriptionHistory).toEqual([])
    expect(json.data.sessionHistory).toEqual([])
  })

  it('returns the linked Client with empty history when it has no subscriptions/sessions', async () => {
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
    expect(json.data.subscription).toBeNull()
    expect(json.data.subscriptionHistory).toEqual([])
    expect(json.data.sessionHistory).toEqual([])
  })

  it('returns the current subscription, full history, and recent sessions for a client with data', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345603', name: 'Has History' } })
    const client = await prismaClient.client.create({
      data: { name: 'Has History', phone: '+33612345603', clientAccountId: account.id },
    })
    await prismaClient.subscription.create({
      data: {
        clientId: client.id,
        planId: 'MONTHLY',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })
    const current = await prismaClient.subscription.create({
      data: {
        clientId: client.id,
        planId: 'QUARTERLY',
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
        amountPaid: 105,
        paymentMethod: 'CARD',
      },
    })
    await prismaClient.session.create({
      data: { type: 'SUBSCRIBER', clientId: client.id, amountPaid: 8, paymentMethod: 'CASH' },
    })
    const cookie = await verifyAndGetAccessTokenCookie('+33612345603')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.subscription.id).toBe(current.id)
    expect(json.data.subscriptionHistory).toHaveLength(2)
    expect(json.data.sessionHistory).toHaveLength(1)
  })

  it('caps sessionHistory at 20 even when more sessions exist', async () => {
    const account = await prismaClient.clientAccount.create({ data: { phone: '+33612345604', name: 'Frequent Visitor' } })
    const client = await prismaClient.client.create({
      data: { name: 'Frequent Visitor', phone: '+33612345604', clientAccountId: account.id },
    })
    for (let i = 0; i < 25; i++) {
      await prismaClient.session.create({
        data: { type: 'SUBSCRIBER', clientId: client.id, amountPaid: 8, paymentMethod: 'CASH' },
      })
    }
    const cookie = await verifyAndGetAccessTokenCookie('+33612345604')

    const res = await getMyClientProfileController(profileRequest(cookie))
    const json = await res.json()

    expect(json.data.sessionHistory).toHaveLength(20)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/clients/http/get-my-client-profile.controller.test.ts`
Expected: FAIL — the controller still returns only `{ client }`, so `json.data.subscription`/`subscriptionHistory`/`sessionHistory` are all `undefined`, failing the new assertions.

- [ ] **Step 3: Update the controller**

Replace the full contents of `server/clients/http/get-my-client-profile.controller.ts`:

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
    const { clientService, clientHistoryService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)

    if (!client) {
      return NextResponse.json(apiSuccess({
        client: null,
        subscription: null,
        subscriptionHistory: [],
        sessionHistory: [],
      }))
    }

    const history = await clientHistoryService.getHistory(client.id)
    return NextResponse.json(apiSuccess({
      client,
      subscription: history.currentSubscription,
      subscriptionHistory: history.subscriptions,
      sessionHistory: history.recentSessions,
    }))
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/clients/http/get-my-client-profile.controller.test.ts`
Expected: all tests pass (6 total).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/clients/http/get-my-client-profile.controller.ts server/clients/http/get-my-client-profile.controller.test.ts
git commit -m "feat: enrich GET /api/client/me/profile with real subscription/session history"
```

- [ ] **Step 8: Flag for code review**

This completes the HTTP layer and the module as a whole (Tasks 1-7). Per this project's standing rule, run the code-review skill on the full diff before proceeding to the seed extension.

---

## Task 8: Seed data — realistic subscriptions/sessions for the linked clients

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma.subscription`, `prisma.session`, `prisma.staffAccount` (Prisma-generated, already exist).
- Produces: no new exports — data-only change to the seed script.

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

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  for (const staff of STAFF_SEED) {
    const passwordHash = await argon2.hash(staff.password)
    await prisma.staffAccount.upsert({
      where: { email: staff.email },
      update: { passwordHash, name: staff.name, role: staff.role },
      create: { email: staff.email, passwordHash, name: staff.name, role: staff.role },
    })
  }

  const admin = await prisma.staffAccount.findUniqueOrThrow({ where: { email: 'admin@atlas.fit' } })

  const linkedClients: Record<string, string> = {}

  for (const seed of CLIENT_ACCOUNT_SEED) {
    const account = await prisma.clientAccount.upsert({
      where: { phone: seed.phone },
      update: { name: seed.name },
      create: { phone: seed.phone, name: seed.name },
    })

    if (seed.linkToClient) {
      let client = await prisma.client.findUnique({ where: { clientAccountId: account.id } })
      if (!client) {
        client = await prisma.client.create({
          data: { name: seed.name, phone: seed.phone, clientAccountId: account.id },
        })
      }
      linkedClients[seed.phone] = client.id
    }
  }

  // Yasmine Kaddour: active current subscription + one past subscription + recent sessions.
  const yasmineId = linkedClients['+33612345601']
  if (yasmineId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: yasmineId } })
    if (!hasSubscriptions) {
      await prisma.subscription.create({
        data: {
          clientId: yasmineId,
          planId: 'MONTHLY',
          startDate: new Date(Date.now() - 120 * DAY_MS),
          endDate: new Date(Date.now() - 90 * DAY_MS),
          amountPaid: 40,
          paymentMethod: 'CASH',
          createdByStaffId: admin.id,
        },
      })
      await prisma.subscription.create({
        data: {
          clientId: yasmineId,
          planId: 'QUARTERLY',
          startDate: new Date(Date.now() - 30 * DAY_MS),
          endDate: new Date(Date.now() + 60 * DAY_MS),
          amountPaid: 105,
          paymentMethod: 'CARD',
          createdByStaffId: admin.id,
        },
      })
      await prisma.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId: yasmineId,
          amountPaid: 8,
          paymentMethod: 'CASH',
          checkedInAt: new Date(Date.now() - 2 * DAY_MS),
          createdByStaffId: admin.id,
        },
      })
      await prisma.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId: yasmineId,
          amountPaid: 8,
          paymentMethod: 'CARD',
          checkedInAt: new Date(Date.now() - 1 * DAY_MS),
          createdByStaffId: admin.id,
        },
      })
    }
  }

  // Marc Delaunay: expired subscription only (currentSubscription should resolve to null).
  const marcId = linkedClients['+33612345602']
  if (marcId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: marcId } })
    if (!hasSubscriptions) {
      await prisma.subscription.create({
        data: {
          clientId: marcId,
          planId: 'MONTHLY',
          startDate: new Date(Date.now() - 60 * DAY_MS),
          endDate: new Date(Date.now() - 30 * DAY_MS),
          amountPaid: 40,
          paymentMethod: 'MOBILE_MONEY',
          createdByStaffId: admin.id,
        },
      })
      await prisma.session.create({
        data: {
          type: 'SUBSCRIBER',
          clientId: marcId,
          amountPaid: 8,
          paymentMethod: 'CASH',
          checkedInAt: new Date(Date.now() - 35 * DAY_MS),
          createdByStaffId: admin.id,
        },
      })
    }
  }

  // Inès Fabre: current subscription but suspended (tests the suspended badge in the portal).
  const inesId = linkedClients['+33612345603']
  if (inesId) {
    const hasSubscriptions = await prisma.subscription.findFirst({ where: { clientId: inesId } })
    if (!hasSubscriptions) {
      await prisma.subscription.create({
        data: {
          clientId: inesId,
          planId: 'ANNUAL',
          startDate: new Date(Date.now() - 30 * DAY_MS),
          endDate: new Date(Date.now() + 335 * DAY_MS),
          suspended: true,
          amountPaid: 350,
          paymentMethod: 'CARD',
          createdByStaffId: admin.id,
        },
      })
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

Note: each client's subscription/session block is guarded by `if (!hasSubscriptions)` — same idempotency approach as the existing `Client` linking logic (`findUnique` + conditional `create`), so re-running the seed doesn't duplicate rows.

- [ ] **Step 2: Run the seed against the dev database**

Run: `npx prisma db seed`
Expected: exits 0 with no error output. This writes to the real dev database — if `DATABASE_URL` doesn't clearly point to a local/known dev instance, stop and confirm before proceeding (this project's established workflow already runs seeds routinely against the dev DB).

- [ ] **Step 3: Verify the seed data manually**

```bash
psql "$DATABASE_URL" -c "SELECT c.name, s.\"planId\", s.\"endDate\", s.suspended FROM subscriptions s JOIN clients c ON c.id = s.\"clientId\" ORDER BY c.name, s.\"endDate\";"
```

Expected: 3 rows for Yasmine Kaddour (2 subscriptions — wait, 2 rows), 1 row for Marc Delaunay, 1 row for Inès Fabre (suspended = true), matching the data written above.

- [ ] **Step 4: Re-run the seed to confirm idempotency**

Run: `npx prisma db seed`
Expected: exits 0, no duplicate rows (re-verify with the same query from Step 3 — row counts must be identical to the first run).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed realistic Subscription/Session data for the linked clients"
```

---

## Task 9: Live verification

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
curl -s -X POST http://localhost:3000/api/auth/client/request-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345601"}' -o /dev/null -w "%{http_code}\n"

curl -s -c .scratch/history-verify.txt -X POST http://localhost:3000/api/auth/client/verify-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345601","code":"123456"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/history-verify.txt http://localhost:3000/api/client/me/profile -w "\n%{http_code}\n"
```
Expected: request-otp `200`; verify-otp `200`; profile request `200` with `data.subscription.planId === "QUARTERLY"`, `data.subscriptionHistory` containing 2 entries, `data.sessionHistory` containing 2 entries — matching Yasmine Kaddour's seeded data.

```bash
curl -s -X POST http://localhost:3000/api/auth/client/request-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345602"}' -o /dev/null -w "%{http_code}\n"

curl -s -c .scratch/history-verify-2.txt -X POST http://localhost:3000/api/auth/client/verify-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33612345602","code":"123456"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/history-verify-2.txt http://localhost:3000/api/client/me/profile -w "\n%{http_code}\n"
```
Expected: `200` with `data.subscription === null` (Marc Delaunay's only subscription is expired) and `data.subscriptionHistory` containing 1 entry.

- [ ] **Step 4: Clean up**

```bash
rm -f .scratch/history-verify.txt .scratch/history-verify-2.txt
```

No commit needed for this task — verification only.

---

## Out of scope (confirmed by the design doc, do not implement here)

- Staff CRUD (create/renew/suspend subscription, record subscriber/visitor session) — separate future plan, brainstormed once these models are in place.
- `Plan` as an editable database table — stays a static frontend constant.
- Zod DTO validation for writing Subscription/Session — no write path in this plan to attach it to.
- Pagination on `subscriptionHistory` — stays unbounded.
- Migrating mocked `cl1`..`cl18` staff-side data (Abonnements/Séances screens) — untouched by this plan; only the 3 already-linked seeded clients get real history data.
- Backend computation of `subscriptionStatus` — frontend keeps `computeSubscriptionStatus()` unchanged.
- A separate `Payment` model — documented divergence from `ARCHITECTURE_RULES.md` §4, to revisit at staff-CRUD time.
- Frontend changes (`MyProfileProvider`'s mock-splice removal, `demo` badge removal) — separate frontend-owned plan, per this project's role split; this plan only delivers the backend contract.
