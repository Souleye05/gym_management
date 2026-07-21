# Staff Memberships CRUD Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's in-memory mock for staff subscription/session management with a real Prisma-backed backend: create/renew/suspend/reactivate a subscription, record a subscriber or visitor session, and a small persisted `AppSettings` table for `sessionPrice`.

**Architecture:** Renames `server/client-portal-history/` to `server/memberships/` (its repositories now serve both the existing read-only client-portal service and new staff write services). Two new services (`StaffSubscriptionService`, `StaffSessionService`) own the business rules; a new `server/settings/` module hosts `AppSettings`. New HTTP routes under `/api/subscriptions`, `/api/sessions`, `/api/settings`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Vitest (integration tests against a real Postgres instance via `prismaClient`), Zod for DTO validation.

## Global Constraints

- The backend computes `amountPaid` and subscription `startDate`/`endDate` — callers never send these values, only `clientId`/`planId`/`paymentMethod`.
- The plan catalog (`PLAN_CATALOG`) is a static backend constant mirroring `lib/subscriptions/plans.ts` — no new Prisma model for plans.
- Overlapping subscriptions are allowed (no guard against creating one while another is valid) — `createOrRenewSubscription` is a single operation covering both "create" and "renew".
- `recordSubscriberSession` enforces eligibility server-side (rejects if the client's latest subscription is suspended, expired, or hasn't started) with an explicit `session-ineligible` error carrying a `reason`.
- No permission restriction on subscription/session write operations — any authenticated staff (ADMIN or AGENT). `PATCH /api/settings` is ADMIN-only (new `settings:update` permission); `GET /api/settings` is open to all staff.
- `AppSettings` is a real persisted singleton row (id `"singleton"`), not a backend constant — this is an explicit, deliberate scope addition beyond the minimum needed for `sessionPrice`.
- Creating a subscription or recording a subscriber session for a deactivated client is rejected (`client-not-found`/`client-inactive`).
- No deletion of subscriptions/sessions, no editing a subscription/session after creation (only suspend/reactivate), no partial payments — `amountPaid` is always the full plan price or session price, matching the mock.
- Every unexpected repository failure must be unreachable as a raw error message from the HTTP response — `guardAgainstLeakingInternals` (service, from `server/shared/guard-against-leaking-internals.ts`) wraps all repository calls; `withInternalErrorHandling` (controller) wraps the whole handler.
- Enum values (`planId`, `paymentMethod`, session `type`) cross the HTTP boundary translated to lowercase, matching `lib/subscriptions/types.ts`/`lib/sessions/types.ts` — same pattern as `get-my-client-profile.controller.ts`'s `PLAN_ID_MAP`/`PAYMENT_METHOD_MAP`.
- After every task, run `npx tsc --noEmit` and the relevant `vitest run` — do not proceed to the next task with a red build.
- A code review must run after Task 1 (rename), Task 5 (both repositories extended), Task 8 (both staff services complete), and Task 12 (all controllers complete) — flag this explicitly to the user at each checkpoint.

---

## File Structure

```
server/memberships/                                    — RENAMED from server/client-portal-history/
  domain/
    entities.ts                                         — unchanged (moved)
    errors.ts                                            — MODIFY: add MembershipDomainError
    plan-catalog.ts                                       — CREATE
    derive-current-subscription.ts                         — CREATE (extracted from default-client-history.service.ts)
    derive-current-subscription.test.ts                    — CREATE
    check-session-eligibility.ts                           — CREATE
    check-session-eligibility.test.ts                      — CREATE
  repositories/
    subscription.repository.ts                             — MODIFY: + findById, create, setSuspended
    session.repository.ts                                  — MODIFY: + create
  infrastructure/
    prisma-subscription.repository.ts                       — MODIFY
    prisma-subscription.repository.test.ts                  — MODIFY
    prisma-session.repository.ts                            — MODIFY
    prisma-session.repository.test.ts                       — MODIFY
    validate-enum.ts / validate-enum.test.ts                 — unchanged (moved)
    test-helpers/
      clean-memberships-tables.ts                            — RENAMED from clean-client-portal-history-tables.ts
      create-test-client.ts                                  — unchanged (moved)
      create-test-staff.ts                                   — CREATE (shared by both repository test files, Tasks 4-5)
  services/
    client-history.service.ts / default-client-history.service.ts        — unchanged behavior (moved, refactored to use derive-current-subscription.ts)
    default-client-history.service.test.ts                    — unchanged (moved)
    staff-subscription.service.ts                              — CREATE
    default-staff-subscription.service.ts                       — CREATE
    default-staff-subscription.service.test.ts                  — CREATE
    staff-session.service.ts                                    — CREATE
    default-staff-session.service.ts                             — CREATE
    default-staff-session.service.test.ts                        — CREATE
  http/
    membership-api-response.ts                                 — CREATE (shared MembershipDomainError -> HTTP status/body mapping)
    subscriptions/
      to-api-subscription.ts                                    — CREATE (shared enum-casing mapper for this module's 3 subscription controllers)
      create-or-renew.controller.ts                            — CREATE
      create-or-renew.controller.test.ts                       — CREATE
      suspend.controller.ts                                    — CREATE
      suspend.controller.test.ts                               — CREATE
      reactivate.controller.ts                                 — CREATE
      reactivate.controller.test.ts                            — CREATE
    sessions/
      to-api-session.ts                                         — CREATE (shared enum-casing mapper for this module's 2 session controllers)
      record-subscriber.controller.ts                          — CREATE
      record-subscriber.controller.test.ts                     — CREATE
      record-visitor.controller.ts                              — CREATE
      record-visitor.controller.test.ts                        — CREATE
  dto/
    subscription.dto.ts                                        — CREATE
    session.dto.ts                                             — CREATE

server/settings/                                        — CREATE (new module)
  domain/entities.ts                                     — CREATE
  repositories/settings.repository.ts                     — CREATE
  infrastructure/
    prisma-settings.repository.ts                          — CREATE
    prisma-settings.repository.test.ts                     — CREATE
  services/
    settings.service.ts                                    — CREATE
    default-settings.service.ts                             — CREATE
    default-settings.service.test.ts                        — CREATE
  http/
    get-settings.controller.ts                              — CREATE
    get-settings.controller.test.ts                         — CREATE
    update-settings.controller.ts                            — CREATE
    update-settings.controller.test.ts                       — CREATE
  dto/settings.dto.ts                                       — CREATE

server/shared/authorization/permissions.ts               — MODIFY: + settings:update
server/shared/authorization/permissions.test.ts           — MODIFY
server/shared/container.ts                                — MODIFY: update import paths, + 3 new services
server/clients/http/get-my-client-profile.controller.ts   — MODIFY: update import path only
server/clients/http/get-my-client-profile.controller.test.ts — MODIFY: update import paths only

prisma/schema.prisma                                      — MODIFY: + AppSettings model
prisma/migrations/<timestamp>_add_app_settings/            — CREATE
prisma/seed.ts                                            — MODIFY: seed AppSettings row

app/api/subscriptions/route.ts                             — CREATE
app/api/subscriptions/[id]/suspend/route.ts                  — CREATE
app/api/subscriptions/[id]/reactivate/route.ts                — CREATE
app/api/sessions/subscriber/route.ts                        — CREATE
app/api/sessions/visitor/route.ts                           — CREATE
app/api/settings/route.ts                                   — CREATE
```

---

## Task 1: Rename `client-portal-history` → `memberships`

**Files:** all files under `server/client-portal-history/**` (moved to `server/memberships/**`), plus `server/shared/container.ts`, `server/clients/http/get-my-client-profile.controller.ts`, `server/clients/http/get-my-client-profile.controller.test.ts`.

**Interfaces:**
- Produces: identical public API to before (`SubscriptionRepository`, `SessionRepository`, `PrismaSubscriptionRepository`, `PrismaSessionRepository`, `ClientHistoryService`, `DefaultClientHistoryService`), just at a new import path. Zero behavior change.

- [ ] **Step 1: Move the directory**

Run:
```bash
git mv server/client-portal-history server/memberships
```

- [ ] **Step 2: Rename the test-helper file and its exported function**

Run:
```bash
git mv server/memberships/infrastructure/test-helpers/clean-client-portal-history-tables.ts server/memberships/infrastructure/test-helpers/clean-memberships-tables.ts
```

Edit `server/memberships/infrastructure/test-helpers/clean-memberships-tables.ts` — replace its content:

```ts
import { prismaClient } from '../../../shared/prisma-client'

/** Deletes all rows from the subscriptions and sessions tables. Call before each integration test for isolation. */
export async function cleanMembershipsTables(): Promise<void> {
  await prismaClient.session.deleteMany()
  await prismaClient.subscription.deleteMany()
}
```

- [ ] **Step 3: Update the two test files inside the module that import the renamed helper**

In `server/memberships/infrastructure/prisma-subscription.repository.test.ts`, change:
```ts
import { cleanClientPortalHistoryTables } from './test-helpers/clean-client-portal-history-tables'
```
to:
```ts
import { cleanMembershipsTables } from './test-helpers/clean-memberships-tables'
```
And every call site `cleanClientPortalHistoryTables()` → `cleanMembershipsTables()` (there is exactly one, inside `beforeEach`).

Apply the identical two changes to `server/memberships/infrastructure/prisma-session.repository.test.ts`.

- [ ] **Step 4: Update `server/shared/container.ts`**

Change these four import lines (paths only, nothing else):
```ts
import { PrismaSubscriptionRepository } from '../memberships/infrastructure/prisma-subscription.repository'
import { PrismaSessionRepository } from '../memberships/infrastructure/prisma-session.repository'
import { DefaultClientHistoryService } from '../memberships/services/default-client-history.service'
import type { ClientHistoryService } from '../memberships/services/client-history.service'
```

- [ ] **Step 5: Update `server/clients/http/get-my-client-profile.controller.ts`**

Change the one import line:
```ts
import type { PlanId, PaymentMethod, Subscription, Session } from '../../memberships/domain/entities'
```

- [ ] **Step 6: Update `server/clients/http/get-my-client-profile.controller.test.ts`**

Change these two import lines:
```ts
import { cleanMembershipsTables } from '../../memberships/infrastructure/test-helpers/clean-memberships-tables'
import type { Session } from '../../memberships/domain/entities'
```
And its one call site in `beforeEach`: `cleanClientPortalHistoryTables()` → `cleanMembershipsTables()`.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, same count as before the rename (no test added or removed in this task).

- [ ] **Step 9: Commit**

```bash
git add -A -- server/memberships server/client-portal-history server/shared/container.ts server/clients/http/get-my-client-profile.controller.ts server/clients/http/get-my-client-profile.controller.test.ts
git commit -m "refactor: rename client-portal-history module to memberships"
```

- [ ] **Step 10: Flag for code review**

This is a pure rename with zero behavior change, but touches every file in the module — flag it for a review pass before building on top of it.

---

## Task 2: Prisma schema — `AppSettings` model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_app_settings/migration.sql` (generated)

**Interfaces:**
- Produces: `PrismaClient.appSettings` accessor with fields `id: string`, `sessionPrice: number`, `updatedAt: Date`.

- [ ] **Step 1: Add the model**

Add to `prisma/schema.prisma`, after the `Session` model:

```prisma
model AppSettings {
  id           String   @id @default("singleton")
  sessionPrice Int
  updatedAt    DateTime @updatedAt

  @@map("app_settings")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_app_settings`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client ... to .\lib\generated\prisma`

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add AppSettings singleton model"
```

---

## Task 3: Domain layer — plan catalog, derive-current-subscription (extracted), check-session-eligibility, errors

**Files:**
- Create: `server/memberships/domain/plan-catalog.ts`
- Create: `server/memberships/domain/derive-current-subscription.ts`
- Create: `server/memberships/domain/derive-current-subscription.test.ts`
- Create: `server/memberships/domain/check-session-eligibility.ts`
- Create: `server/memberships/domain/check-session-eligibility.test.ts`
- Modify: `server/memberships/domain/errors.ts`
- Modify: `server/memberships/services/default-client-history.service.ts`
- Modify: `server/memberships/services/default-client-history.service.test.ts` (no assertion changes — this step only proves the refactor preserves behavior)

