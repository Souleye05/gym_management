# Staff Dashboard Statistics Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/mock-data.ts` for the staff dashboard (`app/(staff)/page.tsx`) with a real, single aggregated `GET /api/statistics/dashboard` endpoint backed by a new `server/statistics/` module.

**Architecture:** Clean Architecture, mirroring `server/memberships/` and `server/settings/` exactly: `domain/` (pure types + pure functions) → `repositories/` (interface) → `infrastructure/` (Prisma impl, aggregate queries) → `services/` (orchestration) → `http/` (controller + output mapper). Read-only — no new Prisma table, no write paths touched.

**Tech Stack:** Next.js API routes, Prisma (new: `groupBy`/`aggregate`/`count`, not yet used elsewhere in this codebase), Vitest + real Postgres integration tests (established project convention).

**Spec:** `docs/superpowers/specs/2026-07-22-staff-statistics-dashboard-design.md`

## Global Constraints

- No new Prisma model/migration — everything derives from existing `Client`, `Subscription`, `Session` tables (design section 2).
- Single aggregated endpoint, not one per widget (design section 2).
- `expiring` threshold = 7 days (`0 <= daysLeft <= 7`); `expired` = `daysLeft < 0` (design section 4.5).
- Top members window = 30 rolling days, top 5 (design section 4.7).
- `expiringSubscriptions` widget: suspended subscriptions excluded entirely; capped at 10, sorted by `daysLeft` ascending (design section 4.5).
- Revenue "objectif" field: out of scope, not built (design section 4.9).
- All timestamps in the API response are raw ISO datetimes — never pre-formatted relative strings ("il y a 4 min") (design section 4.8).
- `planId` translated to lowercase at the HTTP boundary only, same `Record<PlanId, string>` exhaustive-table pattern as `to-api-subscription.ts`/`to-api-session.ts`.
- Permission: any authenticated staff (no extra permission), same model as `GET /api/settings`.
- No new `MembershipDomainError`-style error type — this endpoint has no expected business failure, only `withInternalErrorHandling`'s generic 500 boundary.
- Environment quirks (from prior chantiers in this repo): `npx` binary resolution is unreliable on this Windows/pnpm setup — invoke test/build binaries directly via `node node_modules/.pnpm/<package>@<version>/node_modules/<bin>` if `npx` fails. This is a shared git working tree — stage/commit only the exact files each task lists, never `git add -A`/`git add .`.

---

### Task 1: Add French plan labels to `PLAN_CATALOG`

**Files:**
- Modify: `server/memberships/domain/plan-catalog.ts`

**Interfaces:**
- Produces: `PLAN_CATALOG: Record<PlanId, { label: string; durationDays: number; price: number }>` — adds `label` to the existing type. Non-breaking: existing consumers (`DefaultStaffSubscriptionService.createOrRenewSubscription`) destructure `{ durationDays, price }` only.

- [ ] **Step 1: Update the file**

```ts
// server/memberships/domain/plan-catalog.ts
import type { PlanId } from './entities'

/**
 * Mirrors lib/subscriptions/plans.ts's PLANS array exactly (same durations/prices/labels). Kept as
 * a static backend constant rather than a DB-backed model — the catalog stays frontend-editable-only
 * territory until an actual need to edit prices without a redeploy exists.
 */
export const PLAN_CATALOG: Record<PlanId, { label: string; durationDays: number; price: number }> = {
  MONTHLY: { label: 'Mensuel', durationDays: 30, price: 40 },
  QUARTERLY: { label: 'Trimestriel', durationDays: 90, price: 105 },
  BIANNUAL: { label: 'Semestriel', durationDays: 180, price: 190 },
  ANNUAL: { label: 'Annuel', durationDays: 365, price: 350 },
}
```

- [ ] **Step 2: Verify nothing broke**

Run: `node node_modules/.pnpm/typescript@*/node_modules/typescript/bin/tsc --noEmit`
Expected: clean (no errors).

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/memberships`
Expected: all existing tests still pass (this is a purely additive field, no existing test asserts `PLAN_CATALOG`'s exact shape).

- [ ] **Step 3: Commit**

```bash
git add server/memberships/domain/plan-catalog.ts
git commit -m "feat: add French plan labels to PLAN_CATALOG"
```

---

### Task 2: Domain entities and `deriveKpiDelta`

**Files:**
- Create: `server/statistics/domain/entities.ts`
- Create: `server/statistics/domain/derive-kpi-delta.ts`
- Test: `server/statistics/domain/derive-kpi-delta.test.ts`

**Interfaces:**
- Consumes: `PlanId` from `server/memberships/domain/entities.ts`.
- Produces: `KpiValue`, `ActivityType`, `ActivityItem`, `ExpiringSubscriptionStatus`, `ExpiringSubscription`, `TopMember`, `DashboardStatistics` types (used by Tasks 3, 4, 5, 10). `deriveKpiDelta(current: number, previous: number): Omit<KpiValue, 'value'>` (used by Task 10).

- [ ] **Step 1: Create the domain types file**

```ts
// server/statistics/domain/entities.ts
import type { PlanId } from '../../memberships/domain/entities'

export type KpiValue = {
  value: number
  deltaPercent: number
  trend: 'up' | 'down'
}

export type ActivityType = 'payment' | 'renewal' | 'session' | 'signup' | 'expired'

export type ActivityItem = {
  id: string
  type: ActivityType
  clientId: string | null
  name: string
  detail: string
  occurredAt: Date
}

export type ExpiringSubscriptionStatus = 'expiring' | 'expired'

export type ExpiringSubscription = {
  clientId: string
  name: string
  planId: PlanId
  status: ExpiringSubscriptionStatus
  daysLeft: number
  lastVisitAt: Date | null
}

export type TopMember = {
  clientId: string
  name: string
  planId: PlanId
  sessionsCount: number
}

export type DashboardStatistics = {
  kpis: {
    revenue: KpiValue
    activeClients: KpiValue
    sessionsToday: KpiValue
    expiredSubscriptions: KpiValue
  }
  revenueSeries: { month: string; revenue: number }[]
  attendanceSeries: { day: string; sessions: number }[]
  planDistribution: { planId: PlanId; count: number }[]
  recentActivity: ActivityItem[]
  expiringSubscriptions: ExpiringSubscription[]
  topMembers: TopMember[]
}
```

- [ ] **Step 2: Write the failing test for `deriveKpiDelta`**

```ts
// server/statistics/domain/derive-kpi-delta.test.ts
import { describe, expect, it } from 'vitest'
import { deriveKpiDelta } from './derive-kpi-delta'