**Interfaces:**
- Consumes: `Subscription`, `PlanId` from `server/memberships/domain/entities.ts` (Task 1's new location).
- Produces:
  ```ts
  // plan-catalog.ts
  export const PLAN_CATALOG: Record<PlanId, { durationDays: number; price: number }>
  ```
  ```ts
  // derive-current-subscription.ts
  export function deriveCurrentSubscription(subscriptions: Subscription[], now: Date): Subscription | null
  ```
  ```ts
  // check-session-eligibility.ts
  export type SessionEligibility = { allowed: true } | { allowed: false; reason: 'none' | 'expired' | 'suspended' }
  export function checkSessionEligibility(latest: Subscription | null, now: Date): SessionEligibility
  ```
  ```ts
  // errors.ts
  export type MembershipDomainErrorCode = 'client-not-found' | 'client-inactive' | 'subscription-not-found' | 'session-ineligible'
  export type MembershipDomainError = {
    code: MembershipDomainErrorCode
    message: string
    reason?: 'none' | 'expired' | 'suspended'
  }
  ```

- [ ] **Step 1: Write `plan-catalog.ts`**

```ts
// server/memberships/domain/plan-catalog.ts
import type { PlanId } from './entities'

/**
 * Mirrors lib/subscriptions/plans.ts's PLANS array exactly (same durations/prices). Kept as a
 * static backend constant rather than a DB-backed model — the catalog stays frontend-editable-only
 * territory until an actual need to edit prices without a redeploy exists.
 */
export const PLAN_CATALOG: Record<PlanId, { durationDays: number; price: number }> = {
  MONTHLY: { durationDays: 30, price: 40 },
  QUARTERLY: { durationDays: 90, price: 105 },
  BIANNUAL: { durationDays: 180, price: 190 },
  ANNUAL: { durationDays: 365, price: 350 },
}
```

- [ ] **Step 2: Write the failing test for `deriveCurrentSubscription`**

```ts
// server/memberships/domain/derive-current-subscription.test.ts
import { describe, expect, it } from 'vitest'
import type { Subscription } from './entities'
import { deriveCurrentSubscription } from './derive-current-subscription'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const BASE: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-09-01'),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date('2026-06-01'),
}

describe('deriveCurrentSubscription', () => {
  it('returns the subscription when it has started and not expired', () => {
    expect(deriveCurrentSubscription([BASE], NOW)?.id).toBe('sub1')
  })

  it('returns null when the list is empty', () => {
    expect(deriveCurrentSubscription([], NOW)).toBeNull()
  })

  it('returns null when the latest subscription has expired', () => {
    const expired: Subscription = { ...BASE, endDate: new Date('2026-07-01') }
    expect(deriveCurrentSubscription([expired], NOW)).toBeNull()
  })

  it('returns null when the only subscription has not started yet', () => {
    const future: Subscription = { ...BASE, id: 'sub2', startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    expect(deriveCurrentSubscription([future], NOW)).toBeNull()
  })

  it('skips a not-yet-started future subscription and finds an earlier active one', () => {
    const future: Subscription = { ...BASE, id: 'sub2', startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    // Ordered by endDate desc, as findAllByClientId returns it — future sorts first.
    expect(deriveCurrentSubscription([future, BASE], NOW)?.id).toBe('sub1')
  })

  it('treats a suspended-but-unexpired subscription as still current', () => {
    const suspended: Subscription = { ...BASE, suspended: true }
    const result = deriveCurrentSubscription([suspended], NOW)
    expect(result?.id).toBe('sub1')
    expect(result?.suspended).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/memberships/domain/derive-current-subscription.test.ts`
Expected: FAIL — `Cannot find module './derive-current-subscription'`

- [ ] **Step 4: Write `derive-current-subscription.ts`**

```ts
// server/memberships/domain/derive-current-subscription.ts
import type { Subscription } from './entities'

/**
 * "Current" is a temporal business judgment (is this subscription still valid as of now?), not
 * a data-access concern. `subscriptions` must already be ordered by endDate descending (as
 * SubscriptionRepository.findAllByClientId returns it) — the first entry that has actually
 * started (startDate <= now) is the one with the latest endDate among started subscriptions,
 * skipping past a not-yet-started future renewal. A suspended-but-unexpired subscription still
 * counts as current; the active/suspended/expiring distinction is a frontend display concern.
 */
export function deriveCurrentSubscription(subscriptions: Subscription[], now: Date): Subscription | null {
  const latestStarted = subscriptions.find((subscription) => subscription.startDate <= now) ?? null
  return latestStarted && latestStarted.endDate > now ? latestStarted : null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/memberships/domain/derive-current-subscription.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 6: Refactor `default-client-history.service.ts` to use the extracted function**

Replace the inline derivation in `server/memberships/services/default-client-history.service.ts`:

```ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { deriveCurrentSubscription } from '../domain/derive-current-subscription'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { SessionRepository } from '../repositories/session.repository'
import type { ClientHistory, ClientHistoryService } from './client-history.service'

const SOURCE = 'ClientHistoryService'
const RECENT_SESSIONS_LIMIT = 20

function tagFailure<T>(operation: string, promise: Promise<T>): Promise<T> {
  return promise.catch((cause) => {
    throw new Error(`${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  })
}

export class DefaultClientHistoryService implements ClientHistoryService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async getHistory(clientId: string): Promise<ClientHistory> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const [subscriptions, recentSessions] = await Promise.all([
        tagFailure('findAllByClientId', this.subscriptionRepository.findAllByClientId(clientId)),
        tagFailure(
          'findRecentByClientId',
          this.sessionRepository.findRecentByClientId(clientId, RECENT_SESSIONS_LIMIT),
        ),
      ])

      const currentSubscription = deriveCurrentSubscription(subscriptions, new Date())

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
```

- [ ] **Step 7: Run the existing service tests to confirm zero behavior change**

Run: `npx vitest run server/memberships/services/default-client-history.service.test.ts`
Expected: all 9 tests pass unchanged — this file was not modified, it's proving the refactor preserved behavior exactly.

- [ ] **Step 8: Write the failing test for `checkSessionEligibility`**

```ts
// server/memberships/domain/check-session-eligibility.test.ts
import { describe, expect, it } from 'vitest'
import type { Subscription } from './entities'
import { checkSessionEligibility } from './check-session-eligibility'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const VALID: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-09-01'),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date('2026-06-01'),
}

describe('checkSessionEligibility', () => {
  it('allows a valid, started, unexpired subscription', () => {
    expect(checkSessionEligibility(VALID, NOW)).toEqual({ allowed: true })
  })

  it('denies with reason "none" when there is no subscription at all', () => {
    expect(checkSessionEligibility(null, NOW)).toEqual({ allowed: false, reason: 'none' })
  })

  it('denies with reason "expired" when the subscription has ended', () => {
    const expired: Subscription = { ...VALID, endDate: new Date('2026-07-01') }
    expect(checkSessionEligibility(expired, NOW)).toEqual({ allowed: false, reason: 'expired' })
  })

  it('denies with reason "suspended" when the subscription is suspended', () => {
    const suspended: Subscription = { ...VALID, suspended: true }
    expect(checkSessionEligibility(suspended, NOW)).toEqual({ allowed: false, reason: 'suspended' })
  })

  it('prioritizes "suspended" over "expired" when both are true', () => {
    const both: Subscription = { ...VALID, suspended: true, endDate: new Date('2026-07-01') }
    expect(checkSessionEligibility(both, NOW)).toEqual({ allowed: false, reason: 'suspended' })
  })

  it('denies with reason "none" when the subscription has not started yet', () => {
    const future: Subscription = { ...VALID, startDate: new Date('2026-08-01'), endDate: new Date('2026-11-01') }
    expect(checkSessionEligibility(future, NOW)).toEqual({ allowed: false, reason: 'none' })
  })
})
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run server/memberships/domain/check-session-eligibility.test.ts`
Expected: FAIL — `Cannot find module './check-session-eligibility'`

- [ ] **Step 10: Write `check-session-eligibility.ts`**

```ts
// server/memberships/domain/check-session-eligibility.ts
import type { Subscription } from './entities'

export type SessionEligibility = { allowed: true } | { allowed: false; reason: 'none' | 'expired' | 'suspended' }

/**
 * `latest` is the client's latest subscription by endDate (SubscriptionRepository.findAllByClientId
 * result's first element), NOT deriveCurrentSubscription's result — eligibility looks at the raw
 * latest subscription regardless of whether it has started, so it can report the more specific
 * "suspended"/"expired" reasons instead of collapsing everything into "none". Suspended takes
 * priority over expired when a subscription is both (matches the mock's computeSubscriptionStatus
 * precedence). A not-yet-started subscription denies with reason 'none' — the mock never produces
 * this case (its renewals always chain from max(current end, now)), so no UI message exists yet
 * to distinguish it from "no subscription at all".
 */
export function checkSessionEligibility(latest: Subscription | null, now: Date): SessionEligibility {
  if (!latest) return { allowed: false, reason: 'none' }
  if (latest.suspended) return { allowed: false, reason: 'suspended' }
  if (latest.endDate <= now) return { allowed: false, reason: 'expired' }
  if (latest.startDate > now) return { allowed: false, reason: 'none' }
  return { allowed: true }
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npx vitest run server/memberships/domain/check-session-eligibility.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 12: Fill in `errors.ts`**

Replace the full content of `server/memberships/domain/errors.ts`:

```ts
export type MembershipDomainErrorCode =
  | 'client-not-found'
  | 'client-inactive'
  | 'subscription-not-found'
  | 'session-ineligible'

export type MembershipDomainError = {
  code: MembershipDomainErrorCode
  message: string
  /** Only set when code is 'session-ineligible'. */
  reason?: 'none' | 'expired' | 'suspended'
}
```

- [ ] **Step 13: Type-check and run the whole domain + services test surface**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run server/memberships`
Expected: all tests pass (existing repository/service tests + the 12 new domain tests from this task).

- [ ] **Step 14: Commit**

```bash
git add server/memberships/domain server/memberships/services/default-client-history.service.ts
git commit -m "feat: add plan catalog, extract deriveCurrentSubscription, add checkSessionEligibility"
```

---

## Task 4: `SubscriptionRepository` — add `findById`, `create`, `setSuspended`

**Files:**
- Modify: `server/memberships/repositories/subscription.repository.ts`
- Modify: `server/memberships/infrastructure/prisma-subscription.repository.ts`
- Modify: `server/memberships/infrastructure/prisma-subscription.repository.test.ts`
- Create: `server/memberships/infrastructure/test-helpers/create-test-staff.ts`

**Interfaces:**
- Consumes: `Subscription`, `PlanId`, `PaymentMethod` from `../domain/entities`.
- Produces:
  ```ts
  findById(id: string): Promise<Subscription | null>
  create(input: CreateSubscriptionInput): Promise<Subscription>
  setSuspended(id: string, suspended: boolean): Promise<Subscription>

  type CreateSubscriptionInput = {
    clientId: string
    planId: PlanId
    startDate: Date
    endDate: Date
    amountPaid: number
    paymentMethod: PaymentMethod
    createdByStaffId: string
  }
  ```

- [ ] **Step 1: Update the interface**

Replace the full content of `server/memberships/repositories/subscription.repository.ts`:

```ts
import type { PaymentMethod, PlanId, Subscription } from '../domain/entities'

export type CreateSubscriptionInput = {
  clientId: string
  planId: PlanId
  startDate: Date
  endDate: Date
  amountPaid: number
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface SubscriptionRepository {
  /**
   * All subscriptions for a client, ordered by endDate descending (most recent first, with `id`
   * as a secondary tiebreaker for deterministic ordering on endDate ties). The first element is
   * "the latest" — callers needing that single record use `subscriptions[0] ?? null` rather than
   * a separate query, since a second `findFirst` with the same ordering would just recompute the
   * same answer via an extra round-trip. Pure data access — no judgment about whether the latest
   * is still valid ("current"); that's the service's job.
   */
  findAllByClientId(clientId: string): Promise<Subscription[]>
  findById(id: string): Promise<Subscription | null>
  create(input: CreateSubscriptionInput): Promise<Subscription>
  setSuspended(id: string, suspended: boolean): Promise<Subscription>
}
```

- [ ] **Step 2: Write the failing tests**

Add to `server/memberships/infrastructure/prisma-subscription.repository.test.ts`, after the existing `describe('PrismaSubscriptionRepository.findAllByClientId', ...)` block (keep everything already in the file — only add the following two new `describe` blocks at the end):

```ts
describe('PrismaSubscriptionRepository.findById', () => {
  it('returns the subscription for a known id', async () => {
    const clientId = await createTestClient('+33600001009')
    const created = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })

    const result = await repository.findById(created.id)

    expect(result?.id).toBe(created.id)
  })

  it('returns null for an unknown id', async () => {
    const result = await repository.findById('does-not-exist')

    expect(result).toBeNull()
  })
})

describe('PrismaSubscriptionRepository.create', () => {
  it('creates a subscription with all provided fields, including createdByStaffId', async () => {
    const clientId = await createTestClient('+33600001010')
    const staffId = await createTestStaff('staff-create-sub@atlas.fit')

    const result = await repository.create({
      clientId,
      planId: 'QUARTERLY',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-04-01'),
      amountPaid: 105,
      paymentMethod: 'CARD',
      createdByStaffId: staffId,
    })

    expect(result.clientId).toBe(clientId)
    expect(result.planId).toBe('QUARTERLY')
    expect(result.amountPaid).toBe(105)
    expect(result.paymentMethod).toBe('CARD')
    expect(result.suspended).toBe(false)

    const row = await prismaClient.subscription.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.createdByStaffId).toBe(staffId)
  })
})

describe('PrismaSubscriptionRepository.setSuspended', () => {
  it('sets suspended to true', async () => {
    const clientId = await createTestClient('+33600001011')
    const created = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })

    const result = await repository.setSuspended(created.id, true)

    expect(result.suspended).toBe(true)
  })

  it('sets suspended back to false', async () => {
    const clientId = await createTestClient('+33600001012')
    const created = await prismaClient.subscription.create({
      data: {
        clientId,
        planId: 'MONTHLY',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        suspended: true,
        amountPaid: 40,
        paymentMethod: 'CASH',
      },
    })

    const result = await repository.setSuspended(created.id, false)

    expect(result.suspended).toBe(false)
  })
})
```

Create the shared fixture helper `server/memberships/infrastructure/test-helpers/create-test-staff.ts` (a sibling to the existing `create-test-client.ts`, following the same shared-helper convention rather than duplicating a local copy in each repository test file):

```ts
// server/memberships/infrastructure/test-helpers/create-test-staff.ts
import { prismaClient } from '../../../shared/prisma-client'

/** Creates a real StaffAccount row for a test fixture and returns its id. */
export async function createTestStaff(email: string): Promise<string> {
  const staff = await prismaClient.staffAccount.create({
    data: { email, passwordHash: 'unused-in-this-test', name: 'Test Staff', role: 'ADMIN' },
  })
  return staff.id
}
```

Add the import to `server/memberships/infrastructure/prisma-subscription.repository.test.ts`, alongside the existing `createTestClient` import:

```ts
import { createTestStaff } from './test-helpers/create-test-staff'
```

Also add `await prismaClient.staffAccount.deleteMany()` to this file's existing `beforeEach` block, so staff fixtures from one test don't collide with the next:

```ts
beforeEach(async () => {
  await cleanMembershipsTables()
  await cleanClientsTable()
  await prismaClient.staffAccount.deleteMany()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/memberships/infrastructure/prisma-subscription.repository.test.ts`
Expected: FAIL — `repository.findById is not a function` (and similarly for `create`/`setSuspended`).

- [ ] **Step 4: Implement the three methods**

Replace the full content of `server/memberships/infrastructure/prisma-subscription.repository.ts`:

```ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import { PAYMENT_METHODS, PLAN_IDS, type Subscription } from '../domain/entities'
import type { CreateSubscriptionInput, SubscriptionRepository } from '../repositories/subscription.repository'
import { validateEnum } from './validate-enum'

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
    planId: validateEnum(row.planId, PLAN_IDS, 'Subscription.planId'),
    startDate: row.startDate,
    endDate: row.endDate,
    suspended: row.suspended,
    amountPaid: row.amountPaid,
    paymentMethod: validateEnum(row.paymentMethod, PAYMENT_METHODS, 'Subscription.paymentMethod'),
    createdAt: row.createdAt,
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findAllByClientId(clientId: string): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { clientId },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
    })
    return rows.map(toDomain)
  }

  async findById(id: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const row = await this.prisma.subscription.create({
      data: {
        clientId: input.clientId,
        planId: input.planId,
        startDate: input.startDate,
        endDate: input.endDate,
        amountPaid: input.amountPaid,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      },
    })
    return toDomain(row)
  }

  async setSuspended(id: string, suspended: boolean): Promise<Subscription> {
    const row = await this.prisma.subscription.update({ where: { id }, data: { suspended } })
    return toDomain(row)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/memberships/infrastructure/prisma-subscription.repository.test.ts`
Expected: all tests pass (5 original + 6 new = 11 total).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/memberships/repositories/subscription.repository.ts server/memberships/infrastructure/prisma-subscription.repository.ts server/memberships/infrastructure/prisma-subscription.repository.test.ts
git commit -m "feat: add findById/create/setSuspended to SubscriptionRepository"
```

---

## Task 5: `SessionRepository` — add `create`

**Files:**
- Modify: `server/memberships/repositories/session.repository.ts`
- Modify: `server/memberships/infrastructure/prisma-session.repository.ts`
- Modify: `server/memberships/infrastructure/prisma-session.repository.test.ts`

**Interfaces:**
- Consumes: `Session`, `PaymentMethod` from `../domain/entities`.
- Produces:
  ```ts
  create(input: CreateSessionInput): Promise<Session>

  type CreateSessionInput =
    | { type: 'SUBSCRIBER'; clientId: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
    | { type: 'VISITOR'; visitorName: string; visitorPhone: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
  ```

- [ ] **Step 1: Update the interface**

Replace the full content of `server/memberships/repositories/session.repository.ts`:

```ts
import type { PaymentMethod, Session } from '../domain/entities'

export type CreateSessionInput =
  | { type: 'SUBSCRIBER'; clientId: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
  | { type: 'VISITOR'; visitorName: string; visitorPhone: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }

export interface SessionRepository {
  /** The N most recent sessions for a client, ordered by checkedInAt descending. */
  findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
  create(input: CreateSessionInput): Promise<Session>
}
```

`CreateSessionInput` is a discriminated union (unlike the flat, nullable-field `Session` read type) — it's structurally impossible to construct a `SUBSCRIBER` input with `visitorName` set, or a `VISITOR` input with `clientId` set. This mirrors the database's `sessions_type_consistency_check` CHECK constraint at the type level, one layer before the DB gets a chance to reject it.

- [ ] **Step 2: Write the failing tests**

Add to `server/memberships/infrastructure/prisma-session.repository.test.ts`, at the end of the file (after the existing `sessions_type_consistency_check constraint` describe block — keep everything already in the file):

```ts
describe('PrismaSessionRepository.create', () => {
  it('creates a SUBSCRIBER session with createdByStaffId set', async () => {
    const clientId = await createTestClient('+33600002008')
    const staffId = await createTestStaff('staff-create-sess@atlas.fit')

    const result = await repository.create({
      type: 'SUBSCRIBER',
      clientId,
      amountPaid: 8,
      paymentMethod: 'CASH',
      createdByStaffId: staffId,
    })

    expect(result.type).toBe('SUBSCRIBER')
    expect(result.clientId).toBe(clientId)
    expect(result.visitorName).toBeNull()
    expect(result.visitorPhone).toBeNull()

    const row = await prismaClient.session.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.createdByStaffId).toBe(staffId)
  })

  it('creates a VISITOR session with visitor fields set and clientId null', async () => {
    const staffId = await createTestStaff('staff-create-visitor@atlas.fit')

    const result = await repository.create({
      type: 'VISITOR',
      visitorName: 'Nadia Ferrand',
      visitorPhone: '+33698765432',
      amountPaid: 8,
      paymentMethod: 'CASH',
      createdByStaffId: staffId,
    })

    expect(result.type).toBe('VISITOR')
    expect(result.clientId).toBeNull()
    expect(result.visitorName).toBe('Nadia Ferrand')
    expect(result.visitorPhone).toBe('+33698765432')
  })
})
```

Add the import to `server/memberships/infrastructure/prisma-session.repository.test.ts`, alongside the existing `createTestClient` import — reusing the same shared `create-test-staff.ts` helper Task 4 created (do not redefine it locally):

```ts
import { createTestStaff } from './test-helpers/create-test-staff'
```

Add `await prismaClient.staffAccount.deleteMany()` to this file's `beforeEach` too:

```ts
beforeEach(async () => {
  await cleanMembershipsTables()
  await cleanClientsTable()
  await prismaClient.staffAccount.deleteMany()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/memberships/infrastructure/prisma-session.repository.test.ts`
Expected: FAIL — `repository.create is not a function`

- [ ] **Step 4: Implement `create`**

In `server/memberships/infrastructure/prisma-session.repository.ts`, update the imports and add the method:

```ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import { PAYMENT_METHODS, SESSION_TYPES, type Session } from '../domain/entities'
import type { CreateSessionInput, SessionRepository } from '../repositories/session.repository'
import { validateEnum } from './validate-enum'

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
    type: validateEnum(row.type, SESSION_TYPES, 'Session.type'),
    clientId: row.clientId,
    visitorName: row.visitorName,
    visitorPhone: row.visitorPhone,
    amountPaid: row.amountPaid,
    paymentMethod: validateEnum(row.paymentMethod, PAYMENT_METHODS, 'Session.paymentMethod'),
    checkedInAt: row.checkedInAt,
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async findRecentByClientId(clientId: string, limit: number): Promise<Session[]> {
    const rows = await this.prisma.session.findMany({
      where: { clientId },
      orderBy: [{ checkedInAt: 'desc' }, { id: 'asc' }],
      take: limit,
    })
    return rows.map(toDomain)
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const row =
      input.type === 'SUBSCRIBER'
        ? await this.prisma.session.create({
            data: {
              type: 'SUBSCRIBER',
              clientId: input.clientId,
              amountPaid: input.amountPaid,
              paymentMethod: input.paymentMethod,
              createdByStaffId: input.createdByStaffId,
            },
          })
        : await this.prisma.session.create({
            data: {
              type: 'VISITOR',
              visitorName: input.visitorName,
              visitorPhone: input.visitorPhone,
              amountPaid: input.amountPaid,
              paymentMethod: input.paymentMethod,
              createdByStaffId: input.createdByStaffId,
            },
          })
    return toDomain(row)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/memberships/infrastructure/prisma-session.repository.test.ts`
Expected: all tests pass (9 original + 2 new = 11 total).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/memberships/repositories/session.repository.ts server/memberships/infrastructure/prisma-session.repository.ts server/memberships/infrastructure/prisma-session.repository.test.ts
git commit -m "feat: add create to SessionRepository with a discriminated CreateSessionInput"
```

- [ ] **Step 8: Flag for code review**

This completes the repository layer (Tasks 3-5). Run the code-review skill on the diff so far before proceeding.

---

## Task 6: `server/settings/` module — domain, repository, service

**Files:**
- Create: `server/settings/domain/entities.ts`
- Create: `server/settings/repositories/settings.repository.ts`
- Create: `server/settings/infrastructure/prisma-settings.repository.ts`
- Create: `server/settings/infrastructure/prisma-settings.repository.test.ts`
- Create: `server/settings/services/settings.service.ts`
- Create: `server/settings/services/default-settings.service.ts`
- Create: `server/settings/services/default-settings.service.test.ts`

**Interfaces:**
- Consumes: `prismaClient` from `server/shared/prisma-client.ts`, `guardAgainstLeakingInternals` from `server/shared/guard-against-leaking-internals.ts`.
- Produces:
  ```ts
  // domain/entities.ts
  export type AppSettings = { id: string; sessionPrice: number; updatedAt: Date }
  ```
  ```ts
  // repositories/settings.repository.ts
  export interface SettingsRepository {
    get(): Promise<AppSettings>
    update(input: { sessionPrice: number }): Promise<AppSettings>
  }
  ```
  ```ts
  // services/settings.service.ts
  export interface SettingsService {
    getSettings(): Promise<AppSettings>
    updateSettings(input: { sessionPrice: number }): Promise<AppSettings>
  }
  ```

- [ ] **Step 1: Write the domain entity**

```ts
// server/settings/domain/entities.ts
export type AppSettings = {
  id: string
  sessionPrice: number
  updatedAt: Date
}
```

- [ ] **Step 2: Write the repository interface**

```ts
// server/settings/repositories/settings.repository.ts
import type { AppSettings } from '../domain/entities'

export interface SettingsRepository {
  /** Always succeeds — creates the singleton row with default values if it doesn't exist yet. */
  get(): Promise<AppSettings>
  update(input: { sessionPrice: number }): Promise<AppSettings>
}
```

- [ ] **Step 3: Write the failing repository tests**

```ts
// server/settings/infrastructure/prisma-settings.repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { PrismaSettingsRepository } from './prisma-settings.repository'

const repository = new PrismaSettingsRepository(prismaClient)

beforeEach(async () => {
  await prismaClient.appSettings.deleteMany()
})

describe('PrismaSettingsRepository.get', () => {
  it('creates the singleton row with a default sessionPrice when none exists', async () => {
    const settings = await repository.get()

    expect(settings.id).toBe('singleton')
    expect(settings.sessionPrice).toBe(8)
  })

  it('returns the existing row without creating a duplicate', async () => {
    await prismaClient.appSettings.create({ data: { id: 'singleton', sessionPrice: 12 } })

    const settings = await repository.get()

    expect(settings.sessionPrice).toBe(12)
    const count = await prismaClient.appSettings.count()
    expect(count).toBe(1)
  })
})

describe('PrismaSettingsRepository.update', () => {
  it('updates sessionPrice on the singleton row', async () => {
    await repository.get()

    const updated = await repository.update({ sessionPrice: 15 })

    expect(updated.sessionPrice).toBe(15)
  })

  it('creates the row if update is called before any get', async () => {
    const updated = await repository.update({ sessionPrice: 20 })

    expect(updated.sessionPrice).toBe(20)
    const count = await prismaClient.appSettings.count()
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run server/settings/infrastructure/prisma-settings.repository.test.ts`
Expected: FAIL — `Cannot find module './prisma-settings.repository'`

- [ ] **Step 5: Write the Prisma implementation**

```ts
// server/settings/infrastructure/prisma-settings.repository.ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'

const SINGLETON_ID = 'singleton'
const DEFAULT_SESSION_PRICE = 8

type PrismaAppSettingsRow = {
  id: string
  sessionPrice: number
  updatedAt: Date
}

function toDomain(row: PrismaAppSettingsRow): AppSettings {
  return { id: row.id, sessionPrice: row.sessionPrice, updatedAt: row.updatedAt }
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async get(): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID, sessionPrice: DEFAULT_SESSION_PRICE },
    })
    return toDomain(row)
  }

  async update(input: { sessionPrice: number }): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SINGLETON_ID },
      update: { sessionPrice: input.sessionPrice },
      create: { id: SINGLETON_ID, sessionPrice: input.sessionPrice },
    })
    return toDomain(row)
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run server/settings/infrastructure/prisma-settings.repository.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 7: Write the service interface**

```ts
// server/settings/services/settings.service.ts
import type { AppSettings } from '../domain/entities'

export interface SettingsService {
  getSettings(): Promise<AppSettings>
  updateSettings(input: { sessionPrice: number }): Promise<AppSettings>
}
```

- [ ] **Step 8: Write the failing service tests**

```ts
// server/settings/services/default-settings.service.test.ts
import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'
import { DefaultSettingsService } from './default-settings.service'

const SETTINGS: AppSettings = { id: 'singleton', sessionPrice: 8, updatedAt: new Date('2026-07-01') }

function fakeSettingsRepository(overrides: Partial<SettingsRepository> = {}): SettingsRepository {
  return {
    get: async () => SETTINGS,
    update: async (input) => ({ ...SETTINGS, sessionPrice: input.sessionPrice }),
    ...overrides,
  }
}

describe('DefaultSettingsService.getSettings', () => {
  it('delegates to the repository', async () => {
    const service = new DefaultSettingsService(fakeSettingsRepository())

    const result = await service.getSettings()

    expect(result.sessionPrice).toBe(8)
  })

  it('never lets a raw repository error message escape getSettings', async () => {
    const service = new DefaultSettingsService(
      fakeSettingsRepository({
        get: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
    )

    await expect(service.getSettings()).rejects.toThrow('internal-error')
  })
})

describe('DefaultSettingsService.updateSettings', () => {
  it('delegates to the repository and returns the updated value', async () => {
    const service = new DefaultSettingsService(fakeSettingsRepository())

    const result = await service.updateSettings({ sessionPrice: 15 })

    expect(result.sessionPrice).toBe(15)
  })
})
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `npx vitest run server/settings/services/default-settings.service.test.ts`
Expected: FAIL — `Cannot find module './default-settings.service'`

- [ ] **Step 10: Write the implementation**

```ts
// server/settings/services/default-settings.service.ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import type { AppSettings } from '../domain/entities'
import type { SettingsRepository } from '../repositories/settings.repository'
import type { SettingsService } from './settings.service'

const SOURCE = 'SettingsService'

export class DefaultSettingsService implements SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getSettings(): Promise<AppSettings> {
    return guardAgainstLeakingInternals(SOURCE, () => this.settingsRepository.get())
  }

  async updateSettings(input: { sessionPrice: number }): Promise<AppSettings> {
    return guardAgainstLeakingInternals(SOURCE, () => this.settingsRepository.update(input))
  }
}
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run server/settings/services/default-settings.service.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 12: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 13: Commit**

```bash
git add server/settings
git commit -m "feat: add Settings module (domain, repository, service)"
```

---

## Task 7: `StaffSubscriptionService`

**Files:**
- Create: `server/memberships/services/staff-subscription.service.ts`
- Create: `server/memberships/services/default-staff-subscription.service.ts`
- Create: `server/memberships/services/default-staff-subscription.service.test.ts`

**Interfaces:**
- Consumes:
  - `SubscriptionRepository.findAllByClientId/findById/create/setSuspended` (Task 4).
  - `PLAN_CATALOG` from `../domain/plan-catalog` (Task 3).
  - `MembershipDomainError` from `../domain/errors` (Task 3).
  - `ClientService.getClient(id): Promise<Result<Client, ClientDomainError>>` from `../../clients/services/client.service` — reused as-is to check "does this client exist and is it active" (its default `activeOnly: true` behavior is exactly what's needed; no options argument passed).
- Produces:
  ```ts
  export interface StaffSubscriptionService {
    createOrRenewSubscription(input: {
      clientId: string
      planId: PlanId
      paymentMethod: PaymentMethod
      createdByStaffId: string
    }): Promise<Result<Subscription, MembershipDomainError>>
    suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
    reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
  }
  ```

- [ ] **Step 1: Write the interface**

```ts
// server/memberships/services/staff-subscription.service.ts
import type { Result } from '../../shared/result'
import type { PaymentMethod, PlanId, Subscription } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'

export type CreateOrRenewSubscriptionInput = {
  clientId: string
  planId: PlanId
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface StaffSubscriptionService {
  createOrRenewSubscription(input: CreateOrRenewSubscriptionInput): Promise<Result<Subscription, MembershipDomainError>>
  suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
  reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// server/memberships/services/default-staff-subscription.service.test.ts
import { describe, expect, it } from 'vitest'
import type { Client } from '../../clients/domain/entities'
import type { ClientService, ListClientsResult } from '../../clients/services/client.service'
import type { Result } from '../../shared/result'
import { ok, err } from '../../shared/result'
import type { ClientDomainError } from '../../clients/domain/errors'
import type { Subscription } from '../domain/entities'
import type { CreateSubscriptionInput, SubscriptionRepository } from '../repositories/subscription.repository'
import { DefaultStaffSubscriptionService } from './default-staff-subscription.service'

const NOW = new Date('2026-07-21T12:00:00.000Z')

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01'),
}

const EXISTING_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'MONTHLY',
  startDate: new Date('2026-06-21'),
  endDate: new Date('2026-07-21'),
  suspended: false,
  amountPaid: 40,
  paymentMethod: 'CASH',
  createdAt: new Date('2026-06-21'),
}

function fakeClientService(overrides: Partial<ClientService> = {}): ClientService {
  return {
    createClient: async () => err({ code: 'not-found', message: 'unused' }) as Result<Client, ClientDomainError>,
    getClient: async () => ok(CLIENT),
    listClients: async (): Promise<ListClientsResult> => ({ clients: [] }),
    findByPhone: async () => null,
    findByCardNumber: async () => null,
    findByClientAccountId: async () => null,
    updateClient: async () => ok(CLIENT),
    deactivateClient: async () => ok(undefined),
    ...overrides,
  }
}

function fakeSubscriptionRepository(overrides: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    findAllByClientId: async () => [],
    findById: async () => null,
    create: async (input: CreateSubscriptionInput) => ({
      id: 'new-sub',
      clientId: input.clientId,
      planId: input.planId,
      startDate: input.startDate,
      endDate: input.endDate,
      suspended: false,
      amountPaid: input.amountPaid,
      paymentMethod: input.paymentMethod,
      createdAt: NOW,
    }),
    setSuspended: async (id, suspended) => ({ ...EXISTING_SUBSCRIPTION, id, suspended }),
    ...overrides,
  }
}

describe('DefaultStaffSubscriptionService.createOrRenewSubscription', () => {
  it('rejects when the client does not exist or is inactive', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository(),
      fakeClientService({ getClient: async () => err({ code: 'not-found', message: 'Client introuvable.' }) }),
    )

    const result = await service.createOrRenewSubscription({
      clientId: 'missing',
      planId: 'MONTHLY',
      paymentMethod: 'CASH',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('client-not-found')
  })

  it('starts from now and computes amountPaid/endDate from the plan catalog when the client has no subscriptions', async () => {
    const calls: CreateSubscriptionInput[] = []
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    const result = await service.createOrRenewSubscription({
      clientId: 'c1',
      planId: 'QUARTERLY',
      paymentMethod: 'CARD',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].amountPaid).toBe(105)
    expect(calls[0].createdByStaffId).toBe('staff1')
    const durationMs = calls[0].endDate.getTime() - calls[0].startDate.getTime()
    expect(durationMs).toBe(90 * 24 * 60 * 60 * 1000)
  })

  it('chains startDate from the latest subscription endDate when it has not expired yet', async () => {
    const calls: CreateSubscriptionInput[] = []
    const futureEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [{ ...EXISTING_SUBSCRIPTION, endDate: futureEndDate }],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    await service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(calls[0].startDate.getTime()).toBe(futureEndDate.getTime())
  })

  it('starts from now when the latest subscription has already expired', async () => {
    const calls: CreateSubscriptionInput[] = []
    const pastEndDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => [{ ...EXISTING_SUBSCRIPTION, endDate: pastEndDate }],
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sub', clientId: input.clientId, planId: input.planId, startDate: input.startDate, endDate: input.endDate, suspended: false, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, createdAt: new Date() }
        },
      }),
      fakeClientService(),
    )

    const before = Date.now()
    await service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' })
    const after = Date.now()

    expect(calls[0].startDate.getTime()).toBeGreaterThanOrEqual(before)
    expect(calls[0].startDate.getTime()).toBeLessThanOrEqual(after)
  })

  it('never lets a raw repository error message escape createOrRenewSubscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeClientService(),
    )

    await expect(
      service.createOrRenewSubscription({ clientId: 'c1', planId: 'MONTHLY', paymentMethod: 'CASH', createdByStaffId: 'staff1' }),
    ).rejects.toThrow('internal-error')
  })
})

describe('DefaultStaffSubscriptionService.suspendSubscription', () => {
  it('suspends an existing subscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({ findById: async (id) => (id === 'sub1' ? EXISTING_SUBSCRIPTION : null) }),
      fakeClientService(),
    )

    const result = await service.suspendSubscription('sub1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suspended).toBe(true)
  })

  it('returns subscription-not-found for an unknown id', async () => {
    const service = new DefaultStaffSubscriptionService(fakeSubscriptionRepository(), fakeClientService())

    const result = await service.suspendSubscription('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subscription-not-found')
  })
})

describe('DefaultStaffSubscriptionService.reactivateSubscription', () => {
  it('reactivates an existing subscription', async () => {
    const service = new DefaultStaffSubscriptionService(
      fakeSubscriptionRepository({ findById: async (id) => (id === 'sub1' ? { ...EXISTING_SUBSCRIPTION, suspended: true } : null) }),
      fakeClientService(),
    )

    const result = await service.reactivateSubscription('sub1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.suspended).toBe(false)
  })

  it('returns subscription-not-found for an unknown id', async () => {
    const service = new DefaultStaffSubscriptionService(fakeSubscriptionRepository(), fakeClientService())

    const result = await service.reactivateSubscription('missing')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('subscription-not-found')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/memberships/services/default-staff-subscription.service.test.ts`
Expected: FAIL — `Cannot find module './default-staff-subscription.service'`

- [ ] **Step 4: Write the implementation**

```ts
// server/memberships/services/default-staff-subscription.service.ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { err, ok, type Result } from '../../shared/result'
import type { ClientService } from '../../clients/services/client.service'
import type { Subscription } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'
import { PLAN_CATALOG } from '../domain/plan-catalog'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { CreateOrRenewSubscriptionInput, StaffSubscriptionService } from './staff-subscription.service'

const SOURCE = 'StaffSubscriptionService'
const CLIENT_NOT_FOUND: MembershipDomainError = { code: 'client-not-found', message: 'Client introuvable.' }
const SUBSCRIPTION_NOT_FOUND: MembershipDomainError = { code: 'subscription-not-found', message: 'Abonnement introuvable.' }

export class DefaultStaffSubscriptionService implements StaffSubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly clientService: ClientService,
  ) {}

  async createOrRenewSubscription(
    input: CreateOrRenewSubscriptionInput,
  ): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const clientResult = await this.clientService.getClient(input.clientId)
      if (!clientResult.ok) return err(CLIENT_NOT_FOUND)

      const subscriptions = await this.subscriptionRepository.findAllByClientId(input.clientId)
      const latest = subscriptions[0] ?? null

      const now = new Date()
      const startDate = latest && latest.endDate > now ? latest.endDate : now
      const plan = PLAN_CATALOG[input.planId]
      const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)

      const subscription = await this.subscriptionRepository.create({
        clientId: input.clientId,
        planId: input.planId,
        startDate,
        endDate,
        amountPaid: plan.price,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(subscription)
    })
  }

  async suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.subscriptionRepository.findById(id)
      if (!existing) return err(SUBSCRIPTION_NOT_FOUND)
      return ok(await this.subscriptionRepository.setSuspended(id, true))
    })
  }

  async reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.subscriptionRepository.findById(id)
      if (!existing) return err(SUBSCRIPTION_NOT_FOUND)
      return ok(await this.subscriptionRepository.setSuspended(id, false))
    })
  }
}
```

**Note on the "client active" check:** `ClientService.getClient(id)` (no options argument, so `activeOnly: true` by default — see `server/clients/services/client.service.ts`) already returns `not-found` for both a nonexistent AND a deactivated client. This single call covers both `client-not-found` and the design's `client-inactive` case with one error code (`client-not-found`) rather than two — simpler than distinguishing them, and the frontend only needs to know "you can't do this," not the exact reason. `client-inactive` stays defined in `MembershipDomainError` for symmetry with the design doc but is not actually produced by this path; do not treat this as a gap — it is a deliberate simplification, `getClient`'s Result already collapses both cases and re-splitting them would require a second repository call for no behavioral benefit.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/memberships/services/default-staff-subscription.service.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/memberships/services/staff-subscription.service.ts server/memberships/services/default-staff-subscription.service.ts server/memberships/services/default-staff-subscription.service.test.ts
git commit -m "feat: add StaffSubscriptionService (create/renew/suspend/reactivate)"
```

---

## Task 8: `StaffSessionService`

**Files:**
- Create: `server/memberships/services/staff-session.service.ts`
- Create: `server/memberships/services/default-staff-session.service.ts`
- Create: `server/memberships/services/default-staff-session.service.test.ts`

**Interfaces:**
- Consumes: `SubscriptionRepository.findAllByClientId` (Task 4), `SessionRepository.create` (Task 5), `checkSessionEligibility` (Task 3), `ClientService.getClient` (existing), `SettingsService.getSettings` (Task 6).
- Produces:
  ```ts
  export interface StaffSessionService {
    recordSubscriberSession(input: {
      clientId: string
      paymentMethod: PaymentMethod
      createdByStaffId: string
    }): Promise<Result<Session, MembershipDomainError>>
    recordVisitorSession(input: {
      visitorName: string
      visitorPhone: string
      paymentMethod: PaymentMethod
      createdByStaffId: string
    }): Promise<Result<Session, MembershipDomainError>>
  }
  ```

- [ ] **Step 1: Write the interface**

```ts
// server/memberships/services/staff-session.service.ts
import type { Result } from '../../shared/result'
import type { PaymentMethod, Session } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'

export type RecordSubscriberSessionInput = {
  clientId: string
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export type RecordVisitorSessionInput = {
  visitorName: string
  visitorPhone: string
  paymentMethod: PaymentMethod
  createdByStaffId: string
}

export interface StaffSessionService {
  recordSubscriberSession(input: RecordSubscriberSessionInput): Promise<Result<Session, MembershipDomainError>>
  recordVisitorSession(input: RecordVisitorSessionInput): Promise<Result<Session, MembershipDomainError>>
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// server/memberships/services/default-staff-session.service.test.ts
import { describe, expect, it } from 'vitest'
import type { Client } from '../../clients/domain/entities'
import type { ClientService, ListClientsResult } from '../../clients/services/client.service'
import type { ClientDomainError } from '../../clients/domain/errors'
import { err, ok, type Result } from '../../shared/result'
import type { AppSettings } from '../../settings/domain/entities'
import type { SettingsService } from '../../settings/services/settings.service'
import type { Session, Subscription } from '../domain/entities'
import type { CreateSessionInput, SessionRepository } from '../repositories/session.repository'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import { DefaultStaffSessionService } from './default-staff-session.service'

const CLIENT: Client = {
  id: 'c1',
  cardNumber: 'CARD-00001',
  name: 'Yasmine Kaddour',
  phone: '+33612345601',
  email: null,
  isActive: true,
  joinedAt: new Date('2026-01-01'),
}

const VALID_SUBSCRIPTION: Subscription = {
  id: 'sub1',
  clientId: 'c1',
  planId: 'QUARTERLY',
  startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'CARD',
  createdAt: new Date(),
}

const SETTINGS: AppSettings = { id: 'singleton', sessionPrice: 8, updatedAt: new Date() }

function fakeClientService(overrides: Partial<ClientService> = {}): ClientService {
  return {
    createClient: async () => err({ code: 'not-found', message: 'unused' }) as Result<Client, ClientDomainError>,
    getClient: async () => ok(CLIENT),
    listClients: async (): Promise<ListClientsResult> => ({ clients: [] }),
    findByPhone: async () => null,
    findByCardNumber: async () => null,
    findByClientAccountId: async () => null,
    updateClient: async () => ok(CLIENT),
    deactivateClient: async () => ok(undefined),
    ...overrides,
  }
}

function fakeSubscriptionRepository(overrides: Partial<SubscriptionRepository> = {}): SubscriptionRepository {
  return {
    findAllByClientId: async () => [VALID_SUBSCRIPTION],
    findById: async () => null,
    create: async () => VALID_SUBSCRIPTION,
    setSuspended: async () => VALID_SUBSCRIPTION,
    ...overrides,
  }
}

function fakeSessionRepository(overrides: Partial<SessionRepository> = {}): SessionRepository {
  return {
    findRecentByClientId: async () => [],
    create: async (input: CreateSessionInput): Promise<Session> =>
      input.type === 'SUBSCRIBER'
        ? { id: 'new-sess', type: 'SUBSCRIBER', clientId: input.clientId, visitorName: null, visitorPhone: null, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        : { id: 'new-sess', type: 'VISITOR', clientId: null, visitorName: input.visitorName, visitorPhone: input.visitorPhone, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() },
    ...overrides,
  }
}

function fakeSettingsService(overrides: Partial<SettingsService> = {}): SettingsService {
  return {
    getSettings: async () => SETTINGS,
    updateSettings: async () => SETTINGS,
    ...overrides,
  }
}

describe('DefaultStaffSessionService.recordSubscriberSession', () => {
  it('records a session with amountPaid from settings when the client is eligible', async () => {
    const calls: CreateSessionInput[] = []
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sess', type: 'SUBSCRIBER', clientId: 'c1', visitorName: null, visitorPhone: null, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        },
      }),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(true)
    expect(calls[0]).toMatchObject({ type: 'SUBSCRIBER', clientId: 'c1', amountPaid: 8, createdByStaffId: 'staff1' })
  })

  it('rejects when the client does not exist or is inactive', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository(),
      fakeClientService({ getClient: async () => err({ code: 'not-found', message: 'Client introuvable.' }) }),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'missing', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('client-not-found')
  })

  it('rejects with session-ineligible and reason "expired" when the subscription has ended', async () => {
    const expired: Subscription = { ...VALID_SUBSCRIPTION, endDate: new Date(Date.now() - 1000) }
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [expired] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('expired')
    }
  })

  it('rejects with session-ineligible and reason "suspended" when the subscription is suspended', async () => {
    const suspended: Subscription = { ...VALID_SUBSCRIPTION, suspended: true }
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [suspended] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('suspended')
    }
  })

  it('rejects with session-ineligible and reason "none" when the client has no subscriptions', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({ findAllByClientId: async () => [] }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('session-ineligible')
      expect(result.error.reason).toBe('none')
    }
  })

  it('never lets a raw repository error message escape recordSubscriberSession', async () => {
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository({
        findAllByClientId: async () => {
          throw new Error('connection terminated unexpectedly')
        },
      }),
      fakeSessionRepository(),
      fakeClientService(),
      fakeSettingsService(),
    )

    await expect(
      service.recordSubscriberSession({ clientId: 'c1', paymentMethod: 'CASH', createdByStaffId: 'staff1' }),
    ).rejects.toThrow('internal-error')
  })
})

describe('DefaultStaffSessionService.recordVisitorSession', () => {
  it('records a visitor session with amountPaid from settings, no eligibility check', async () => {
    const calls: CreateSessionInput[] = []
    const service = new DefaultStaffSessionService(
      fakeSubscriptionRepository(),
      fakeSessionRepository({
        create: async (input) => {
          calls.push(input)
          return { id: 'new-sess', type: 'VISITOR', clientId: null, visitorName: 'Nadia Ferrand', visitorPhone: '+33698765432', amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, checkedInAt: new Date() }
        },
      }),
      fakeClientService(),
      fakeSettingsService(),
    )

    const result = await service.recordVisitorSession({
      visitorName: 'Nadia Ferrand',
      visitorPhone: '+33698765432',
      paymentMethod: 'CASH',
      createdByStaffId: 'staff1',
    })

    expect(result.ok).toBe(true)
    expect(calls[0]).toMatchObject({ type: 'VISITOR', visitorName: 'Nadia Ferrand', amountPaid: 8 })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run server/memberships/services/default-staff-session.service.test.ts`