describe('deriveKpiDelta', () => {
  it('computes a positive percentage change', () => {
    expect(deriveKpiDelta(120, 100)).toEqual({ deltaPercent: 20, trend: 'up' })
  })

  it('computes a negative percentage change', () => {
    expect(deriveKpiDelta(80, 100)).toEqual({ deltaPercent: -20, trend: 'down' })
  })

  it('treats a zero-to-positive change as +100%, not Infinity', () => {
    expect(deriveKpiDelta(50, 0)).toEqual({ deltaPercent: 100, trend: 'up' })
  })

  it('treats a zero-to-zero change as 0%, not NaN', () => {
    expect(deriveKpiDelta(0, 0)).toEqual({ deltaPercent: 0, trend: 'up' })
  })

  it('rounds to one decimal place', () => {
    expect(deriveKpiDelta(103, 97)).toEqual({ deltaPercent: 6.2, trend: 'up' })
  })

  it('treats an unchanged nonzero value as 0%, trend up', () => {
    expect(deriveKpiDelta(50, 50)).toEqual({ deltaPercent: 0, trend: 'up' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/derive-kpi-delta.test.ts`
Expected: FAIL — `derive-kpi-delta.ts` does not exist yet.

- [ ] **Step 4: Implement `deriveKpiDelta`**

```ts
// server/statistics/domain/derive-kpi-delta.ts
import type { KpiValue } from './entities'

/**
 * `previous === 0` has no mathematically defined percentage change. Convention: +100% if `current`
 * grew from nothing, 0% if both are zero — never `Infinity`/`NaN`, which would break JSON
 * serialization and any frontend arithmetic on the value.
 */
export function deriveKpiDelta(current: number, previous: number): Omit<KpiValue, 'value'> {
  if (previous === 0) {
    return { deltaPercent: current > 0 ? 100 : 0, trend: 'up' }
  }
  const deltaPercent = Math.round(((current - previous) / previous) * 1000) / 10
  return { deltaPercent, trend: deltaPercent >= 0 ? 'up' : 'down' }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/derive-kpi-delta.test.ts`
Expected: PASS (6/6).

- [ ] **Step 6: Commit**

```bash
git add server/statistics/domain/entities.ts server/statistics/domain/derive-kpi-delta.ts server/statistics/domain/derive-kpi-delta.test.ts
git commit -m "feat: add statistics domain entities and deriveKpiDelta"
```

---

### Task 3: `classifySubscriptionStatus`

**Files:**
- Create: `server/statistics/domain/classify-subscription-status.ts`
- Test: `server/statistics/domain/classify-subscription-status.test.ts`

**Interfaces:**
- Consumes: `ExpiringSubscriptionStatus` from Task 2's `entities.ts`.
- Produces: `SubscriptionStatusClassification`, `classifySubscriptionStatus(subscription: { suspended: boolean; endDate: Date }, now: Date, expiringThresholdDays: number): SubscriptionStatusClassification` (used by Task 10's service).

- [ ] **Step 1: Write the failing tests**

```ts
// server/statistics/domain/classify-subscription-status.test.ts
import { describe, expect, it } from 'vitest'
import { classifySubscriptionStatus } from './classify-subscription-status'

const NOW = new Date('2026-07-22T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('classifySubscriptionStatus', () => {
  it('classifies as expiring at exactly the threshold boundary (7 days left)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 7 * DAY) }, NOW, 7)
    expect(result).toEqual({ status: 'expiring', daysLeft: 7 })
  })

  it('excludes a subscription one day beyond the threshold (8 days left)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 8 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('classifies as expired when endDate is in the past', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() - 1 * DAY) }, NOW, 7)
    expect(result).toEqual({ status: 'expired', daysLeft: -1 })
  })

  it('classifies as expired when endDate equals now exactly (inclusive boundary)', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: NOW }, NOW, 7)
    expect(result).toEqual({ status: 'expired', daysLeft: 0 })
  })

  it('excludes a suspended subscription even when its dates would otherwise classify as expiring', () => {
    const result = classifySubscriptionStatus({ suspended: true, endDate: new Date(NOW.getTime() + 1 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('excludes a suspended subscription even when its dates would otherwise classify as expired', () => {
    const result = classifySubscriptionStatus({ suspended: true, endDate: new Date(NOW.getTime() - 5 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })

  it('excludes a subscription comfortably within its validity window', () => {
    const result = classifySubscriptionStatus({ suspended: false, endDate: new Date(NOW.getTime() + 30 * DAY) }, NOW, 7)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/classify-subscription-status.test.ts`
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Implement**

```ts
// server/statistics/domain/classify-subscription-status.ts
import type { ExpiringSubscriptionStatus } from './entities'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type SubscriptionStatusClassification = { status: ExpiringSubscriptionStatus; daysLeft: number } | null

/**
 * `subscription` must already be the client's latest-started subscription — this function only
 * judges the one it's given, it does not pick which one (see
 * PrismaStatisticsRepository.getLatestStartedSubscriptionPerClient). Suspended subscriptions are
 * excluded (`null`): suspension is a deliberate staff action, not something needing a renewal
 * follow-up. Status is decided by `endDate <= now` first (same inclusive boundary convention as
 * checkSessionEligibility in server/memberships), not by the sign of `daysLeft` — this keeps
 * "expired 30 seconds ago" correctly `expired` rather than rounding to `daysLeft: 0` and being
 * misread as still within the expiring window.
 */
export function classifySubscriptionStatus(
  subscription: { suspended: boolean; endDate: Date },
  now: Date,
  expiringThresholdDays: number,
): SubscriptionStatusClassification {
  if (subscription.suspended) return null
  const daysLeft = Math.ceil((subscription.endDate.getTime() - now.getTime()) / MS_PER_DAY)
  if (subscription.endDate <= now) return { status: 'expired', daysLeft }
  if (daysLeft <= expiringThresholdDays) return { status: 'expiring', daysLeft }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/classify-subscription-status.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add server/statistics/domain/classify-subscription-status.ts server/statistics/domain/classify-subscription-status.test.ts
git commit -m "feat: add classifySubscriptionStatus pure function"
```

---

### Task 4: `mergeActivityFeed`

**Files:**
- Create: `server/statistics/domain/merge-activity-feed.ts`
- Test: `server/statistics/domain/merge-activity-feed.test.ts`

**Interfaces:**
- Consumes: `PLAN_CATALOG` (Task 1) from `server/memberships/domain/plan-catalog.ts`; `PlanId` from `server/memberships/domain/entities.ts`; `ActivityItem` from Task 2's `entities.ts`.
- Produces: `ActivityFeedSources`, `mergeActivityFeed(sources: ActivityFeedSources, limit: number): ActivityItem[]` (used by Task 10's service).

- [ ] **Step 1: Write the failing tests**

```ts
// server/statistics/domain/merge-activity-feed.test.ts
import { describe, expect, it } from 'vitest'
import { mergeActivityFeed, type ActivityFeedSources } from './merge-activity-feed'

const EMPTY: ActivityFeedSources = { subscriptionEvents: [], sessionEvents: [], signupEvents: [], expirationEvents: [] }

describe('mergeActivityFeed', () => {
  it('labels a first-ever subscription as payment, with plan label and amount in detail', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        subscriptionEvents: [
          { id: 's1', clientId: 'c1', clientName: 'Yasmine Kaddour', planId: 'QUARTERLY', amountPaid: 105, createdAt: new Date('2026-07-22T10:00:00Z'), isFirstForClient: true },
        ],
      },
      20,
    )
    expect(result).toEqual([
      { id: 's1', type: 'payment', clientId: 'c1', name: 'Yasmine Kaddour', detail: 'Trimestriel · 105 €', occurredAt: new Date('2026-07-22T10:00:00Z') },
    ])
  })

  it('labels a later subscription for the same client as renewal', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        subscriptionEvents: [
          { id: 's2', clientId: 'c1', clientName: 'Karim Benali', planId: 'ANNUAL', amountPaid: 350, createdAt: new Date('2026-07-22T10:00:00Z'), isFirstForClient: false },
        ],
      },
      20,
    )
    expect(result[0]).toMatchObject({ type: 'renewal', detail: 'Annuel · 350 €' })
  })

  it('distinguishes a subscriber session from a visitor session', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        sessionEvents: [
          { id: 'sess1', clientId: 'c1', name: 'Marc Delaunay', type: 'SUBSCRIBER', checkedInAt: new Date('2026-07-22T09:00:00Z') },
          { id: 'sess2', clientId: null, name: 'Nadia Ferrand', type: 'VISITOR', checkedInAt: new Date('2026-07-22T08:00:00Z') },
        ],
      },
      20,
    )
    expect(result).toEqual([
      { id: 'sess1', type: 'session', clientId: 'c1', name: 'Marc Delaunay', detail: 'Séance validée', occurredAt: new Date('2026-07-22T09:00:00Z') },
      { id: 'sess2', type: 'session', clientId: null, name: 'Nadia Ferrand', detail: 'Séance visiteur', occurredAt: new Date('2026-07-22T08:00:00Z') },
    ])
  })

  it('formats a signup event', () => {
    const result = mergeActivityFeed(
      { ...EMPTY, signupEvents: [{ id: 'c9', clientId: 'c9', name: 'Inès Fabre', createdAt: new Date('2026-07-22T07:00:00Z') }] },
      20,
    )
    expect(result[0]).toEqual({ id: 'c9', type: 'signup', clientId: 'c9', name: 'Inès Fabre', detail: 'Nouveau membre', occurredAt: new Date('2026-07-22T07:00:00Z') })
  })

  it('formats an expiration event using endDate as occurredAt', () => {
    const result = mergeActivityFeed(
      { ...EMPTY, expirationEvents: [{ id: 'sub5', clientId: 'c5', clientName: 'Sofia Moretti', endDate: new Date('2026-07-20T00:00:00Z') }] },
      20,
    )
    expect(result[0]).toEqual({ id: 'sub5', type: 'expired', clientId: 'c5', name: 'Sofia Moretti', detail: 'À relancer', occurredAt: new Date('2026-07-20T00:00:00Z') })
  })

  it('merges all 4 sources sorted by occurredAt descending, most recent first', () => {
    const result = mergeActivityFeed(
      {
        subscriptionEvents: [{ id: 's1', clientId: 'c1', clientName: 'A', planId: 'MONTHLY', amountPaid: 40, createdAt: new Date('2026-07-22T08:00:00Z'), isFirstForClient: true }],
        sessionEvents: [{ id: 'sess1', clientId: 'c2', name: 'B', type: 'SUBSCRIBER', checkedInAt: new Date('2026-07-22T12:00:00Z') }],
        signupEvents: [{ id: 'c3', clientId: 'c3', name: 'C', createdAt: new Date('2026-07-22T06:00:00Z') }],
        expirationEvents: [{ id: 'sub4', clientId: 'c4', clientName: 'D', endDate: new Date('2026-07-22T10:00:00Z') }],
      },
      20,
    )
    expect(result.map((item) => item.id)).toEqual(['sess1', 'sub4', 's1', 'c3'])
  })

  it('truncates to the given limit after sorting', () => {
    const result = mergeActivityFeed(
      {
        ...EMPTY,
        signupEvents: [
          { id: 'a', clientId: 'a', name: 'A', createdAt: new Date('2026-07-22T10:00:00Z') },
          { id: 'b', clientId: 'b', name: 'B', createdAt: new Date('2026-07-22T09:00:00Z') },
          { id: 'c', clientId: 'c', name: 'C', createdAt: new Date('2026-07-22T08:00:00Z') },
        ],
      },
      2,
    )
    expect(result.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/merge-activity-feed.test.ts`
Expected: FAIL — file does not exist yet.

- [ ] **Step 3: Implement**

```ts
// server/statistics/domain/merge-activity-feed.ts
import { PLAN_CATALOG } from '../../memberships/domain/plan-catalog'
import type { PlanId, SessionType } from '../../memberships/domain/entities'
import type { ActivityItem } from './entities'

export type ActivityFeedSources = {
  subscriptionEvents: { id: string; clientId: string; clientName: string; planId: PlanId; amountPaid: number; createdAt: Date; isFirstForClient: boolean }[]
  sessionEvents: { id: string; clientId: string | null; name: string; type: SessionType; checkedInAt: Date }[]
  signupEvents: { id: string; clientId: string; name: string; createdAt: Date }[]
  expirationEvents: { id: string; clientId: string; clientName: string; endDate: Date }[]
}

/** Merges the 4 activity sources into one feed, sorted by occurrence time descending, truncated to `limit`. */
export function mergeActivityFeed(sources: ActivityFeedSources, limit: number): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sources.subscriptionEvents.map((event) => ({
      id: event.id,
      type: (event.isFirstForClient ? 'payment' : 'renewal') as const,
      clientId: event.clientId,
      name: event.clientName,
      detail: `${PLAN_CATALOG[event.planId].label} · ${event.amountPaid} €`,
      occurredAt: event.createdAt,
    })),
    ...sources.sessionEvents.map((event) => ({
      id: event.id,
      type: 'session' as const,
      clientId: event.clientId,
      name: event.name,
      detail: event.type === 'SUBSCRIBER' ? 'Séance validée' : 'Séance visiteur',
      occurredAt: event.checkedInAt,
    })),
    ...sources.signupEvents.map((event) => ({
      id: event.id,
      type: 'signup' as const,
      clientId: event.clientId,
      name: event.name,
      detail: 'Nouveau membre',
      occurredAt: event.createdAt,
    })),
    ...sources.expirationEvents.map((event) => ({
      id: event.id,
      type: 'expired' as const,
      clientId: event.clientId,
      name: event.clientName,
      detail: 'À relancer',
      occurredAt: event.endDate,
    })),
  ]

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  return items.slice(0, limit)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/domain/merge-activity-feed.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add server/statistics/domain/merge-activity-feed.ts server/statistics/domain/merge-activity-feed.test.ts
git commit -m "feat: add mergeActivityFeed pure function"
```

---

### Task 5: `StatisticsRepository` interface

**Files:**
- Create: `server/statistics/repositories/statistics.repository.ts`

**Interfaces:**
- Consumes: `PlanId`, `SessionType` from `server/memberships/domain/entities.ts`.
- Produces: `RawSubscriptionEvent`, `RawSessionEvent`, `RawSignupEvent`, `RawExpirationEvent`, `RawExpiringCandidate`, `RawTopMember`, `StatisticsRepository` interface — all consumed by Tasks 6-8 (Prisma implementation) and Task 10 (service).

No test for this task — a pure interface declaration, nothing to run. Verified by Task 6 implementing it (tsc fails to compile an incomplete implementation).

- [ ] **Step 1: Create the file**

```ts
// server/statistics/repositories/statistics.repository.ts
import type { PlanId, SessionType } from '../../memberships/domain/entities'

export type RawSubscriptionEvent = {
  id: string
  clientId: string
  clientName: string
  planId: PlanId
  amountPaid: number
  createdAt: Date
  /** True if this is the earliest subscription ever created for this client (no earlier row exists). */
  isFirstForClient: boolean
}

export type RawSessionEvent = {
  id: string
  clientId: string | null
  /** Client name for a SUBSCRIBER session, visitorName for a VISITOR session. */
  name: string
  type: SessionType
  checkedInAt: Date
}

export type RawSignupEvent = {
  id: string
  clientId: string
  name: string
  createdAt: Date
}

export type RawExpirationEvent = {
  id: string
  clientId: string
  clientName: string
  endDate: Date
}

export type RawExpiringCandidate = {
  clientId: string
  clientName: string
  planId: PlanId
  suspended: boolean
  endDate: Date
  lastVisitAt: Date | null
}

export type RawTopMember = {
  clientId: string
  clientName: string
  planId: PlanId
  sessionsCount: number
}

export interface StatisticsRepository {
  /** Sum of Subscription.amountPaid (createdAt in range) + Session.amountPaid (checkedInAt in range). `end` exclusive. */
  getRevenueForPeriod(start: Date, end: Date): Promise<number>
  /** Distinct clients with a subscription spanning `asOf` (startDate <= asOf <= endDate). Suspension ignored — no suspension history exists to check retroactively. */
  countActiveClientsAsOf(asOf: Date): Promise<number>
  /** Sessions (subscriber + visitor) checked in within [start, end). */
  countSessionsForPeriod(start: Date, end: Date): Promise<number>
  /** Distinct clients whose latest-started subscription (by endDate, among subscriptions with startDate <= asOf) has already ended by `asOf`. */
  countExpiredSubscriptionsAsOf(asOf: Date): Promise<number>
  /** Count of currently-active (spanning `asOf`) subscriptions grouped by planId. A client with two simultaneously-overlapping active subscriptions of different plans (permitted by design) counts under both — an accepted rare-case approximation. */
  getPlanDistribution(asOf: Date): Promise<{ planId: PlanId; count: number }[]>
  /** The `limit` most recently created subscriptions with createdAt >= `since`, newest first. */
  getRecentSubscriptionEvents(since: Date, limit: number): Promise<RawSubscriptionEvent[]>
  /** The `limit` most recent sessions with checkedInAt >= `since`, newest first. */
  getRecentSessionEvents(since: Date, limit: number): Promise<RawSessionEvent[]>
  /** The `limit` most recently joined clients with joinedAt >= `since`, newest first. */
  getRecentSignupEvents(since: Date, limit: number): Promise<RawSignupEvent[]>
  /** The `limit` most recently expired subscriptions (since <= endDate <= now), most-recently-expired first. */
  getRecentExpirationEvents(since: Date, now: Date, limit: number): Promise<RawExpirationEvent[]>
  /** Each client's latest-started subscription (startDate <= now), one row per client — unfiltered, for the caller to classify via classifySubscriptionStatus. */
  getLatestStartedSubscriptionPerClient(now: Date): Promise<RawExpiringCandidate[]>
  /** Clients ranked by SUBSCRIBER session count with checkedInAt >= `since`, descending, top `limit`. Visitor sessions are not attributable to a client and are excluded. */
  getTopMembersBySessionCount(since: Date, limit: number): Promise<RawTopMember[]>
}
```

- [ ] **Step 2: Commit**

```bash
git add server/statistics/repositories/statistics.repository.ts
git commit -m "feat: add StatisticsRepository interface"
```

---

### Task 6: `PrismaStatisticsRepository` — KPI and plan distribution methods

**Files:**
- Create: `server/statistics/infrastructure/prisma-statistics.repository.ts`
- Test: `server/statistics/infrastructure/prisma-statistics.repository.test.ts`

**Interfaces:**
- Consumes: `StatisticsRepository`, `RawExpirationEvent`, `RawExpiringCandidate`, `RawSessionEvent`, `RawSignupEvent`, `RawSubscriptionEvent`, `RawTopMember` (Task 5). `PLAN_IDS`, `PlanId` from `server/memberships/domain/entities.ts`. `validateEnum` from `server/memberships/infrastructure/validate-enum.ts`. Test helpers: `prismaClient` (`server/shared/prisma-client.ts`), `cleanClientsTable` (`server/clients/infrastructure/test-helpers/clean-clients-table.ts`), `cleanMembershipsTables` (`server/memberships/infrastructure/test-helpers/clean-memberships-tables.ts`), `createTestClient` (`server/memberships/infrastructure/test-helpers/create-test-client.ts`).
- Produces: `PrismaStatisticsRepository` class (implements 4 of the 10 interface methods in this task — the remaining 6 are added by Tasks 7-8 in the same file). This class does not fully satisfy `StatisticsRepository` until Task 8 — the class declares `implements StatisticsRepository` from this task onward, so `tsc` will show missing-method errors until Task 8 completes; this is expected and resolves itself, not a regression to fix now.

- [ ] **Step 1: Write the failing tests**

```ts
// server/statistics/infrastructure/prisma-statistics.repository.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { cleanMembershipsTables } from '../../memberships/infrastructure/test-helpers/clean-memberships-tables'
import { createTestClient } from '../../memberships/infrastructure/test-helpers/create-test-client'
import { PrismaStatisticsRepository } from './prisma-statistics.repository'

const repository = new PrismaStatisticsRepository(prismaClient)

beforeEach(async () => {
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('PrismaStatisticsRepository.getRevenueForPeriod', () => {
  it('sums subscription and session amounts within [start, end), excluding rows outside the range', async () => {
    const clientId = await createTestClient('+33600003001')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH', createdAt: new Date('2026-07-10') },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'), amountPaid: 999, paymentMethod: 'CASH', createdAt: new Date('2026-06-10') },
    })
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'V', visitorPhone: '+33600000000', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-15') },
    })
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'V', visitorPhone: '+33600000001', amountPaid: 999, paymentMethod: 'CASH', checkedInAt: new Date('2026-06-15') },
    })

    const total = await repository.getRevenueForPeriod(new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))

    expect(total).toBe(48)
  })

  it('returns 0 when nothing falls in the period', async () => {
    const total = await repository.getRevenueForPeriod(new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))
    expect(total).toBe(0)
  })
})