Expected: FAIL — `Cannot find module './default-staff-session.service'`

- [ ] **Step 4: Write the implementation**

```ts
// server/memberships/services/default-staff-session.service.ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { err, ok, type Result } from '../../shared/result'
import type { ClientService } from '../../clients/services/client.service'
import type { SettingsService } from '../../settings/services/settings.service'
import { checkSessionEligibility } from '../domain/check-session-eligibility'
import type { Session } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'
import type { SessionRepository } from '../repositories/session.repository'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { RecordSubscriberSessionInput, RecordVisitorSessionInput, StaffSessionService } from './staff-session.service'

const SOURCE = 'StaffSessionService'
const CLIENT_NOT_FOUND: MembershipDomainError = { code: 'client-not-found', message: 'Client introuvable.' }

const INELIGIBLE_MESSAGES: Record<'none' | 'expired' | 'suspended', string> = {
  none: "Ce client n'a pas d'abonnement valide.",
  expired: 'L\'abonnement de ce client est expiré.',
  suspended: 'L\'abonnement de ce client est suspendu.',
}

export class DefaultStaffSessionService implements StaffSessionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly clientService: ClientService,
    private readonly settingsService: SettingsService,
  ) {}

  async recordSubscriberSession(input: RecordSubscriberSessionInput): Promise<Result<Session, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const clientResult = await this.clientService.getClient(input.clientId)
      if (!clientResult.ok) return err(CLIENT_NOT_FOUND)

      const subscriptions = await this.subscriptionRepository.findAllByClientId(input.clientId)
      const latest = subscriptions[0] ?? null
      const eligibility = checkSessionEligibility(latest, new Date())
      if (!eligibility.allowed) {
        return err({ code: 'session-ineligible', message: INELIGIBLE_MESSAGES[eligibility.reason], reason: eligibility.reason })
      }

      const settings = await this.settingsService.getSettings()
      const session = await this.sessionRepository.create({
        type: 'SUBSCRIBER',
        clientId: input.clientId,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(session)
    })
  }

  async recordVisitorSession(input: RecordVisitorSessionInput): Promise<Result<Session, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const settings = await this.settingsService.getSettings()
      const session = await this.sessionRepository.create({
        type: 'VISITOR',
        visitorName: input.visitorName,
        visitorPhone: input.visitorPhone,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(session)
    })
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/memberships/services/default-staff-session.service.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/memberships/services/staff-session.service.ts server/memberships/services/default-staff-session.service.ts server/memberships/services/default-staff-session.service.test.ts
git commit -m "feat: add StaffSessionService (record subscriber/visitor session)"
```

- [ ] **Step 8: Flag for code review**

This completes both staff services (Tasks 6-8). Run the code-review skill on the diff so far before proceeding.

---

## Task 9: Wire the container

**Files:**
- Modify: `server/shared/container.ts`

**Interfaces:**
- Produces: `Container.staffSubscriptionService: StaffSubscriptionService`, `Container.staffSessionService: StaffSessionService`, `Container.settingsService: SettingsService`, all accessible via `getContainer()`.

- [ ] **Step 1: Add imports**

Add to `server/shared/container.ts`, alongside the existing memberships imports:

```ts
import { PrismaSettingsRepository } from '../settings/infrastructure/prisma-settings.repository'
import { DefaultSettingsService } from '../settings/services/default-settings.service'
import type { SettingsService } from '../settings/services/settings.service'
import { DefaultStaffSubscriptionService } from '../memberships/services/default-staff-subscription.service'
import type { StaffSubscriptionService } from '../memberships/services/staff-subscription.service'
import { DefaultStaffSessionService } from '../memberships/services/default-staff-session.service'
import type { StaffSessionService } from '../memberships/services/staff-session.service'
```

- [ ] **Step 2: Extend the `Container` type**

```ts
export type Container = {
  staffAuthService: StaffAuthService
  clientAuthService: ClientAuthService
  refreshTokenLookupService: RefreshTokenLookupService
  clientService: ClientService
  clientHistoryService: ClientHistoryService
  staffSubscriptionService: StaffSubscriptionService
  staffSessionService: StaffSessionService
  settingsService: SettingsService
}
```