describe('PrismaStatisticsRepository.countActiveClientsAsOf', () => {
  it('counts a client with a subscription spanning asOf, excludes not-yet-started and already-expired', async () => {
    const activeClient = await createTestClient('+33600003002')
    const futureClient = await createTestClient('+33600003003')
    const expiredClient = await createTestClient('+33600003004')
    const asOf = new Date('2026-07-22T12:00:00Z')

    await prismaClient.subscription.create({
      data: { clientId: activeClient, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId: futureClient, planId: 'MONTHLY', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId: expiredClient, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const count = await repository.countActiveClientsAsOf(asOf)

    expect(count).toBe(1)
  })

  it('counts a client only once even with two overlapping active subscriptions', async () => {
    const clientId = await createTestClient('+33600003005')
    const asOf = new Date('2026-07-22T12:00:00Z')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'QUARTERLY', startDate: new Date('2026-07-10'), endDate: new Date('2026-10-10'), amountPaid: 105, paymentMethod: 'CASH' },
    })

    const count = await repository.countActiveClientsAsOf(asOf)

    expect(count).toBe(1)
  })
})

describe('PrismaStatisticsRepository.countSessionsForPeriod', () => {
  it('counts sessions with checkedInAt in [start, end), start inclusive end exclusive', async () => {
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'A', visitorPhone: '+33600000010', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-22T00:00:00Z') },
    })
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'B', visitorPhone: '+33600000011', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-22T23:59:59Z') },
    })
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'C', visitorPhone: '+33600000012', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-23T00:00:00Z') },
    })

    const count = await repository.countSessionsForPeriod(new Date('2026-07-22T00:00:00Z'), new Date('2026-07-23T00:00:00Z'))

    expect(count).toBe(2)
  })
})

describe('PrismaStatisticsRepository.countExpiredSubscriptionsAsOf', () => {
  it('counts a client whose only subscription has expired', async () => {
    const clientId = await createTestClient('+33600003006')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const count = await repository.countExpiredSubscriptionsAsOf(new Date('2026-07-22T12:00:00Z'))

    expect(count).toBe(1)
  })

  it('does not count a client whose old expired subscription was since renewed (latest-started is active)', async () => {
    const clientId = await createTestClient('+33600003007')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const count = await repository.countExpiredSubscriptionsAsOf(new Date('2026-07-22T12:00:00Z'))

    expect(count).toBe(0)
  })

  it('counts a client whose latest-started subscription is expired even though a future not-yet-started renewal exists', async () => {
    const clientId = await createTestClient('+33600003008')
    const asOf = new Date('2026-07-22T12:00:00Z')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const count = await repository.countExpiredSubscriptionsAsOf(asOf)

    expect(count).toBe(1)
  })

  it('does not count a client with a currently active subscription', async () => {
    const clientId = await createTestClient('+33600003009')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const count = await repository.countExpiredSubscriptionsAsOf(new Date('2026-07-22T12:00:00Z'))

    expect(count).toBe(0)
  })
})