- [ ] **Step 3: Wire the instances**

Inside `createContainer()`, after the existing `clientHistoryService` line:

```ts
  const settingsRepository = new PrismaSettingsRepository(prismaClient)
  const settingsService = new DefaultSettingsService(settingsRepository)

  const staffSubscriptionService = new DefaultStaffSubscriptionService(subscriptionRepository, clientService)
  const staffSessionService = new DefaultStaffSessionService(subscriptionRepository, sessionRepository, clientService, settingsService)
```

Update the `return` statement:

```ts
  return {
    staffAuthService,
    clientAuthService,
    refreshTokenLookupService,
    clientService,
    clientHistoryService,
    staffSubscriptionService,
    staffSessionService,
    settingsService,
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (no regressions in any existing module).

- [ ] **Step 6: Commit**

```bash
git add server/shared/container.ts
git commit -m "feat: wire StaffSubscriptionService, StaffSessionService, SettingsService into the container"
```

---

## Task 10: Settings controllers — `GET /api/settings`, `PATCH /api/settings`

**Files:**
- Modify: `server/shared/authorization/permissions.ts`
- Modify: `server/shared/authorization/permissions.test.ts`
- Create: `server/settings/dto/settings.dto.ts`
- Create: `server/settings/http/get-settings.controller.ts`
- Create: `server/settings/http/get-settings.controller.test.ts`
- Create: `server/settings/http/update-settings.controller.ts`
- Create: `server/settings/http/update-settings.controller.test.ts`
- Create: `app/api/settings/route.ts`

**Interfaces:**
- Consumes: `getContainer().settingsService` (Task 9), `requireStaffAuth` (existing), `hasPermission` (extended below).
- Produces: `getSettingsController(req)`, `updateSettingsController(req)`.

- [ ] **Step 1: Add the `settings:update` permission**

Replace the full content of `server/shared/authorization/permissions.ts`:

```ts
import type { Role } from '../../auth/domain/enums'

export type Permission = 'client:list' | 'client:read' | 'client:create' | 'client:update' | 'client:deactivate' | 'settings:update'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate', 'settings:update'],
  AGENT: ['client:list', 'client:read', 'client:create', 'client:update'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
```

- [ ] **Step 2: Add a test for the new permission**

Add to `server/shared/authorization/permissions.test.ts`, inside the existing `describe('hasPermission', ...)` block:

```ts
  it('grants ADMIN settings:update, denies it to AGENT', () => {
    expect(hasPermission('ADMIN', 'settings:update')).toBe(true)
    expect(hasPermission('AGENT', 'settings:update')).toBe(false)
  })
```

- [ ] **Step 3: Run the permissions tests**

Run: `npx vitest run server/shared/authorization/permissions.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 4: Write the DTO**

```ts
// server/settings/dto/settings.dto.ts
import { z } from 'zod'

export const UpdateSettingsSchema = z.object({
  sessionPrice: z.number().int().positive({ message: 'Le prix de la séance doit être un entier positif' }),
})

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>
```

- [ ] **Step 5: Write the failing controller tests**

```ts
// server/settings/http/get-settings.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { getSettingsController } from './get-settings.controller'

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

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.appSettings.deleteMany()
})

describe('getSettingsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await getSettingsController(new NextRequest('https://example.com/api/settings'))

    expect(res.status).toBe(401)
  })

  it('returns the settings for an AGENT (read is open to all staff)', async () => {
    const cookie = await staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')

    const res = await getSettingsController(new NextRequest('https://example.com/api/settings', { headers: { cookie } }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.settings.sessionPrice).toBe(8)
  })
})
```

```ts
// server/settings/http/update-settings.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { updateSettingsController } from './update-settings.controller'

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

function patchRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await prismaClient.appSettings.deleteMany()
})

describe('updateSettingsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await updateSettingsController(
      new NextRequest('https://example.com/api/settings', { method: 'PATCH', body: JSON.stringify({ sessionPrice: 10 }) }),
    )

    expect(res.status).toBe(401)
  })

  it('returns 403 when the staff member is an AGENT, not ADMIN', async () => {
    const cookie = await staffAccessTokenCookie('agent@atlas.fit', 'agent123', 'AGENT')

    const res = await updateSettingsController(patchRequest({ sessionPrice: 10 }, cookie))

    expect(res.status).toBe(403)
  })

  it('updates sessionPrice when the staff member is ADMIN', async () => {
    const cookie = await staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')

    const res = await updateSettingsController(patchRequest({ sessionPrice: 12 }, cookie))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.settings.sessionPrice).toBe(12)
  })

  it('returns 400 for an invalid sessionPrice', async () => {
    const cookie = await staffAccessTokenCookie('admin@atlas.fit', 'admin123', 'ADMIN')

    const res = await updateSettingsController(patchRequest({ sessionPrice: -5 }, cookie))

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run server/settings/http/get-settings.controller.test.ts server/settings/http/update-settings.controller.test.ts`
Expected: FAIL — cannot find `./get-settings.controller` / `./update-settings.controller`

- [ ] **Step 7: Write the controllers**

```ts
// server/settings/http/get-settings.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'

export async function getSettingsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { settingsService } = getContainer()
    const settings = await settingsService.getSettings()
    return NextResponse.json(apiSuccess({ settings }))
  })
}
```

```ts
// server/settings/http/update-settings.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailure, apiFailureFromZod, apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { hasPermission } from '../../shared/authorization/permissions'
import { UpdateSettingsSchema } from '../dto/settings.dto'

export async function updateSettingsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  if (!hasPermission(auth.staff.role, 'settings:update')) {
    return NextResponse.json(apiFailure('forbidden'), { status: 403 })
  }

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = UpdateSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { settingsService } = getContainer()
    const settings = await settingsService.updateSettings(parsed.data)
    return NextResponse.json(apiSuccess({ settings }))
  })
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run server/settings/http/get-settings.controller.test.ts server/settings/http/update-settings.controller.test.ts`
Expected: all tests pass (2 + 4 = 6 total).

- [ ] **Step 9: Wire the Next.js route**

```ts
// app/api/settings/route.ts
export { getSettingsController as GET } from '@/server/settings/http/get-settings.controller'
export { updateSettingsController as PATCH } from '@/server/settings/http/update-settings.controller'
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 11: Commit**

```bash
git add server/shared/authorization server/settings/dto server/settings/http app/api/settings
git commit -m "feat: add GET/PATCH /api/settings with settings:update permission"
```

---

## Task 11: Subscription controllers

**Files:**
- Create: `server/memberships/dto/subscription.dto.ts`
- Create: `server/memberships/http/subscriptions/create-or-renew.controller.ts`
- Create: `server/memberships/http/subscriptions/create-or-renew.controller.test.ts`
- Create: `server/memberships/http/subscriptions/suspend.controller.ts`
- Create: `server/memberships/http/subscriptions/suspend.controller.test.ts`
- Create: `server/memberships/http/subscriptions/reactivate.controller.ts`
- Create: `server/memberships/http/subscriptions/reactivate.controller.test.ts`
- Create: `app/api/subscriptions/route.ts`
- Create: `app/api/subscriptions/[id]/suspend/route.ts`
- Create: `app/api/subscriptions/[id]/reactivate/route.ts`

**Interfaces:**
- Consumes: `getContainer().staffSubscriptionService` (Task 9), `requireStaffAuth` (existing).
- Produces: `createOrRenewSubscriptionController(req)`, `suspendSubscriptionController(req, id)`, `reactivateSubscriptionController(req, id)`.

- [ ] **Step 1: Write the DTO**

```ts
// server/memberships/dto/subscription.dto.ts
import { z } from 'zod'
import { PLAN_IDS } from '../domain/entities'

const API_PLAN_IDS = ['monthly', 'quarterly', 'biannual', 'annual'] as const
const API_PAYMENT_METHODS = ['cash', 'card', 'mobile_money'] as const

const API_TO_PLAN_ID: Record<(typeof API_PLAN_IDS)[number], (typeof PLAN_IDS)[number]> = {
  monthly: 'MONTHLY',
  quarterly: 'QUARTERLY',
  biannual: 'BIANNUAL',
  annual: 'ANNUAL',
}

const API_TO_PAYMENT_METHOD: Record<(typeof API_PAYMENT_METHODS)[number], 'CASH' | 'CARD' | 'MOBILE_MONEY'> = {
  cash: 'CASH',
  card: 'CARD',
  mobile_money: 'MOBILE_MONEY',
}

export const CreateOrRenewSubscriptionSchema = z
  .object({
    clientId: z.string().trim().min(1, { message: 'clientId est requis' }),
    planId: z.enum(API_PLAN_IDS, { message: 'planId invalide' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({
    clientId: input.clientId,
    planId: API_TO_PLAN_ID[input.planId],
    paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod],
  }))

export type CreateOrRenewSubscriptionDto = z.infer<typeof CreateOrRenewSubscriptionSchema>
```

`API_TO_PLAN_ID`/`API_TO_PAYMENT_METHOD` are `Record<..., ...>` over every key of their respective `as const` tuples, so TypeScript itself refuses to compile if a lowercase API value is ever added to `API_PLAN_IDS`/`API_PAYMENT_METHODS` without a matching translation entry — the same exhaustiveness guarantee `get-my-client-profile.controller.ts`'s `PLAN_ID_MAP`/`PAYMENT_METHOD_MAP` already rely on, just inverted (API-facing lowercase → domain uppercase, instead of domain → API).

- [ ] **Step 2: Write the failing test for create-or-renew**

```ts
// server/memberships/http/subscriptions/create-or-renew.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from './create-or-renew.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

function postClient(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function postSubscription(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('createOrRenewSubscriptionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await createOrRenewSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('creates a subscription with server-computed amountPaid/dates, translated to lowercase in the response', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(postClient({ name: 'Marc Delaunay', phone: '+33612345699' }, cookie))
    const client = (await clientRes.json()).data.client

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: client.id, planId: 'quarterly', paymentMethod: 'card' }, cookie),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.subscription.planId).toBe('quarterly')
    expect(json.data.subscription.paymentMethod).toBe('card')
    expect(json.data.subscription.amountPaid).toBe(105)
    expect(json.data.subscription.suspended).toBe(false)
  })

  it('returns 404 when the client does not exist', async () => {
    const cookie = await adminCookie()

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: 'does-not-exist', planId: 'monthly', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid planId', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(postClient({ name: 'Marc Delaunay', phone: '+33612345698' }, cookie))
    const client = (await clientRes.json()).data.client

    const res = await createOrRenewSubscriptionController(
      postSubscription({ clientId: client.id, planId: 'weekly', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/memberships/http/subscriptions/create-or-renew.controller.test.ts`
Expected: FAIL — `Cannot find module './create-or-renew.controller'`

- [ ] **Step 4: Write a shared error-status helper for `MembershipDomainError`**

```ts
// server/memberships/http/membership-api-response.ts
import type { MembershipDomainError } from '../domain/errors'
import { apiFailure, type ApiFailure } from '../../shared/api-response'

export function apiFailureFromMembershipDomainError(error: MembershipDomainError): ApiFailure {
  return apiFailure(error.message, error.reason ? [{ field: 'reason', message: error.reason }] : null)
}

export function statusForMembershipDomainError(error: MembershipDomainError): number {
  switch (error.code) {
    case 'client-not-found':
    case 'client-inactive':
    case 'subscription-not-found':
      return 404
    case 'session-ineligible':
      return 422
  }
}
```

- [ ] **Step 5: Write the shared `toApiSubscription` mapper**

```ts
// server/memberships/http/subscriptions/to-api-subscription.ts
import type { PaymentMethod, PlanId, Subscription } from '../../domain/entities'

const PLAN_ID_MAP: Record<PlanId, string> = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUAL: 'biannual',
  ANNUAL: 'annual',
}

const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
}

export function toApiSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    clientId: subscription.clientId,
    planId: PLAN_ID_MAP[subscription.planId],
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    suspended: subscription.suspended,
    amountPaid: subscription.amountPaid,
    paymentMethod: PAYMENT_METHOD_MAP[subscription.paymentMethod],
    createdAt: subscription.createdAt,
  }
}
```

Note: this duplicates `get-my-client-profile.controller.ts`'s `PLAN_ID_MAP`/`PAYMENT_METHOD_MAP`/`toApiSubscription` — deliberately, not an oversight. That controller's version is private to its own file (a `clients` module controller, per Task-1-era file organization); extracting a shared cross-module mapper now would mean either moving it into `memberships` (which `clients` would then need to import from, backwards from the module's own domain) or into `shared` (a bigger refactor of already-shipped, already-reviewed code, out of scope for this plan). Two small, identical translation tables are an acceptable, contained duplication — revisit only if a third call site appears.

- [ ] **Step 6: Write the create-or-renew controller**

```ts
// server/memberships/http/subscriptions/create-or-renew.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { CreateOrRenewSubscriptionSchema } from '../../dto/subscription.dto'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSubscription } from './to-api-subscription'

export async function createOrRenewSubscriptionController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = CreateOrRenewSubscriptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { staffSubscriptionService } = getContainer()
    const result = await staffSubscriptionService.createOrRenewSubscription({
      ...parsed.data,
      createdByStaffId: auth.staff.id,
    })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ subscription: toApiSubscription(result.value) }), { status: 201 })
  })
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run server/memberships/http/subscriptions/create-or-renew.controller.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 8: Write the failing tests for suspend/reactivate**

```ts
// server/memberships/http/subscriptions/suspend.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from './create-or-renew.controller'
import { suspendSubscriptionController } from './suspend.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

async function createSubscription(cookie: string, phone: string): Promise<string> {
  const clientRes = await createClientController(
    new NextRequest('https://example.com/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Test Client', phone }),
    }),
  )
  const client = (await clientRes.json()).data.client
  const subRes = await createOrRenewSubscriptionController(
    new NextRequest('https://example.com/api/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientId: client.id, planId: 'monthly', paymentMethod: 'cash' }),
    }),
  )
  return (await subRes.json()).data.subscription.id
}

function suspendRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/subscriptions/x/suspend', { method: 'PATCH', headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('suspendSubscriptionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await suspendSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions/x/suspend', { method: 'PATCH' }),
      'some-id',
    )

    expect(res.status).toBe(401)
  })

  it('suspends an existing subscription', async () => {
    const cookie = await adminCookie()
    const subscriptionId = await createSubscription(cookie, '+33612345697')

    const res = await suspendSubscriptionController(suspendRequest(cookie), subscriptionId)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.subscription.suspended).toBe(true)
  })

  it('returns 404 for an unknown subscription id', async () => {
    const cookie = await adminCookie()

    const res = await suspendSubscriptionController(suspendRequest(cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

```ts
// server/memberships/http/subscriptions/reactivate.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from './create-or-renew.controller'
import { reactivateSubscriptionController } from './reactivate.controller'
import { suspendSubscriptionController } from './suspend.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

async function createSuspendedSubscription(cookie: string, phone: string): Promise<string> {
  const clientRes = await createClientController(
    new NextRequest('https://example.com/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Test Client', phone }),
    }),
  )
  const client = (await clientRes.json()).data.client
  const subRes = await createOrRenewSubscriptionController(
    new NextRequest('https://example.com/api/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientId: client.id, planId: 'monthly', paymentMethod: 'cash' }),
    }),
  )
  const subscriptionId = (await subRes.json()).data.subscription.id
  await suspendSubscriptionController(
    new NextRequest('https://example.com/api/subscriptions/x/suspend', { method: 'PATCH', headers: { cookie } }),
    subscriptionId,
  )
  return subscriptionId
}

function reactivateRequest(cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/subscriptions/x/reactivate', { method: 'PATCH', headers: { cookie } })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('reactivateSubscriptionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await reactivateSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions/x/reactivate', { method: 'PATCH' }),
      'some-id',
    )

    expect(res.status).toBe(401)
  })

  it('reactivates a suspended subscription', async () => {
    const cookie = await adminCookie()
    const subscriptionId = await createSuspendedSubscription(cookie, '+33612345696')

    const res = await reactivateSubscriptionController(reactivateRequest(cookie), subscriptionId)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.subscription.suspended).toBe(false)
  })

  it('returns 404 for an unknown subscription id', async () => {
    const cookie = await adminCookie()

    const res = await reactivateSubscriptionController(reactivateRequest(cookie), 'does-not-exist')

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 9: Run tests to verify they fail**

Run: `npx vitest run server/memberships/http/subscriptions/suspend.controller.test.ts server/memberships/http/subscriptions/reactivate.controller.test.ts`
Expected: FAIL — cannot find `./suspend.controller` / `./reactivate.controller`

- [ ] **Step 10: Write the suspend and reactivate controllers**

```ts
// server/memberships/http/subscriptions/suspend.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSubscription } from './to-api-subscription'

export async function suspendSubscriptionController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { staffSubscriptionService } = getContainer()
    const result = await staffSubscriptionService.suspendSubscription(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ subscription: toApiSubscription(result.value) }))
  })
}
```

```ts
// server/memberships/http/subscriptions/reactivate.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSubscription } from './to-api-subscription'

export async function reactivateSubscriptionController(req: NextRequest, id: string): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { staffSubscriptionService } = getContainer()
    const result = await staffSubscriptionService.reactivateSubscription(id)

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ subscription: toApiSubscription(result.value) }))
  })
}
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run server/memberships/http/subscriptions`
Expected: all tests pass (4 + 3 + 3 = 10 total).

- [ ] **Step 12: Wire the Next.js routes**

```ts
// app/api/subscriptions/route.ts
export { createOrRenewSubscriptionController as POST } from '@/server/memberships/http/subscriptions/create-or-renew.controller'
```

```ts
// app/api/subscriptions/[id]/suspend/route.ts
import type { NextRequest } from 'next/server'
import { suspendSubscriptionController } from '@/server/memberships/http/subscriptions/suspend.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return suspendSubscriptionController(req, id)
}
```

```ts
// app/api/subscriptions/[id]/reactivate/route.ts
import type { NextRequest } from 'next/server'
import { reactivateSubscriptionController } from '@/server/memberships/http/subscriptions/reactivate.controller'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  return reactivateSubscriptionController(req, id)
}
```

- [ ] **Step 13: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 14: Commit**

```bash
git add server/memberships/dto server/memberships/http/subscriptions server/memberships/http/membership-api-response.ts app/api/subscriptions
git commit -m "feat: add subscription controllers (create-or-renew, suspend, reactivate)"
```

---

## Task 12: Session controllers

**Files:**
- Create: `server/memberships/dto/session.dto.ts`
- Create: `server/memberships/http/sessions/record-subscriber.controller.ts`
- Create: `server/memberships/http/sessions/record-subscriber.controller.test.ts`
- Create: `server/memberships/http/sessions/record-visitor.controller.ts`
- Create: `server/memberships/http/sessions/record-visitor.controller.test.ts`
- Create: `app/api/sessions/subscriber/route.ts`
- Create: `app/api/sessions/visitor/route.ts`

**Interfaces:**
- Consumes: `getContainer().staffSessionService` (Task 9).
- Produces: `recordSubscriberSessionController(req)`, `recordVisitorSessionController(req)`.

- [ ] **Step 1: Write the DTO**

```ts
// server/memberships/dto/session.dto.ts
import { z } from 'zod'

const API_PAYMENT_METHODS = ['cash', 'card', 'mobile_money'] as const

const API_TO_PAYMENT_METHOD: Record<(typeof API_PAYMENT_METHODS)[number], 'CASH' | 'CARD' | 'MOBILE_MONEY'> = {
  cash: 'CASH',
  card: 'CARD',
  mobile_money: 'MOBILE_MONEY',
}

export const RecordSubscriberSessionSchema = z
  .object({
    clientId: z.string().trim().min(1, { message: 'clientId est requis' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({ clientId: input.clientId, paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod] }))

export type RecordSubscriberSessionDto = z.infer<typeof RecordSubscriberSessionSchema>

const PHONE_PATTERN = /^\+\d{8,15}$/

export const RecordVisitorSessionSchema = z
  .object({
    visitorName: z.string().trim().min(1, { message: 'Le nom est requis' }),
    visitorPhone: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({
    visitorName: input.visitorName,
    visitorPhone: input.visitorPhone,
    paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod],
  }))

export type RecordVisitorSessionDto = z.infer<typeof RecordVisitorSessionSchema>
```

- [ ] **Step 2: Write the shared `toApiSession` mapper for this module**

```ts
// server/memberships/http/sessions/to-api-session.ts
import type { PaymentMethod, Session } from '../../domain/entities'

const PAYMENT_METHOD_MAP: Record<PaymentMethod, string> = {
  CASH: 'cash',
  CARD: 'card',
  MOBILE_MONEY: 'mobile_money',
}

export function toApiSession(session: Session) {
  return {
    id: session.id,
    type: session.type === 'SUBSCRIBER' ? ('subscriber' as const) : ('visitor' as const),
    clientId: session.clientId,
    visitorName: session.visitorName,
    visitorPhone: session.visitorPhone,
    amountPaid: session.amountPaid,
    paymentMethod: PAYMENT_METHOD_MAP[session.paymentMethod],
    checkedInAt: session.checkedInAt,
  }
}
```

Unlike `get-my-client-profile.controller.ts`'s `toApiSession` (which throws on a non-SUBSCRIBER session, since that endpoint's invariant guarantees one never arrives), this mapper genuinely handles both cases — it's called right after this module's own `create()` calls, which produce both `SUBSCRIBER` and `VISITOR` sessions by design, so a ternary is correct here, not a throw.

- [ ] **Step 3: Write the failing test for record-subscriber**

```ts
// server/memberships/http/sessions/record-subscriber.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { createClientController } from '../../../clients/http/create-client.controller'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { createOrRenewSubscriptionController } from '../subscriptions/create-or-renew.controller'
import { recordSubscriberSessionController } from './record-subscriber.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

function sessionRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/sessions/subscriber', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
  await prismaClient.appSettings.deleteMany()
})

describe('recordSubscriberSessionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await recordSubscriberSessionController(
      new NextRequest('https://example.com/api/sessions/subscriber', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('records a session for an eligible client, amountPaid from settings default', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(
      new NextRequest('https://example.com/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Marc Delaunay', phone: '+33612345695' }),
      }),
    )
    const client = (await clientRes.json()).data.client
    await createOrRenewSubscriptionController(
      new NextRequest('https://example.com/api/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ clientId: client.id, planId: 'monthly', paymentMethod: 'cash' }),
      }),
    )

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: client.id, paymentMethod: 'cash' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.session.type).toBe('subscriber')
    expect(json.data.session.amountPaid).toBe(8)
  })

  it('returns 422 with reason "none" when the client has no subscription', async () => {
    const cookie = await adminCookie()
    const clientRes = await createClientController(
      new NextRequest('https://example.com/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'No Subscription', phone: '+33612345694' }),
      }),
    )
    const client = (await clientRes.json()).data.client

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: client.id, paymentMethod: 'cash' }, cookie))
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.errors?.[0]?.message).toBe('none')
  })

  it('returns 404 when the client does not exist', async () => {
    const cookie = await adminCookie()

    const res = await recordSubscriberSessionController(sessionRequest({ clientId: 'does-not-exist', paymentMethod: 'cash' }, cookie))

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run server/memberships/http/sessions/record-subscriber.controller.test.ts`
Expected: FAIL — `Cannot find module './record-subscriber.controller'`

- [ ] **Step 5: Write the record-subscriber controller**

```ts
// server/memberships/http/sessions/record-subscriber.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { RecordSubscriberSessionSchema } from '../../dto/session.dto'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSession } from './to-api-session'

export async function recordSubscriberSessionController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = RecordSubscriberSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { staffSessionService } = getContainer()
    const result = await staffSessionService.recordSubscriberSession({
      ...parsed.data,
      createdByStaffId: auth.staff.id,
    })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ session: toApiSession(result.value) }), { status: 201 })
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/memberships/http/sessions/record-subscriber.controller.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 7: Write the failing test for record-visitor**

```ts
// server/memberships/http/sessions/record-visitor.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../../shared/prisma-client'
import { cleanAuthTables } from '../../../auth/infrastructure/test-helpers/clean-db'
import { staffLoginController } from '../../../auth/http/staff-login.controller'
import { cleanClientsTable } from '../../../clients/infrastructure/test-helpers/clean-clients-table'
import { cleanMembershipsTables } from '../../infrastructure/test-helpers/clean-memberships-tables'
import { recordVisitorSessionController } from './record-visitor.controller'

async function adminCookie(): Promise<string> {
  const passwordHash = await argon2.hash('admin123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'admin@atlas.fit' },
    update: {},
    create: { email: 'admin@atlas.fit', passwordHash, name: 'Admin', role: 'ADMIN' },
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

function sessionRequest(body: unknown, cookie: string): NextRequest {
  return new NextRequest('https://example.com/api/sessions/visitor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
  await prismaClient.appSettings.deleteMany()
})

describe('recordVisitorSessionController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await recordVisitorSessionController(
      new NextRequest('https://example.com/api/sessions/visitor', { method: 'POST', body: JSON.stringify({}) }),
    )

    expect(res.status).toBe(401)
  })

  it('records a visitor session, no eligibility check', async () => {
    const cookie = await adminCookie()

    const res = await recordVisitorSessionController(
      sessionRequest({ visitorName: 'Nadia Ferrand', visitorPhone: '+33698765432', paymentMethod: 'cash' }, cookie),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.session.type).toBe('visitor')
    expect(json.data.session.visitorName).toBe('Nadia Ferrand')
    expect(json.data.session.amountPaid).toBe(8)
  })

  it('returns 400 for an invalid visitorPhone', async () => {
    const cookie = await adminCookie()

    const res = await recordVisitorSessionController(
      sessionRequest({ visitorName: 'Nadia Ferrand', visitorPhone: '0612345678', paymentMethod: 'cash' }, cookie),
    )

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run server/memberships/http/sessions/record-visitor.controller.test.ts`
Expected: FAIL — `Cannot find module './record-visitor.controller'`

- [ ] **Step 9: Write the record-visitor controller**

```ts
// server/memberships/http/sessions/record-visitor.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiFailureFromZod, apiSuccess } from '../../../shared/api-response'
import { getContainer } from '../../../shared/container'
import { withInternalErrorHandling } from '../../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../../auth/http/require-staff-auth'
import { RecordVisitorSessionSchema } from '../../dto/session.dto'
import { apiFailureFromMembershipDomainError, statusForMembershipDomainError } from '../membership-api-response'
import { toApiSession } from './to-api-session'

export async function recordVisitorSessionController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const body = await req.json().catch(() => null)
    const parsed = RecordVisitorSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
    }

    const { staffSessionService } = getContainer()
    const result = await staffSessionService.recordVisitorSession({
      ...parsed.data,
      createdByStaffId: auth.staff.id,
    })

    if (!result.ok) {
      return NextResponse.json(apiFailureFromMembershipDomainError(result.error), {
        status: statusForMembershipDomainError(result.error),
      })
    }

    return NextResponse.json(apiSuccess({ session: toApiSession(result.value) }), { status: 201 })
  })
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run server/memberships/http/sessions/record-visitor.controller.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 11: Wire the Next.js routes**