describe('PrismaStatisticsRepository.getPlanDistribution', () => {
  it('groups currently-active subscriptions by planId, excluding not-yet-started and expired', async () => {
    const c1 = await createTestClient('+33600003010')
    const c2 = await createTestClient('+33600003011')
    const c3 = await createTestClient('+33600003012')
    const asOf = new Date('2026-07-22T12:00:00Z')

    await prismaClient.subscription.create({ data: { clientId: c1, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' } })
    await prismaClient.subscription.create({ data: { clientId: c2, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' } })
    await prismaClient.subscription.create({ data: { clientId: c3, planId: 'ANNUAL', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), amountPaid: 350, paymentMethod: 'CASH' } })
    await prismaClient.subscription.create({ data: { clientId: c3, planId: 'QUARTERLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 105, paymentMethod: 'CASH' } })

    const result = await repository.getPlanDistribution(asOf)

    expect(result).toEqual(
      expect.arrayContaining([
        { planId: 'MONTHLY', count: 2 },
        { planId: 'ANNUAL', count: 1 },
      ]),
    )
    expect(result.find((row) => row.planId === 'QUARTERLY')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: FAIL — `prisma-statistics.repository.ts` does not exist yet.

- [ ] **Step 3: Implement (this file grows further in Tasks 7-8)**

```ts
// server/statistics/infrastructure/prisma-statistics.repository.ts
import type { PrismaClient as PrismaClientType } from '../../../lib/generated/prisma/client'
import { PLAN_IDS, type PlanId } from '../../memberships/domain/entities'
import { validateEnum } from '../../memberships/infrastructure/validate-enum'
import type { StatisticsRepository } from '../repositories/statistics.repository'

export class PrismaStatisticsRepository implements StatisticsRepository {
  constructor(private readonly prisma: PrismaClientType) {}

  async getRevenueForPeriod(start: Date, end: Date): Promise<number> {
    const [subscriptionSum, sessionSum] = await Promise.all([
      this.prisma.subscription.aggregate({ where: { createdAt: { gte: start, lt: end } }, _sum: { amountPaid: true } }),
      this.prisma.session.aggregate({ where: { checkedInAt: { gte: start, lt: end } }, _sum: { amountPaid: true } }),
    ])
    return (subscriptionSum._sum.amountPaid ?? 0) + (sessionSum._sum.amountPaid ?? 0)
  }

  async countActiveClientsAsOf(asOf: Date): Promise<number> {
    const rows = await this.prisma.subscription.findMany({
      where: { startDate: { lte: asOf }, endDate: { gte: asOf } },
      select: { clientId: true },
      distinct: ['clientId'],
    })
    return rows.length
  }

  async countSessionsForPeriod(start: Date, end: Date): Promise<number> {
    return this.prisma.session.count({ where: { checkedInAt: { gte: start, lt: end } } })
  }

  async countExpiredSubscriptionsAsOf(asOf: Date): Promise<number> {
    // Distinct clients whose latest-started subscription (by endDate, among subscriptions that had
    // already started by `asOf`) has itself already ended — NOT a count of every expired subscription
    // row ever (that would double-count a client who renewed after an earlier subscription lapsed).
    const latestStartedPerClient = await this.prisma.subscription.groupBy({
      by: ['clientId'],
      where: { startDate: { lte: asOf } },
      _max: { endDate: true },
    })
    return latestStartedPerClient.filter((row) => row._max.endDate !== null && row._max.endDate <= asOf).length
  }

  async getPlanDistribution(asOf: Date): Promise<{ planId: PlanId; count: number }[]> {
    const grouped = await this.prisma.subscription.groupBy({
      by: ['planId'],
      where: { startDate: { lte: asOf }, endDate: { gte: asOf } },
      _count: { _all: true },
    })
    return grouped.map((row) => ({ planId: validateEnum(row.planId, PLAN_IDS, 'Subscription.planId'), count: row._count._all }))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: PASS (9/9). `tsc --noEmit` will still show missing-method errors on this class until Task 8 — expected, do not attempt to silence it in this task.

- [ ] **Step 5: Commit**

```bash
git add server/statistics/infrastructure/prisma-statistics.repository.ts server/statistics/infrastructure/prisma-statistics.repository.test.ts
git commit -m "feat: add PrismaStatisticsRepository KPI and plan distribution methods"
```

---

### Task 7: `PrismaStatisticsRepository` — activity source methods

**Files:**
- Modify: `server/statistics/infrastructure/prisma-statistics.repository.ts` (add 4 methods to the class from Task 6)
- Modify: `server/statistics/infrastructure/prisma-statistics.repository.test.ts` (append test suites)

**Interfaces:**
- Consumes: same as Task 6, plus `SESSION_TYPES` from `server/memberships/domain/entities.ts`.
- Produces: adds `getRecentSubscriptionEvents`, `getRecentSessionEvents`, `getRecentSignupEvents`, `getRecentExpirationEvents` to `PrismaStatisticsRepository`.

- [ ] **Step 1: Append the failing tests**

Append to `server/statistics/infrastructure/prisma-statistics.repository.test.ts`:

```ts
describe('PrismaStatisticsRepository.getRecentSubscriptionEvents', () => {
  it('marks the first subscription for a client as isFirstForClient, later ones as not', async () => {
    const clientId = await createTestClient('+33600003020')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'), amountPaid: 40, paymentMethod: 'CASH', createdAt: new Date('2026-06-01T10:00:00Z') },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH', createdAt: new Date('2026-07-01T10:00:00Z') },
    })

    const events = await repository.getRecentSubscriptionEvents(new Date('2026-01-01'), 20)

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ isFirstForClient: false, createdAt: new Date('2026-07-01T10:00:00Z') })
    expect(events[1]).toMatchObject({ isFirstForClient: true, createdAt: new Date('2026-06-01T10:00:00Z') })
  })

  it('excludes subscriptions created before `since` and respects `limit`', async () => {
    const clientId = await createTestClient('+33600003021')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH', createdAt: new Date('2026-05-01T10:00:00Z') },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH', createdAt: new Date('2026-07-01T10:00:00Z') },
    })

    const events = await repository.getRecentSubscriptionEvents(new Date('2026-06-01'), 20)

    expect(events).toHaveLength(1)
    expect(events[0].createdAt).toEqual(new Date('2026-07-01T10:00:00Z'))
  })
})

describe('PrismaStatisticsRepository.getRecentSessionEvents', () => {
  it('resolves the client name for a SUBSCRIBER session and the visitor name for a VISITOR session', async () => {
    const clientId = await createTestClient('+33600003022')
    await prismaClient.session.create({
      data: { type: 'SUBSCRIBER', clientId, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-22T09:00:00Z') },
    })
    await prismaClient.session.create({
      data: { type: 'VISITOR', visitorName: 'Nadia Ferrand', visitorPhone: '+33698765432', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-22T08:00:00Z') },
    })

    const events = await repository.getRecentSessionEvents(new Date('2026-01-01'), 20)

    expect(events).toEqual([
      expect.objectContaining({ clientId, type: 'SUBSCRIBER', name: 'Test Client' }),
      expect.objectContaining({ clientId: null, type: 'VISITOR', name: 'Nadia Ferrand' }),
    ])
  })
})

describe('PrismaStatisticsRepository.getRecentSignupEvents', () => {
  it('returns recently joined clients ordered by joinedAt descending', async () => {
    await prismaClient.client.create({ data: { name: 'Older Client', phone: '+33600003023', joinedAt: new Date('2026-07-01T00:00:00Z') } })
    await prismaClient.client.create({ data: { name: 'Newer Client', phone: '+33600003024', joinedAt: new Date('2026-07-20T00:00:00Z') } })

    const events = await repository.getRecentSignupEvents(new Date('2026-01-01'), 20)

    expect(events.map((event) => event.name)).toEqual(['Newer Client', 'Older Client'])
  })
})

describe('PrismaStatisticsRepository.getRecentExpirationEvents', () => {
  it('returns subscriptions whose endDate falls within [since, now], most-recently-expired first', async () => {
    const clientId = await createTestClient('+33600003025')
    const now = new Date('2026-07-22T12:00:00Z')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-06-15'), endDate: new Date('2026-07-15'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-31'), amountPaid: 40, paymentMethod: 'CASH' },
    })

    const events = await repository.getRecentExpirationEvents(new Date('2026-06-01'), now, 20)

    expect(events.map((event) => event.endDate)).toEqual([new Date('2026-07-15')])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: FAIL — the 4 new methods don't exist on the class yet.

- [ ] **Step 3: Add the 4 methods**

Add these imports to the top of `server/statistics/infrastructure/prisma-statistics.repository.ts` (alongside the existing ones):

```ts
import { PLAN_IDS, SESSION_TYPES, type PlanId } from '../../memberships/domain/entities'
import type {
  RawExpirationEvent,
  RawSessionEvent,
  RawSignupEvent,
  RawSubscriptionEvent,
  StatisticsRepository,
} from '../repositories/statistics.repository'
```

Add these methods inside the `PrismaStatisticsRepository` class, after `getPlanDistribution`:

```ts
  async getRecentSubscriptionEvents(since: Date, limit: number): Promise<RawSubscriptionEvent[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      include: { client: { select: { name: true } } },
    })
    if (rows.length === 0) return []

    // Second query: the earliest createdAt per client among just the clients in this batch, to
    // classify payment (first-ever) vs renewal without an N+1 query per row.
    const clientIds = [...new Set(rows.map((row) => row.clientId))]
    const earliestPerClient = await this.prisma.subscription.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _min: { createdAt: true },
    })
    const earliestMap = new Map(earliestPerClient.map((row) => [row.clientId, row._min.createdAt]))

    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.client.name,
      planId: validateEnum(row.planId, PLAN_IDS, 'Subscription.planId'),
      amountPaid: row.amountPaid,
      createdAt: row.createdAt,
      isFirstForClient: earliestMap.get(row.clientId)?.getTime() === row.createdAt.getTime(),
    }))
  }

  async getRecentSessionEvents(since: Date, limit: number): Promise<RawSessionEvent[]> {
    const rows = await this.prisma.session.findMany({
      where: { checkedInAt: { gte: since } },
      orderBy: [{ checkedInAt: 'desc' }, { id: 'asc' }],
      take: limit,
      include: { client: { select: { name: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      // The sessions_type_consistency_check DB constraint guarantees exactly one of these is set —
      // the `?? ''` fallback is unreachable in practice, not a real "missing name" case.
      name: row.client?.name ?? row.visitorName ?? '',
      type: validateEnum(row.type, SESSION_TYPES, 'Session.type'),
      checkedInAt: row.checkedInAt,
    }))
  }

  async getRecentSignupEvents(since: Date, limit: number): Promise<RawSignupEvent[]> {
    const rows = await this.prisma.client.findMany({
      where: { joinedAt: { gte: since } },
      orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    })
    return rows.map((row) => ({ id: row.id, clientId: row.id, name: row.name, createdAt: row.joinedAt }))
  }

  async getRecentExpirationEvents(since: Date, now: Date, limit: number): Promise<RawExpirationEvent[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { endDate: { gte: since, lte: now } },
      orderBy: [{ endDate: 'desc' }, { id: 'asc' }],
      take: limit,
      include: { client: { select: { name: true } } },
    })
    return rows.map((row) => ({ id: row.id, clientId: row.clientId, clientName: row.client.name, endDate: row.endDate }))
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: PASS (13/13). `tsc --noEmit` still shows missing-method errors until Task 8 — expected.

- [ ] **Step 5: Commit**

```bash
git add server/statistics/infrastructure/prisma-statistics.repository.ts server/statistics/infrastructure/prisma-statistics.repository.test.ts
git commit -m "feat: add PrismaStatisticsRepository activity source methods"
```

---

### Task 8: `PrismaStatisticsRepository` — widget list methods (completes the interface)

**Files:**
- Modify: `server/statistics/infrastructure/prisma-statistics.repository.ts` (add the last 2 methods)
- Modify: `server/statistics/infrastructure/prisma-statistics.repository.test.ts` (append test suites)

**Interfaces:**
- Consumes: same as Tasks 6-7.
- Produces: adds `getLatestStartedSubscriptionPerClient`, `getTopMembersBySessionCount` — `PrismaStatisticsRepository` now fully satisfies `StatisticsRepository`.

- [ ] **Step 1: Append the failing tests**

Append to `server/statistics/infrastructure/prisma-statistics.repository.test.ts`:

```ts
describe('PrismaStatisticsRepository.getLatestStartedSubscriptionPerClient', () => {
  it('picks the latest-started subscription by endDate, skipping a not-yet-started future renewal', async () => {
    const clientId = await createTestClient('+33600003030')
    const now = new Date('2026-07-22T12:00:00Z')
    // Currently valid, already started.
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-25'), amountPaid: 40, paymentMethod: 'CASH' },
    })
    // Early renewal: later endDate, but has not started yet.
    await prismaClient.subscription.create({
      data: { clientId, planId: 'QUARTERLY', startDate: new Date('2026-07-25'), endDate: new Date('2026-10-25'), amountPaid: 105, paymentMethod: 'CASH' },
    })

    const candidates = await repository.getLatestStartedSubscriptionPerClient(now)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ clientId, planId: 'MONTHLY', endDate: new Date('2026-07-25') })
  })

  it('resolves lastVisitAt from the most recent session, and null when there are none', async () => {
    const visited = await createTestClient('+33600003031')
    const neverVisited = await createTestClient('+33600003032')
    const now = new Date('2026-07-22T12:00:00Z')
    await prismaClient.subscription.create({ data: { clientId: visited, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-25'), amountPaid: 40, paymentMethod: 'CASH' } })
    await prismaClient.subscription.create({ data: { clientId: neverVisited, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-25'), amountPaid: 40, paymentMethod: 'CASH' } })
    await prismaClient.session.create({ data: { type: 'SUBSCRIBER', clientId: visited, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-10T09:00:00Z') } })
    await prismaClient.session.create({ data: { type: 'SUBSCRIBER', clientId: visited, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-15T09:00:00Z') } })

    const candidates = await repository.getLatestStartedSubscriptionPerClient(now)

    const visitedRow = candidates.find((row) => row.clientId === visited)
    const neverVisitedRow = candidates.find((row) => row.clientId === neverVisited)
    expect(visitedRow?.lastVisitAt).toEqual(new Date('2026-07-15T09:00:00Z'))
    expect(neverVisitedRow?.lastVisitAt).toBeNull()
  })

  it('carries the suspended flag through', async () => {
    const clientId = await createTestClient('+33600003033')
    await prismaClient.subscription.create({
      data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-25'), amountPaid: 40, paymentMethod: 'CASH', suspended: true },
    })

    const candidates = await repository.getLatestStartedSubscriptionPerClient(new Date('2026-07-22T12:00:00Z'))

    expect(candidates[0].suspended).toBe(true)
  })
})

describe('PrismaStatisticsRepository.getTopMembersBySessionCount', () => {
  it('ranks clients by SUBSCRIBER session count within the window, descending, excludes visitor sessions', async () => {
    const topClient = await createTestClient('+33600003034')
    const secondClient = await createTestClient('+33600003035')
    const since = new Date('2026-06-22T00:00:00Z')

    await prismaClient.subscription.create({ data: { clientId: topClient, planId: 'ANNUAL', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), amountPaid: 350, paymentMethod: 'CASH' } })
    await prismaClient.subscription.create({ data: { clientId: secondClient, planId: 'MONTHLY', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31'), amountPaid: 40, paymentMethod: 'CASH' } })

    for (let i = 0; i < 3; i++) {
      await prismaClient.session.create({ data: { type: 'SUBSCRIBER', clientId: topClient, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date(`2026-07-1${i}T09:00:00Z`) } })
    }
    await prismaClient.session.create({ data: { type: 'SUBSCRIBER', clientId: secondClient, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-10T09:00:00Z') } })
    await prismaClient.session.create({ data: { type: 'VISITOR', visitorName: 'Someone', visitorPhone: '+33600000099', amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-07-10T09:00:00Z') } })

    const topMembers = await repository.getTopMembersBySessionCount(since, 5)

    expect(topMembers).toEqual([
      expect.objectContaining({ clientId: topClient, planId: 'ANNUAL', sessionsCount: 3 }),
      expect.objectContaining({ clientId: secondClient, planId: 'MONTHLY', sessionsCount: 1 }),
    ])
  })

  it('excludes sessions before the window', async () => {
    const clientId = await createTestClient('+33600003036')
    await prismaClient.subscription.create({ data: { clientId, planId: 'MONTHLY', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31'), amountPaid: 40, paymentMethod: 'CASH' } })
    await prismaClient.session.create({ data: { type: 'SUBSCRIBER', clientId, amountPaid: 8, paymentMethod: 'CASH', checkedInAt: new Date('2026-05-15T09:00:00Z') } })

    const topMembers = await repository.getTopMembersBySessionCount(new Date('2026-06-22T00:00:00Z'), 5)

    expect(topMembers).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: FAIL — the 2 new methods don't exist yet.

- [ ] **Step 3: Add the 2 methods**

Add these to the existing type-only imports at the top of `server/statistics/infrastructure/prisma-statistics.repository.ts`:

```ts
import type { RawExpiringCandidate, RawTopMember } from '../repositories/statistics.repository'
```

Add these methods inside the `PrismaStatisticsRepository` class, after `getRecentExpirationEvents`:

```ts
  async getLatestStartedSubscriptionPerClient(now: Date): Promise<RawExpiringCandidate[]> {
    // Fetches every started subscription and reduces to one-per-client in application code, rather
    // than a window-function raw query — this project has no raw-SQL precedent, and at this app's
    // scale (one gym's worth of clients) a single ordered scan is simple, correct, and fast enough.
    const rows = await this.prisma.subscription.findMany({
      where: { startDate: { lte: now } },
      orderBy: [{ clientId: 'asc' }, { endDate: 'desc' }, { id: 'asc' }],
      include: { client: { select: { name: true } } },
    })

    const latestPerClient = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!latestPerClient.has(row.clientId)) latestPerClient.set(row.clientId, row)
    }
    const candidates = [...latestPerClient.values()]

    const clientIds = candidates.map((row) => row.clientId)
    const lastVisitPerClient = await this.prisma.session.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds } },
      _max: { checkedInAt: true },
    })
    const lastVisitMap = new Map(lastVisitPerClient.map((row) => [row.clientId, row._max.checkedInAt]))

    return candidates.map((row) => ({
      clientId: row.clientId,
      clientName: row.client.name,
      planId: validateEnum(row.planId, PLAN_IDS, 'Subscription.planId'),
      suspended: row.suspended,
      endDate: row.endDate,
      lastVisitAt: lastVisitMap.get(row.clientId) ?? null,
    }))
  }

  async getTopMembersBySessionCount(since: Date, limit: number): Promise<RawTopMember[]> {
    const grouped = await this.prisma.session.groupBy({
      by: ['clientId'],
      where: { type: 'SUBSCRIBER', clientId: { not: null }, checkedInAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { clientId: 'desc' } },
      take: limit,
    })
    if (grouped.length === 0) return []

    const clientIds = grouped.map((row) => row.clientId as string)
    const [clients, subscriptions] = await Promise.all([
      this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }),
      this.prisma.subscription.findMany({
        where: { clientId: { in: clientIds } },
        orderBy: [{ clientId: 'asc' }, { endDate: 'desc' }, { id: 'asc' }],
      }),
    ])
    const nameMap = new Map(clients.map((client) => [client.id, client.name]))
    const planMap = new Map<string, string>()
    for (const subscription of subscriptions) {
      if (!planMap.has(subscription.clientId)) planMap.set(subscription.clientId, subscription.planId)
    }

    return grouped
      .map((row) => {
        const clientId = row.clientId as string
        const planId = planMap.get(clientId)
        // A ranked client with sessions but no subscription row shouldn't be possible (recording a
        // subscriber session requires passing checkSessionEligibility first) — skip defensively
        // rather than crash if this invariant is ever violated by future code.
        if (!planId) return null
        return {
          clientId,
          clientName: nameMap.get(clientId) ?? '',
          planId: validateEnum(planId, PLAN_IDS, 'Subscription.planId'),
          sessionsCount: row._count._all,
        }
      })
      .filter((member): member is RawTopMember => member !== null)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/infrastructure/prisma-statistics.repository.test.ts`
Expected: PASS (18/18).

Run: `node node_modules/.pnpm/typescript@*/node_modules/typescript/bin/tsc --noEmit`
Expected: clean — `PrismaStatisticsRepository` now fully implements `StatisticsRepository`.

- [ ] **Step 5: Commit**

```bash
git add server/statistics/infrastructure/prisma-statistics.repository.ts server/statistics/infrastructure/prisma-statistics.repository.test.ts
git commit -m "feat: add PrismaStatisticsRepository widget list methods"
```

---

**Checkpoint: repository-layer review.** Dispatch a fresh reviewer over Tasks 5-8 combined (the full `StatisticsRepository` interface + `PrismaStatisticsRepository` implementation) before proceeding to Task 9. Specifically verify: `countExpiredSubscriptionsAsOf` and `getLatestStartedSubscriptionPerClient` both correctly implement "latest-started subscription per client," not "latest by endDate regardless of start" — this exact class of bug (conflating the two) was a real, shipped, Important-severity bug in the memberships chantier's `checkSessionEligibility` (see `docs/superpowers/specs/2026-07-21-staff-memberships-crud-design.md` and the fix in commit `4bb9f79`); confirm the two new overlapping-subscription tests in Task 8 actually exercise this and would fail against a naive `orderBy endDate desc, take first` implementation. Also verify: no method leaks a raw Prisma error message or throws an unhandled rejection a test didn't cover; `getPlanDistribution`'s "double-counts a client with two overlapping active plans" approximation is still an accurate description of the shipped code; all `validateEnum` calls use the correct field-name string for their error message.

---

### Task 9: `StatisticsService` (orchestration)

**Files:**
- Create: `server/statistics/services/statistics.service.ts`
- Create: `server/statistics/services/default-statistics.service.ts`
- Test: `server/statistics/services/default-statistics.service.test.ts`

**Interfaces:**
- Consumes: `StatisticsRepository` and all `Raw*` types (Task 5), `DashboardStatistics`/`ExpiringSubscription` (Task 2), `deriveKpiDelta` (Task 2), `classifySubscriptionStatus` (Task 3), `mergeActivityFeed`/`ActivityFeedSources` (Task 4).
- Produces: `StatisticsService` interface with `getDashboardStatistics(now: Date): Promise<DashboardStatistics>`; `DefaultStatisticsService` implementation — consumed by Task 10's controller and container wiring.

- [ ] **Step 1: Write the failing tests**

```ts
// server/statistics/services/default-statistics.service.test.ts
import { describe, expect, it, vi } from 'vitest'
import { deriveKpiDelta } from '../domain/derive-kpi-delta'
import type {
  RawExpirationEvent,
  RawExpiringCandidate,
  RawSessionEvent,
  RawSignupEvent,
  RawSubscriptionEvent,
  RawTopMember,
  StatisticsRepository,
} from '../repositories/statistics.repository'
import { DefaultStatisticsService } from './default-statistics.service'

const NOW = new Date('2026-07-22T12:00:00.000Z')

function fakeRepository(overrides: Partial<StatisticsRepository> = {}): StatisticsRepository {
  return {
    getRevenueForPeriod: vi.fn(async () => 0),
    countActiveClientsAsOf: vi.fn(async () => 0),
    countSessionsForPeriod: vi.fn(async () => 0),
    countExpiredSubscriptionsAsOf: vi.fn(async () => 0),
    getPlanDistribution: vi.fn(async () => []),
    getRecentSubscriptionEvents: vi.fn(async (): Promise<RawSubscriptionEvent[]> => []),
    getRecentSessionEvents: vi.fn(async (): Promise<RawSessionEvent[]> => []),
    getRecentSignupEvents: vi.fn(async (): Promise<RawSignupEvent[]> => []),
    getRecentExpirationEvents: vi.fn(async (): Promise<RawExpirationEvent[]> => []),
    getLatestStartedSubscriptionPerClient: vi.fn(async (): Promise<RawExpiringCandidate[]> => []),
    getTopMembersBySessionCount: vi.fn(async (): Promise<RawTopMember[]> => []),
    ...overrides,
  }
}

describe('DefaultStatisticsService.getDashboardStatistics', () => {
  it('queries exactly 12 revenue periods ending on the current month (no separate query duplicated for the KPI)', async () => {
    const repository = fakeRepository()
    const service = new DefaultStatisticsService(repository)

    await service.getDashboardStatistics(NOW)

    expect(repository.getRevenueForPeriod).toHaveBeenCalledTimes(12)
    const lastCallArgs = vi.mocked(repository.getRevenueForPeriod).mock.calls[11]
    expect(lastCallArgs[0]).toEqual(new Date('2026-07-01T00:00:00.000Z'))
    expect(lastCallArgs[1]).toEqual(new Date('2026-08-01T00:00:00.000Z'))
  })

  it('derives the revenue KPI from the last two entries of the series rather than a separate query', async () => {
    const revenueByMonth = new Map([['2026-07', 500], ['2026-06', 400]])
    const repository = fakeRepository({
      getRevenueForPeriod: vi.fn(async (start: Date) => {
        const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
        return revenueByMonth.get(key) ?? 0
      }),
    })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.kpis.revenue).toEqual({ value: 500, ...deriveKpiDelta(500, 400) })
    expect(result.revenueSeries[result.revenueSeries.length - 1]).toEqual({ month: '2026-07', revenue: 500 })
  })

  it('queries exactly 7 attendance days ending today, and derives the sessionsToday KPI from the series', async () => {
    const sessionsByDay = new Map([['2026-07-22', 12], ['2026-07-21', 10]])
    const repository = fakeRepository({
      countSessionsForPeriod: vi.fn(async (start: Date) => {
        const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`
        return sessionsByDay.get(key) ?? 0
      }),
    })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(repository.countSessionsForPeriod).toHaveBeenCalledTimes(7)
    expect(result.kpis.sessionsToday).toEqual({ value: 12, ...deriveKpiDelta(12, 10) })
    expect(result.attendanceSeries[result.attendanceSeries.length - 1]).toEqual({ day: '2026-07-22', sessions: 12 })
  })

  it('derives activeClients and expiredSubscriptions KPIs from the asOf-today vs asOf-30-days-ago counts', async () => {
    const repository = fakeRepository({
      countActiveClientsAsOf: vi.fn(async (asOf: Date) => (asOf.getTime() === NOW.getTime() ? 500 : 480)),
      countExpiredSubscriptionsAsOf: vi.fn(async (asOf: Date) => (asOf.getTime() === NOW.getTime() ? 30 : 25)),
    })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.kpis.activeClients).toEqual({ value: 500, ...deriveKpiDelta(500, 480) })
    expect(result.kpis.expiredSubscriptions).toEqual({ value: 30, ...deriveKpiDelta(30, 25) })
  })

  it('classifies, sorts by daysLeft ascending, and caps expiringSubscriptions to 10', async () => {
    const candidates: RawExpiringCandidate[] = Array.from({ length: 12 }, (_, index) => ({
      clientId: `c${index}`,
      clientName: `Client ${index}`,
      planId: 'MONTHLY' as const,
      suspended: false,
      endDate: new Date(NOW.getTime() + (index - 6) * 24 * 60 * 60 * 1000),
      lastVisitAt: null,
    }))
    const repository = fakeRepository({ getLatestStartedSubscriptionPerClient: vi.fn(async () => candidates) })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.expiringSubscriptions).toHaveLength(10)
    expect(result.expiringSubscriptions[0].daysLeft).toBeLessThanOrEqual(result.expiringSubscriptions[1].daysLeft)
    expect(result.expiringSubscriptions.every((item) => item.daysLeft <= 7)).toBe(true)
  })

  it('excludes a suspended candidate from expiringSubscriptions', async () => {
    const candidates: RawExpiringCandidate[] = [
      { clientId: 'c1', clientName: 'Suspended', planId: 'MONTHLY', suspended: true, endDate: new Date(NOW.getTime() - 24 * 60 * 60 * 1000), lastVisitAt: null },
    ]
    const repository = fakeRepository({ getLatestStartedSubscriptionPerClient: vi.fn(async () => candidates) })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.expiringSubscriptions).toHaveLength(0)
  })

  it('merges the 4 activity sources via mergeActivityFeed', async () => {
    const repository = fakeRepository({
      getRecentSignupEvents: vi.fn(async (): Promise<RawSignupEvent[]> => [{ id: 'c1', clientId: 'c1', name: 'Inès Fabre', createdAt: NOW }]),
    })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.recentActivity).toEqual([{ id: 'c1', type: 'signup', clientId: 'c1', name: 'Inès Fabre', detail: 'Nouveau membre', occurredAt: NOW }])
  })

  it('maps top members from the raw repository shape', async () => {
    const repository = fakeRepository({
      getTopMembersBySessionCount: vi.fn(async (): Promise<RawTopMember[]> => [{ clientId: 'c1', clientName: 'Nadia Cherif', planId: 'ANNUAL', sessionsCount: 24 }]),
    })
    const service = new DefaultStatisticsService(repository)

    const result = await service.getDashboardStatistics(NOW)

    expect(result.topMembers).toEqual([{ clientId: 'c1', name: 'Nadia Cherif', planId: 'ANNUAL', sessionsCount: 24 }])
  })

  it('passes a 30-day-ago window and a limit of 5 to getTopMembersBySessionCount', async () => {
    const repository = fakeRepository()
    const service = new DefaultStatisticsService(repository)

    await service.getDashboardStatistics(NOW)

    const [since, limit] = vi.mocked(repository.getTopMembersBySessionCount).mock.calls[0]
    expect(since).toEqual(new Date('2026-06-22T12:00:00.000Z'))
    expect(limit).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/services/default-statistics.service.test.ts`
Expected: FAIL — neither file exists yet.

- [ ] **Step 3: Create the service interface**

```ts
// server/statistics/services/statistics.service.ts
import type { DashboardStatistics } from '../domain/entities'

export interface StatisticsService {
  getDashboardStatistics(now: Date): Promise<DashboardStatistics>
}
```

- [ ] **Step 4: Implement `DefaultStatisticsService`**

```ts
// server/statistics/services/default-statistics.service.ts
import { classifySubscriptionStatus } from '../domain/classify-subscription-status'
import { deriveKpiDelta } from '../domain/derive-kpi-delta'
import type { DashboardStatistics, ExpiringSubscription } from '../domain/entities'
import { mergeActivityFeed } from '../domain/merge-activity-feed'
import type { StatisticsRepository } from '../repositories/statistics.repository'
import type { StatisticsService } from './statistics.service'

const EXPIRING_THRESHOLD_DAYS = 7
const EXPIRING_LIST_LIMIT = 10
const TOP_MEMBERS_WINDOW_DAYS = 30
const TOP_MEMBERS_LIMIT = 5
const ACTIVITY_LOOKBACK_DAYS = 30
const ACTIVITY_FEED_LIMIT = 20
const REVENUE_SERIES_MONTHS = 12
const ATTENDANCE_SERIES_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export class DefaultStatisticsService implements StatisticsService {
  constructor(private readonly repository: StatisticsRepository) {}

  async getDashboardStatistics(now: Date): Promise<DashboardStatistics> {
    const thirtyDaysAgo = addDays(now, -30)
    const activityLookback = addDays(now, -ACTIVITY_LOOKBACK_DAYS)

    const [
      revenueSeries,
      attendanceSeries,
      activeClientsNow,
      activeClientsThirtyDaysAgo,
      expiredNow,
      expiredThirtyDaysAgo,
      planDistribution,
      subscriptionEvents,
      sessionEvents,
      signupEvents,
      expirationEvents,
      expiringCandidates,
      topMembersRaw,
    ] = await Promise.all([
      this.getRevenueSeries(now),
      this.getAttendanceSeries(now),
      this.repository.countActiveClientsAsOf(now),
      this.repository.countActiveClientsAsOf(thirtyDaysAgo),
      this.repository.countExpiredSubscriptionsAsOf(now),
      this.repository.countExpiredSubscriptionsAsOf(thirtyDaysAgo),
      this.repository.getPlanDistribution(now),
      this.repository.getRecentSubscriptionEvents(activityLookback, ACTIVITY_FEED_LIMIT),
      this.repository.getRecentSessionEvents(activityLookback, ACTIVITY_FEED_LIMIT),
      this.repository.getRecentSignupEvents(activityLookback, ACTIVITY_FEED_LIMIT),
      this.repository.getRecentExpirationEvents(activityLookback, now, ACTIVITY_FEED_LIMIT),
      this.repository.getLatestStartedSubscriptionPerClient(now),
      this.repository.getTopMembersBySessionCount(addDays(now, -TOP_MEMBERS_WINDOW_DAYS), TOP_MEMBERS_LIMIT),
    ])

    // Reuse the series' own last two entries for the KPIs instead of two more repository calls —
    // "this month"/"today" are already the series' last element, "last month"/"yesterday" the
    // second-to-last, by construction of getRevenueSeries/getAttendanceSeries below.
    const revenueThisMonth = revenueSeries[revenueSeries.length - 1].revenue
    const revenueLastMonth = revenueSeries[revenueSeries.length - 2].revenue
    const sessionsToday = attendanceSeries[attendanceSeries.length - 1].sessions
    const sessionsYesterday = attendanceSeries[attendanceSeries.length - 2].sessions

    const expiringSubscriptions: ExpiringSubscription[] = expiringCandidates
      .map((candidate): ExpiringSubscription | null => {
        const classification = classifySubscriptionStatus(candidate, now, EXPIRING_THRESHOLD_DAYS)
        if (!classification) return null
        return {
          clientId: candidate.clientId,
          name: candidate.clientName,
          planId: candidate.planId,
          status: classification.status,
          daysLeft: classification.daysLeft,
          lastVisitAt: candidate.lastVisitAt,
        }
      })
      .filter((item): item is ExpiringSubscription => item !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, EXPIRING_LIST_LIMIT)

    const topMembers = topMembersRaw.map((member) => ({
      clientId: member.clientId,
      name: member.clientName,
      planId: member.planId,
      sessionsCount: member.sessionsCount,
    }))

    return {
      kpis: {
        revenue: { value: revenueThisMonth, ...deriveKpiDelta(revenueThisMonth, revenueLastMonth) },
        activeClients: { value: activeClientsNow, ...deriveKpiDelta(activeClientsNow, activeClientsThirtyDaysAgo) },
        sessionsToday: { value: sessionsToday, ...deriveKpiDelta(sessionsToday, sessionsYesterday) },
        expiredSubscriptions: { value: expiredNow, ...deriveKpiDelta(expiredNow, expiredThirtyDaysAgo) },
      },
      revenueSeries,
      attendanceSeries,
      planDistribution,
      recentActivity: mergeActivityFeed({ subscriptionEvents, sessionEvents, signupEvents, expirationEvents }, ACTIVITY_FEED_LIMIT),
      expiringSubscriptions,
      topMembers,
    }
  }

  private async getRevenueSeries(now: Date): Promise<{ month: string; revenue: number }[]> {
    const thisMonthStart = startOfMonth(now)
    const months = Array.from({ length: REVENUE_SERIES_MONTHS }, (_, index) => addMonths(thisMonthStart, index - (REVENUE_SERIES_MONTHS - 1)))
    const revenues = await Promise.all(months.map((monthStart) => this.repository.getRevenueForPeriod(monthStart, addMonths(monthStart, 1))))
    return months.map((monthStart, index) => ({
      month: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
      revenue: revenues[index],
    }))
  }

  private async getAttendanceSeries(now: Date): Promise<{ day: string; sessions: number }[]> {
    const today = startOfDay(now)
    const days = Array.from({ length: ATTENDANCE_SERIES_DAYS }, (_, index) => addDays(today, index - (ATTENDANCE_SERIES_DAYS - 1)))
    const counts = await Promise.all(days.map((dayStart) => this.repository.countSessionsForPeriod(dayStart, addDays(dayStart, 1))))
    return days.map((dayStart, index) => ({
      day: `${dayStart.getUTCFullYear()}-${String(dayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(dayStart.getUTCDate()).padStart(2, '0')}`,
      sessions: counts[index],
    }))
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/services/default-statistics.service.test.ts`
Expected: PASS (9/9).

- [ ] **Step 6: Commit**

```bash
git add server/statistics/services/statistics.service.ts server/statistics/services/default-statistics.service.ts server/statistics/services/default-statistics.service.test.ts
git commit -m "feat: add DefaultStatisticsService"
```

---

### Task 10: Controller, output mapper, route, container wiring

**Files:**
- Create: `server/statistics/http/to-api-dashboard-statistics.ts`
- Create: `server/statistics/http/get-dashboard-statistics.controller.ts`
- Test: `server/statistics/http/get-dashboard-statistics.controller.test.ts`
- Create: `app/api/statistics/dashboard/route.ts`
- Modify: `server/shared/container.ts`

**Interfaces:**
- Consumes: `DashboardStatistics` (Task 2), `PlanId` (`server/memberships/domain/entities.ts`), `StatisticsService`/`DefaultStatisticsService` (Task 9), `PrismaStatisticsRepository` (Task 8), `requireStaffAuth` (`server/auth/http/require-staff-auth.ts`), `apiSuccess`/`getContainer`/`withInternalErrorHandling` (`server/shared/`).
- Produces: `GET /api/statistics/dashboard`, `Container.statisticsService`.

No dedicated test for the output mapper — following this module's own precedent (`to-api-subscription.ts`/`to-api-session.ts` have no standalone test files either), its correctness is verified indirectly through the controller test's JSON assertions below.

- [ ] **Step 1: Create the output mapper**

```ts
// server/statistics/http/to-api-dashboard-statistics.ts
import type { PlanId } from '../../memberships/domain/entities'
import type { DashboardStatistics } from '../domain/entities'

const PLAN_ID_MAP: Record<PlanId, string> = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUAL: 'biannual',
  ANNUAL: 'annual',
}

export function toApiDashboardStatistics(statistics: DashboardStatistics) {
  return {
    kpis: statistics.kpis,
    revenueSeries: statistics.revenueSeries,
    attendanceSeries: statistics.attendanceSeries,
    planDistribution: statistics.planDistribution.map((row) => ({ planId: PLAN_ID_MAP[row.planId], count: row.count })),
    recentActivity: statistics.recentActivity.map((item) => ({
      id: item.id,
      type: item.type,
      clientId: item.clientId,
      name: item.name,
      detail: item.detail,
      occurredAt: item.occurredAt,
    })),
    expiringSubscriptions: statistics.expiringSubscriptions.map((item) => ({
      clientId: item.clientId,
      name: item.name,
      planId: PLAN_ID_MAP[item.planId],
      status: item.status,
      daysLeft: item.daysLeft,
      lastVisitAt: item.lastVisitAt,
    })),
    topMembers: statistics.topMembers.map((member) => ({
      clientId: member.clientId,
      name: member.name,
      planId: PLAN_ID_MAP[member.planId],
      sessionsCount: member.sessionsCount,
    })),
  }
}
```

- [ ] **Step 2: Write the failing controller tests**

```ts
// server/statistics/http/get-dashboard-statistics.controller.test.ts
import { NextRequest } from 'next/server'
import argon2 from 'argon2'
import { beforeEach, describe, expect, it } from 'vitest'
import { prismaClient } from '../../shared/prisma-client'
import { cleanAuthTables } from '../../auth/infrastructure/test-helpers/clean-db'
import { cleanClientsTable } from '../../clients/infrastructure/test-helpers/clean-clients-table'
import { cleanMembershipsTables } from '../../memberships/infrastructure/test-helpers/clean-memberships-tables'
import { staffLoginController } from '../../auth/http/staff-login.controller'
import { getDashboardStatisticsController } from './get-dashboard-statistics.controller'

async function staffAccessTokenCookie(): Promise<string> {
  const passwordHash = await argon2.hash('agent123')
  await prismaClient.staffAccount.upsert({
    where: { email: 'agent-stats@atlas.fit' },
    update: {},
    create: { email: 'agent-stats@atlas.fit', passwordHash, name: 'Agent', role: 'AGENT' },
  })
  const req = new NextRequest('https://example.com/api/auth/staff/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'agent-stats@atlas.fit', password: 'agent123' }),
  })
  const res = await staffLoginController(req)
  const accessToken = res.cookies.get('access_token')?.value
  if (!accessToken) throw new Error('login did not set an access token cookie')
  return `access_token=${accessToken}`
}

beforeEach(async () => {
  await cleanAuthTables()
  await cleanMembershipsTables()
  await cleanClientsTable()
})

describe('getDashboardStatisticsController', () => {
  it('returns 401 when no staff session is present', async () => {
    const res = await getDashboardStatisticsController(new NextRequest('https://example.com/api/statistics/dashboard'))

    expect(res.status).toBe(401)
  })

  it('returns 200 with the full dashboard shape for any authenticated staff (read is open to all staff)', async () => {
    const cookie = await staffAccessTokenCookie()

    const res = await getDashboardStatisticsController(
      new NextRequest('https://example.com/api/statistics/dashboard', { headers: { cookie } }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.kpis.revenue).toEqual({ value: 0, deltaPercent: 0, trend: 'up' })
    expect(json.data.revenueSeries).toHaveLength(12)
    expect(json.data.attendanceSeries).toHaveLength(7)
    expect(json.data.planDistribution).toEqual([])
    expect(json.data.recentActivity).toEqual([])
    expect(json.data.expiringSubscriptions).toEqual([])
    expect(json.data.topMembers).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics/http/get-dashboard-statistics.controller.test.ts`
Expected: FAIL — controller does not exist yet.

- [ ] **Step 4: Create the controller**

```ts
// server/statistics/http/get-dashboard-statistics.controller.ts
import { NextResponse, type NextRequest } from 'next/server'
import { apiSuccess } from '../../shared/api-response'
import { getContainer } from '../../shared/container'
import { withInternalErrorHandling } from '../../shared/with-internal-error-handling'
import { requireStaffAuth } from '../../auth/http/require-staff-auth'
import { toApiDashboardStatistics } from './to-api-dashboard-statistics'

export async function getDashboardStatisticsController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireStaffAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { statisticsService } = getContainer()
    const statistics = await statisticsService.getDashboardStatistics(new Date())
    return NextResponse.json(apiSuccess(toApiDashboardStatistics(statistics)))
  })
}
```

- [ ] **Step 5: Create the route file**

```ts
// app/api/statistics/dashboard/route.ts
export { getDashboardStatisticsController as GET } from '@/server/statistics/http/get-dashboard-statistics.controller'
```

- [ ] **Step 6: Wire the container**

In `server/shared/container.ts`, add these imports near the existing `settings`-related ones:

```ts
import { PrismaStatisticsRepository } from '../statistics/infrastructure/prisma-statistics.repository'
import { DefaultStatisticsService } from '../statistics/services/default-statistics.service'
import type { StatisticsService } from '../statistics/services/statistics.service'
```

Add `statisticsService: StatisticsService` to the `Container` type (alongside the existing `settingsService: SettingsService` line).

Inside `createContainer()`, after the existing `settingsService` construction, add:

```ts
  const statisticsRepository = new PrismaStatisticsRepository(prismaClient)
  const statisticsService = new DefaultStatisticsService(statisticsRepository)
```

Add `statisticsService` to the function's final returned object (alongside the existing `settingsService`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run server/statistics`
Expected: PASS (all `server/statistics` tests, including this task's 2).

Run: `node node_modules/.pnpm/typescript@*/node_modules/typescript/bin/tsc --noEmit`
Expected: clean.

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run`
Expected: full suite passes, no regressions elsewhere (this task only adds new files plus a small additive change to `container.ts`).

- [ ] **Step 8: Commit**

```bash
git add server/statistics/http/to-api-dashboard-statistics.ts server/statistics/http/get-dashboard-statistics.controller.ts server/statistics/http/get-dashboard-statistics.controller.test.ts app/api/statistics/dashboard/route.ts server/shared/container.ts
git commit -m "feat: add GET /api/statistics/dashboard controller and wire container"
```

---

**Checkpoint: service + HTTP layer review.** Dispatch a fresh reviewer over Tasks 9-10 combined before proceeding to Task 11. Specifically verify: the `Promise.all` in `getDashboardStatistics` genuinely parallelizes all independent queries (no accidental sequential `await` chain); the revenue/attendance KPI reuse of the series' last two entries is correct and doesn't silently break if `REVENUE_SERIES_MONTHS`/`ATTENDANCE_SERIES_DAYS` were ever reduced below 2; `requireStaffAuth` runs before any service/container access in the controller (auth-first ordering, same pattern as every other controller in this codebase); the route file exports match the controller name exactly; no endpoint-specific `MembershipDomainError`-style error type was invented where the design explicitly said none was needed.

---

### Task 11: Live verification

**Files:** none (verification only, no code changes). Run directly, not delegated to a subagent — mirrors the memberships chantier's own Task 14 precedent.

**Interfaces:** exercises the full stack built by Tasks 1-10 end-to-end against a real running dev server and real Postgres.

- [ ] **Step 1: Pre-flight**

Run the full suite and `tsc` one more time before touching the live server:

Run: `node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run`
Expected: all tests pass (baseline + everything added by Tasks 1-10).

Run: `node node_modules/.pnpm/typescript@*/node_modules/typescript/bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Start the dev server and seed realistic data**

Start (or confirm already running) the Next.js dev server. Run `prisma/seed.ts` (or confirm it has already been run this session) so the dev DB has the seeded demo clients, subscriptions, and sessions this endpoint reads from — an empty DB would only prove the zero-value path, not real aggregation. If the background dev server process appears to die silently between calls (a known flakiness in this environment, hit twice during the memberships chantier's own live verification), restart it and re-poll rather than trusting a single health check.

- [ ] **Step 3: Verify auth gating**

Call `GET /api/statistics/dashboard` with no cookie. Expected: `401`.

- [ ] **Step 4: Verify the full response shape and cross-check real values**

Log in as a seeded staff account (`POST /api/auth/staff/login`), then call `GET /api/statistics/dashboard` with the resulting cookie. Confirm:
- All 7 top-level `data` fields are present (`kpis`, `revenueSeries`, `attendanceSeries`, `planDistribution`, `recentActivity`, `expiringSubscriptions`, `topMembers`).
- `revenueSeries` has exactly 12 entries, `attendanceSeries` exactly 7, both ending on the current month/day.
- `kpis.revenue.value` is a plausible sum given the seeded subscriptions/sessions created this calendar month (spot-check against a manual `SELECT SUM(...)` via psql or Prisma Studio for at least one KPI, matching this project's established "don't just trust the code, verify the actual number" practice from prior chantiers).
- `planDistribution`'s `planId` values are lowercase (`monthly`/`quarterly`/`biannual`/`annual`), matching the frontend's expected casing.
- If any seeded client has an expiring/expired subscription, it appears correctly classified in `expiringSubscriptions` with the right `status`/`daysLeft`.
- If any seeded client has subscriber sessions, they appear in `topMembers` and contribute to `recentActivity`.
- `recentActivity` items are sorted most-recent-first and every `occurredAt` is a raw ISO datetime string (not a pre-formatted relative string).

- [ ] **Step 5: Clean up**

Remove any scratch cookie files or throwaway state created purely for this verification (none of this task's steps involve writes, so no data cleanup is expected — confirm this by re-running the full test suite once more and checking `git status`/`prisma studio` show no unexpected leftover rows).

- [ ] **Step 6: Update the progress ledger**

Append a summary of this verification (what was checked, any real gaps found and how they were handled) to `.superpowers/sdd/progress-staff-statistics-dashboard.md`, following this project's established ledger format from the memberships chantier (`.superpowers/sdd/progress-staff-memberships-crud.md`).

---

## Self-Review

**Spec coverage:** every numbered item in design doc sections 2-8 maps to at least one task — approach (Task 10's single endpoint, Tasks 2-4's derived-not-stored pure functions), all 9 business definitions in section 4 (Tasks 1, 3, 4, 6, 7, 8, 9), the full API contract in section 5 field-for-field (Task 2's types + Task 10's mapper), error handling (Task 10), the full test plan (every task's own test step), and all 4 out-of-scope items (section 8) correctly have no corresponding task.

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N" language anywhere in this plan — every step has complete, runnable code.

**Type consistency:** cross-checked `StatisticsRepository`'s 11 methods (Task 5) against their Task 6-8 implementations (5 + 4 + 2 = 11, names match exactly). Cross-checked `RawSubscriptionEvent`/`RawSessionEvent`/`RawSignupEvent`/`RawExpirationEvent` (Task 5) against `ActivityFeedSources`' inline field shapes (Task 4) — structurally identical, so repository results pass into `mergeActivityFeed` without conversion. Cross-checked `ExpiringSubscription`/`TopMember`/`DashboardStatistics` (Task 2) against Task 9's assembly code and Task 10's mapper — field names match exactly end to end. Cross-checked `classifySubscriptionStatus`'s parameter shape (Task 3) against `RawExpiringCandidate` (Task 5) — the candidate object structurally satisfies it.

**One gap found and fixed during self-review:** the first draft of Task 9 queried `getRevenueForPeriod`/`countSessionsForPeriod` twice each (once for the KPI, once inside the 12-month/7-day series) — a redundant round-trip the Efficiency review angle would have flagged. Fixed by deriving `revenueThisMonth`/`revenueLastMonth`/`sessionsToday`/`sessionsYesterday` from the series' own last two entries instead, with a dedicated test (Task 9, "no separate query duplicated for the KPI") proving `getRevenueForPeriod` is called exactly 12 times, not 14.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-staff-statistics-dashboard-backend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