```ts
// app/api/sessions/subscriber/route.ts
export { recordSubscriberSessionController as POST } from '@/server/memberships/http/sessions/record-subscriber.controller'
```

```ts
// app/api/sessions/visitor/route.ts
export { recordVisitorSessionController as POST } from '@/server/memberships/http/sessions/record-visitor.controller'
```

- [ ] **Step 12: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 13: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no regressions anywhere.

- [ ] **Step 14: Commit**

```bash
git add server/memberships/dto/session.dto.ts server/memberships/http/sessions app/api/sessions
git commit -m "feat: add session controllers (record-subscriber, record-visitor)"
```

- [ ] **Step 15: Flag for code review**

This completes the HTTP layer and the module as a whole (Tasks 1-12). Run the code-review skill on the full diff before proceeding to seed data and live verification.

---

## Task 13: Seed data — `AppSettings` row

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma.appSettings.upsert` (Prisma-generated, from Task 2).

- [ ] **Step 1: Add the settings seed block**

In `prisma/seed.ts`, add this block inside `main()`, right after the `STAFF_SEED` upsert loop and before the `adminSeed`/`admin` lookup (so it runs early, independent of client seeding):

```ts
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', sessionPrice: 8 },
  })
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npx prisma db seed`
Expected: exits 0, no error output.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT id, \"sessionPrice\" FROM app_settings;"
```
Expected: one row, `id = 'singleton'`, `sessionPrice = 8`.

- [ ] **Step 4: Re-run the seed to confirm idempotency**

Run: `npx prisma db seed`
Expected: exits 0, still exactly one row (re-run the query from Step 3, same result).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed the AppSettings singleton row"
```

---

## Task 14: Live verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite and type-check one final time**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Start the dev server if not already running**

Check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`. Start it in the background if not running (see `.claude/skills/verify/SKILL.md` for known binary-resolution workarounds on this Windows/pnpm setup).

- [ ] **Step 3: Log in as admin and get a session cookie**

Ensure the scratch directory exists first: `mkdir -p .scratch`

```bash
curl -s -c .scratch/staff-verify.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" -d '{"email":"admin@atlas.fit","password":"admin123"}' -w "\n%{http_code}\n"
```
Expected: `200`.

- [ ] **Step 4: Create a fresh throwaway client for this verification**

Deliberately not one of the seeded demo clients (Yasmine/Marc/Inès/Karim) — the seed script's idempotency guard (`hasSubscriptions` existence check per client, see `prisma/seed.ts`) only skips re-seeding a client that ALREADY has subscriptions; it has no "reset" capability. Writing through one of the 3 demo scenarios here would permanently add extra subscriptions/sessions to their history with no way to undo it via `prisma db seed` afterward. A fresh client sidesteps this — nothing needs to be restored at the end because this client was never part of the curated demo data to begin with. Also note Karim Benali (`+33612345604`) specifically could never be used for this even if we wanted to: the seed sets `linkToClient: false` for him, so he has a `ClientAccount` but no `Client` row at all, and `createOrRenewSubscription` requires a real `Client.id`.

```bash
curl -s -b .scratch/staff-verify.txt -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" -d '{"name":"Live Verification Client","phone":"+33600009999"}' | python3 -m json.tool
```
Note the returned `id` — use it for every `<client id>` placeholder below.

- [ ] **Step 5: Create a subscription for this client**

```bash
curl -s -b .scratch/staff-verify.txt -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" -d '{"clientId":"<client id>","planId":"monthly","paymentMethod":"cash"}' -w "\n%{http_code}\n"
```
Expected: `201`, `data.subscription.planId === "monthly"`, `data.subscription.amountPaid === 40`, `data.subscription.startDate` approximately now (no prior subscription to chain from). Note the returned `data.subscription.id` — use it as `<subscription id>` in Step 7.

- [ ] **Step 6: Record a subscriber session for the same client**

```bash
curl -s -b .scratch/staff-verify.txt -X POST http://localhost:3000/api/sessions/subscriber \
  -H "Content-Type: application/json" -d '{"clientId":"<client id>","paymentMethod":"cash"}' -w "\n%{http_code}\n"
```
Expected: `201`, `data.session.amountPaid === 8`.

- [ ] **Step 7: Confirm the read side reflects it — log in as that client and check their profile**

```bash
curl -s -X POST http://localhost:3000/api/auth/client/request-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33600009999"}' -o /dev/null -w "%{http_code}\n"

curl -s -c .scratch/client-verify.txt -X POST http://localhost:3000/api/auth/client/verify-otp \
  -H "Content-Type: application/json" -d '{"phone":"+33600009999","code":"123456"}' -w "\n%{http_code}\n"

curl -s -b .scratch/client-verify.txt http://localhost:3000/api/client/me/profile
```
Expected: `200`, `data.subscription.planId === "monthly"`, `data.subscriptionHistory` has 1 entry, `data.sessionHistory` has 1 entry with `amountPaid: 8`.

- [ ] **Step 8: Suspend the subscription and confirm the read side reflects it**

```bash
curl -s -b .scratch/staff-verify.txt -X PATCH http://localhost:3000/api/subscriptions/<subscription id>/suspend -w "\n%{http_code}\n"
curl -s -b .scratch/client-verify.txt http://localhost:3000/api/client/me/profile
```
Expected: suspend returns `200`, `data.subscription.suspended === true`; the profile fetch still returns this subscription as `subscription` (not null — suspended-but-unexpired is still current) with `suspended: true`.

- [ ] **Step 9: Record a visitor session**

```bash
curl -s -b .scratch/staff-verify.txt -X POST http://localhost:3000/api/sessions/visitor \
  -H "Content-Type: application/json" -d '{"visitorName":"Test Visitor","visitorPhone":"+33698765400","paymentMethod":"card"}' -w "\n%{http_code}\n"
```
Expected: `201`, `data.session.type === "visitor"`.

- [ ] **Step 10: Verify AGENT cannot update settings, but ADMIN can**

```bash
curl -s -c .scratch/agent-verify.txt -X POST http://localhost:3000/api/auth/staff/login \
  -H "Content-Type: application/json" -d '{"email":"agent@atlas.fit","password":"agent123"}' -o /dev/null -w "%{http_code}\n"

curl -s -b .scratch/agent-verify.txt -X PATCH http://localhost:3000/api/settings \
  -H "Content-Type: application/json" -d '{"sessionPrice":10}' -w "\n%{http_code}\n"
```
Expected: `403`.

```bash
curl -s -b .scratch/staff-verify.txt -X PATCH http://localhost:3000/api/settings \
  -H "Content-Type: application/json" -d '{"sessionPrice":10}' -w "\n%{http_code}\n"
```
Expected: `200`, `data.settings.sessionPrice === 10`. Reset it back to 8 afterward:
```bash
curl -s -b .scratch/staff-verify.txt -X PATCH http://localhost:3000/api/settings \
  -H "Content-Type: application/json" -d '{"sessionPrice":8}' -o /dev/null -w "%{http_code}\n"
```

- [ ] **Step 11: Deactivate the throwaway client and clean up**

The client created in Step 4 was only for this verification — deactivate it (soft delete, consistent with how this project treats client removal elsewhere) rather than leaving it cluttering the real clients list:

```bash
curl -s -b .scratch/staff-verify.txt -X DELETE http://localhost:3000/api/clients/<client id> -o /dev/null -w "%{http_code}\n"
```
Expected: `200`.

```bash
rm -f .scratch/staff-verify.txt .scratch/client-verify.txt .scratch/agent-verify.txt
```

No commit needed for this task — verification only. The seeded demo clients (Yasmine/Marc/Inès/Karim) are untouched by this task, so no re-seed is needed.

---

## Out of scope (confirmed by the design doc, do not implement here)

- Deleting a subscription or session.
- Editing a subscription/session after creation (plan change, date change, amount change) — only suspend/reactivate.
- Partial payments or refunds — `amountPaid` is always the full plan/session price.
- An editable, DB-backed plan catalog — `PLAN_CATALOG` stays a backend constant.
- `AppSettings` fields beyond `sessionPrice`.
- Frontend changes (wiring `subscriptions-provider.tsx`/`sessions-provider.tsx`/`settings-provider.tsx` to these real endpoints, removing the mocks) — separate frontend-owned work, per this project's role split; this plan only delivers the backend contract.
