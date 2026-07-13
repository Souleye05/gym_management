# Gestion Abonnements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Subscription` domain model linked to `Client`, with dynamically-computed status (`active`/`expiring`/`expired`, plus manual `suspended`), make `Client.status` a derived field instead of stored data, and build a global `/abonnements` list plus a per-client current-subscription-and-history section replacing the `/clients/[id]` "Paiements" stub — with create/renew/suspend/reactivate flows and a payment-confirmation screen.

**Architecture:** A new `lib/subscriptions/` module defines `Subscription`/`Plan`/`PaymentMethod` types, the 4 mocked plans, a pure `computeSubscriptionStatus()` function, and ~15 mocked subscription records. A `SubscriptionsProvider` (same in-memory React context pattern as `ClientsProvider`) exposes CRUD-like operations plus `getCurrentSubscription`/`getSubscriptionHistory`, both keyed off business dates (`endDate`), never `createdAt`. `Client.status` is removed from the stored `Client` type and replaced by a derived-status hook that combines `useClients()` and `useSubscriptions()`. The existing `ClientStatusBadge` gains a `suspended` entry. Both `/abonnements` (new global list) and `/clients/[id]` (current subscription + history, replacing the Paiements stub) consume the new provider through a shared `SubscriptionForm` (create/renew) and a small set of subscription-specific components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `motion`, Lucide React. No test runner is configured in this repo — verification uses `tsc --noEmit`, `next build`, and manual/HTTP checks against the dev server, consistent with prior sub-projects' plans.

## Global Constraints

- `Subscription` never stores a `status` field — it is always computed via `computeSubscriptionStatus(subscription, now)`. Only `suspended: boolean` is a manually-set field affecting status.
- `computeSubscriptionStatus` returns `'suspended'` if `subscription.suspended === true` (checked first, before any date comparison), else `'expired'` if `endDate <= now`, else `'expiring'` if `endDate` is within 7 days of `now`, else `'active'`.
- The 4 plans are hardcoded constants (`monthly`/30 days/€40, `quarterly`/90 days/€105, `biannual`/180 days/€190, `annual`/365 days/€350) — no admin editing UI in this plan.
- `ClientStatus` (`lib/clients/types.ts`) is extended to `'active' | 'expiring' | 'expired' | 'suspended' | 'none'`. `Client.status` is removed entirely from the `Client` type and from every mocked record — it becomes a value computed at render/consumption time, never stored.
- `getCurrentSubscription(clientId)` returns the subscription with the **latest `endDate`** among that client's subscriptions — never `createdAt`. `getSubscriptionHistory(clientId)` returns all of a client's subscriptions sorted by `createdAt` descending (display-only ordering, not "which is current").
- Renewal/creation start-date rule: `computeStartDate(currentSubscription, now)` — if no current subscription, `startDate = now`; otherwise `startDate = currentSubscription.endDate` if that date is still in the future, else `startDate = now`. `endDate = startDate + plan.durationDays` (in days, via `Date` arithmetic). `amountPaid = plan.price` at creation time, never modified afterward. Every creation/renewal call always appends a new `Subscription` record — no existing record is ever mutated (history is immutable).
- `suspendSubscription`/`reactivateSubscription` only toggle `suspended` on the subscription returned by `getCurrentSubscription` for that client — never on a past/superseded record.
- No admin-editable plan pricing, no PDF generation/sharing, no real push/SMS notifications, no manually-editable payment amount, no online payment, no `localStorage`/API persistence — all explicitly out of scope per the spec.
- `SubscriptionsProvider` is mounted inside the existing `(staff)` route guard (same place as `ClientsProvider`), not at the root layout.
- Follow existing conventions: `'use client'` where hooks/interactivity are used, `cn()` from `@/lib/utils` for conditional classes, named exports for non-page components, default exports for Next.js page files, French UI text throughout.
- Do not modify `lib/mock-data.ts` (dashboard mocks, which has its own unrelated `SubscriptionStatus`/`Member` types) or `lib/auth/mock-client-directory.ts` — both stay untouched and decoupled, per the spec.
- Do not modify the internal logic of `components/ui/dialog.tsx`, `components/ui/table.tsx`, `components/ui/card.tsx`, `components/ui/button.tsx`, `components/ui/badge.tsx`, or the `(staff)` route guard's redirect/loading logic in `app/(staff)/layout.tsx` — only their consumption.

---

## File Structure

```
lib/subscriptions/
  types.ts                        NEW — PlanId, Plan, SubscriptionStatus, PaymentMethod, Subscription
  plans.ts                        NEW — PLANS: Plan[] (4 hardcoded plans)
  status.ts                       NEW — computeSubscriptionStatus(), computeStartDate()
  mock-subscriptions.ts           NEW — ~15 mocked Subscription records for existing mock clients

lib/clients/
  types.ts                        MODIFY — ClientStatus gains 'suspended'; Client loses `status` field

components/providers/
  subscriptions-provider.tsx      NEW — SubscriptionsProvider, useSubscriptions()

components/clients/
  client-status-badge.tsx         MODIFY — add 'suspended' entry to STATUS_CONFIG
  use-client-status.ts            NEW — useClientStatus(clientId): ClientStatus hook combining
                                   useClients() + useSubscriptions()

components/subscriptions/
  subscription-status-badge.tsx   NEW — maps SubscriptionStatus to Badge variant + label
  plan-picker.tsx                 NEW — 4-plan selection UI, shared by create/renew flows
  subscription-form.tsx           NEW — shared create/renew form (plan + payment method)
  subscription-confirmation.tsx   NEW — post-payment confirmation content (dialog body)

app/(staff)/
  layout.tsx                      MODIFY — mount SubscriptionsProvider alongside ClientsProvider
  abonnements/
    page.tsx                      REWRITE — global list, search, status filter
  clients/
    page.tsx                      MODIFY — ClientStatusBadge now reads derived status via
                                   useClientStatus(client.id) instead of client.status
    [id]/
      page.tsx                    MODIFY — replace "Paiements" stub with current subscription +
                                   history; ClientStatusBadge reads derived status
```

---

### Task 1: Subscription types, plans, and status computation

**Files:**
- Create: `lib/subscriptions/types.ts`
- Create: `lib/subscriptions/plans.ts`
- Create: `lib/subscriptions/status.ts`

**Interfaces:**
- Produces: `export type PlanId = 'monthly' | 'quarterly' | 'biannual' | 'annual'`, `export type Plan = { id: PlanId; label: string; durationDays: number; price: number }`, `export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'suspended'`, `export type PaymentMethod = 'cash' | 'card' | 'mobile_money'`, `export type Subscription = { id: string; clientId: string; planId: PlanId; startDate: string; endDate: string; suspended: boolean; amountPaid: number; paymentMethod: PaymentMethod; createdAt: string }`
- Produces: `export const PLANS: Plan[]`
- Produces: `export function computeSubscriptionStatus(subscription: Subscription, now?: Date): SubscriptionStatus`, `export function computeStartDate(currentSubscription: Subscription | undefined, now: Date): Date`

- [ ] **Step 1: Create the subscription types**

```typescript
// lib/subscriptions/types.ts
export type PlanId = 'monthly' | 'quarterly' | 'biannual' | 'annual'

export type Plan = {
  id: PlanId
  label: string
  durationDays: number
  price: number
}

export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'suspended'

export type PaymentMethod = 'cash' | 'card' | 'mobile_money'

export type Subscription = {
  id: string
  clientId: string
  planId: PlanId
  startDate: string
  endDate: string
  suspended: boolean
  amountPaid: number
  paymentMethod: PaymentMethod
  createdAt: string
}
```

- [ ] **Step 2: Create the hardcoded plans**

```typescript
// lib/subscriptions/plans.ts
import type { Plan } from './types'

export const PLANS: Plan[] = [
  { id: 'monthly', label: 'Mensuel', durationDays: 30, price: 40 },
  { id: 'quarterly', label: 'Trimestriel', durationDays: 90, price: 105 },
  { id: 'biannual', label: 'Semestriel', durationDays: 180, price: 190 },
  { id: 'annual', label: 'Annuel', durationDays: 365, price: 350 },
]
```

- [ ] **Step 3: Create the status computation functions**

```typescript
// lib/subscriptions/status.ts
import type { Subscription, SubscriptionStatus } from './types'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function computeSubscriptionStatus(
  subscription: Subscription,
  now: Date = new Date(),
): SubscriptionStatus {
  if (subscription.suspended) return 'suspended'
  const end = new Date(subscription.endDate)
  if (end.getTime() <= now.getTime()) return 'expired'
  if (end.getTime() - now.getTime() <= SEVEN_DAYS_MS) return 'expiring'
  return 'active'
}

export function computeStartDate(
  currentSubscription: Subscription | undefined,
  now: Date,
): Date {
  if (!currentSubscription) return now
  const currentEnd = new Date(currentSubscription.endDate)
  return currentEnd.getTime() > now.getTime() ? currentEnd : now
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/subscriptions/types.ts lib/subscriptions/plans.ts lib/subscriptions/status.ts
git commit -m "feat: add subscription types, hardcoded plans, and status computation"
```

---

### Task 2: Mocked subscription data

**Files:**
- Create: `lib/subscriptions/mock-subscriptions.ts`

**Interfaces:**
- Consumes: `Subscription`, `PlanId`, `PaymentMethod` from `lib/subscriptions/types.ts` (Task 1); `Client` from `lib/clients/types.ts` (existing — read-only reference to know which client IDs exist: `cl1` through `cl18`)
- Produces: `export const mockSubscriptions: Subscription[]`

- [ ] **Step 1: Create the mocked subscriptions**

Build subscriptions for most of the 18 existing mocked clients (`cl1`–`cl18`), leaving `cl13` and `cl14` with none (they were already `status: 'none'` before this sub-project). Dates are chosen relative to a fixed reference so the mock data reads sensibly regardless of when the app is run — use dates far enough in the past/future that the `active`/`expiring`/`expired` split stays stable for a reasonable review window (the exact computed status will shift day-to-day for `expiring` records near the boundary, which is expected and fine for mock data).

```typescript
// lib/subscriptions/mock-subscriptions.ts
import type { Subscription } from './types'

function daysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export const mockSubscriptions: Subscription[] = [
  { id: 'sub1', clientId: 'cl1', planId: 'quarterly', startDate: daysFromNow(-60), endDate: daysFromNow(30), suspended: false, amountPaid: 105, paymentMethod: 'cash', createdAt: daysFromNow(-60) },
  { id: 'sub2', clientId: 'cl2', planId: 'monthly', startDate: daysFromNow(-15), endDate: daysFromNow(15), suspended: false, amountPaid: 40, paymentMethod: 'card', createdAt: daysFromNow(-15) },
  { id: 'sub3', clientId: 'cl3', planId: 'monthly', startDate: daysFromNow(-27), endDate: daysFromNow(3), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-27) },
  { id: 'sub4', clientId: 'cl4', planId: 'annual', startDate: daysFromNow(-100), endDate: daysFromNow(265), suspended: false, amountPaid: 350, paymentMethod: 'mobile_money', createdAt: daysFromNow(-100) },
  { id: 'sub5', clientId: 'cl5', planId: 'monthly', startDate: daysFromNow(-45), endDate: daysFromNow(-15), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-45) },
  { id: 'sub6', clientId: 'cl6', planId: 'quarterly', startDate: daysFromNow(-85), endDate: daysFromNow(5), suspended: false, amountPaid: 105, paymentMethod: 'card', createdAt: daysFromNow(-85) },
  { id: 'sub7', clientId: 'cl7', planId: 'monthly', startDate: daysFromNow(-28), endDate: daysFromNow(2), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-28) },
  { id: 'sub8', clientId: 'cl8', planId: 'biannual', startDate: daysFromNow(-50), endDate: daysFromNow(130), suspended: false, amountPaid: 190, paymentMethod: 'card', createdAt: daysFromNow(-50) },
  { id: 'sub9', clientId: 'cl9', planId: 'annual', startDate: daysFromNow(-200), endDate: daysFromNow(165), suspended: false, amountPaid: 350, paymentMethod: 'mobile_money', createdAt: daysFromNow(-200) },
  { id: 'sub10', clientId: 'cl10', planId: 'monthly', startDate: daysFromNow(-10), endDate: daysFromNow(20), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-10) },
  { id: 'sub11', clientId: 'cl11', planId: 'quarterly', startDate: daysFromNow(-40), endDate: daysFromNow(50), suspended: false, amountPaid: 105, paymentMethod: 'card', createdAt: daysFromNow(-40) },
  { id: 'sub12', clientId: 'cl12', planId: 'monthly', startDate: daysFromNow(-60), endDate: daysFromNow(-30), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-60) },
  { id: 'sub15', clientId: 'cl15', planId: 'biannual', startDate: daysFromNow(-70), endDate: daysFromNow(110), suspended: true, amountPaid: 190, paymentMethod: 'card', createdAt: daysFromNow(-70) },
  { id: 'sub16', clientId: 'cl16', planId: 'monthly', startDate: daysFromNow(-90), endDate: daysFromNow(-60), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-90) },
  { id: 'sub17', clientId: 'cl17', planId: 'monthly', startDate: daysFromNow(-29), endDate: daysFromNow(1), suspended: false, amountPaid: 40, paymentMethod: 'mobile_money', createdAt: daysFromNow(-29) },
  { id: 'sub18', clientId: 'cl18', planId: 'annual', startDate: daysFromNow(-150), endDate: daysFromNow(215), suspended: false, amountPaid: 350, paymentMethod: 'card', createdAt: daysFromNow(-150) },
]
```

Note: `cl13` and `cl14` intentionally have no subscription record — they will compute to `Client.status === 'none'`. `cl15` has `suspended: true` with a future `endDate`, giving one mocked example of the `suspended` status with a preserved remaining period.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/subscriptions/mock-subscriptions.ts
git commit -m "feat: add mocked subscription records for existing mock clients"
```

---

### Task 3: SubscriptionsProvider

**Files:**
- Create: `components/providers/subscriptions-provider.tsx`

**Interfaces:**
- Consumes: `Subscription`, `PlanId`, `PaymentMethod` from `lib/subscriptions/types.ts` (Task 1); `PLANS` from `lib/subscriptions/plans.ts` (Task 1); `computeStartDate` from `lib/subscriptions/status.ts` (Task 1); `mockSubscriptions` from `lib/subscriptions/mock-subscriptions.ts` (Task 2)
- Produces: `export function SubscriptionsProvider({ children }: { children: ReactNode })`, `export function useSubscriptions(): { subscriptions: Subscription[]; createSubscription(input: { clientId: string; planId: PlanId; paymentMethod: PaymentMethod }): Subscription; renewSubscription(clientId: string, input: { planId: PlanId; paymentMethod: PaymentMethod }): Subscription; suspendSubscription(subscriptionId: string): void; reactivateSubscription(subscriptionId: string): void; getCurrentSubscription(clientId: string): Subscription | undefined; getSubscriptionHistory(clientId: string): Subscription[] }`

- [ ] **Step 1: Create the provider and hook**

```typescript
// components/providers/subscriptions-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { PLANS } from '@/lib/subscriptions/plans'
import { computeStartDate } from '@/lib/subscriptions/status'
import { mockSubscriptions } from '@/lib/subscriptions/mock-subscriptions'
import type { PaymentMethod, PlanId, Subscription } from '@/lib/subscriptions/types'

type CreateOrRenewInput = {
  planId: PlanId
  paymentMethod: PaymentMethod
}

type SubscriptionsContextValue = {
  subscriptions: Subscription[]
  createSubscription(input: { clientId: string } & CreateOrRenewInput): Subscription
  renewSubscription(clientId: string, input: CreateOrRenewInput): Subscription
  suspendSubscription(subscriptionId: string): void
  reactivateSubscription(subscriptionId: string): void
  getCurrentSubscription(clientId: string): Subscription | undefined
  getSubscriptionHistory(clientId: string): Subscription[]
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | null>(null)

function findCurrentByEndDate(
  subscriptions: Subscription[],
  clientId: string,
): Subscription | undefined {
  return subscriptions
    .filter((s) => s.clientId === clientId)
    .reduce<Subscription | undefined>((latest, candidate) => {
      if (!latest) return candidate
      return new Date(candidate.endDate).getTime() > new Date(latest.endDate).getTime()
        ? candidate
        : latest
    }, undefined)
}

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => [...mockSubscriptions])

  const getCurrentSubscription = useCallback(
    (clientId: string) => findCurrentByEndDate(subscriptions, clientId),
    [subscriptions],
  )

  const getSubscriptionHistory = useCallback(
    (clientId: string) =>
      subscriptions
        .filter((s) => s.clientId === clientId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [subscriptions],
  )

  const buildSubscription = useCallback(
    (clientId: string, input: CreateOrRenewInput): Subscription => {
      const now = new Date()
      const current = findCurrentByEndDate(subscriptions, clientId)
      const start = computeStartDate(current, now)
      const plan = PLANS.find((p) => p.id === input.planId)
      if (!plan) throw new Error(`Unknown planId: ${input.planId}`)
      const end = new Date(start)
      end.setUTCDate(end.getUTCDate() + plan.durationDays)
      return {
        id: `sub${Date.now()}`,
        clientId,
        planId: input.planId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        suspended: false,
        amountPaid: plan.price,
        paymentMethod: input.paymentMethod,
        createdAt: now.toISOString(),
      }
    },
    [subscriptions],
  )

  const createSubscription = useCallback(
    (input: { clientId: string } & CreateOrRenewInput) => {
      const created = buildSubscription(input.clientId, input)
      setSubscriptions((prev) => [...prev, created])
      return created
    },
    [buildSubscription],
  )

  const renewSubscription = useCallback(
    (clientId: string, input: CreateOrRenewInput) => {
      const created = buildSubscription(clientId, input)
      setSubscriptions((prev) => [...prev, created])
      return created
    },
    [buildSubscription],
  )

  const suspendSubscription = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subscriptionId ? { ...s, suspended: true } : s)),
    )
  }, [])

  const reactivateSubscription = useCallback((subscriptionId: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === subscriptionId ? { ...s, suspended: false } : s)),
    )
  }, [])

  return (
    <SubscriptionsContext.Provider
      value={{
        subscriptions,
        createSubscription,
        renewSubscription,
        suspendSubscription,
        reactivateSubscription,
        getCurrentSubscription,
        getSubscriptionHistory,
      }}
    >
      {children}
    </SubscriptionsContext.Provider>
  )
}

export function useSubscriptions(): SubscriptionsContextValue {
  const ctx = useContext(SubscriptionsContext)
  if (!ctx) throw new Error('useSubscriptions must be used within a SubscriptionsProvider')
  return ctx
}
```

Note: `createSubscription` and `renewSubscription` share the same underlying `buildSubscription` logic — `createSubscription` takes `clientId` inside its input object (matching the spec's "create a subscription for a client with none yet" framing), while `renewSubscription` takes `clientId` as a separate first argument (matching the UI's "Renouveler" button already having a specific client in context). Both produce a new record; neither mutates an existing one.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/providers/subscriptions-provider.tsx
git commit -m "feat: add SubscriptionsProvider with in-memory CRUD and endDate-based current lookup"
```

---

### Task 4: Extend ClientStatus and remove Client.status from the stored model

**Files:**
- Modify: `lib/clients/types.ts`
- Modify: `lib/clients/mock-clients.ts`

**Interfaces:**
- Produces: `export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'` (extended); `Client` type no longer has a `status` field
- This task is a breaking change to `Client` that Tasks 5–8 depend on landing first — later tasks assume `Client` has no `status` field and that `ClientStatus` includes `'suspended'`.

- [ ] **Step 1: Update ClientStatus and remove status from Client**

Replace the full content of `lib/clients/types.ts`:

```typescript
export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email?: string
  cardNumber: string
  joinedAt: string
}
```

- [ ] **Step 2: Remove the hardcoded status field from every mocked client**

Replace the full content of `lib/clients/mock-clients.ts`:

```typescript
import type { Client } from './types'

export const mockClients: Client[] = [
  { id: 'cl1', name: 'Yasmine Kaddour', phone: '+33612345601', email: 'yasmine.kaddour@example.com', cardNumber: 'CARD-00001', joinedAt: '2025-09-12T09:00:00.000Z' },
  { id: 'cl2', name: 'Marc Delaunay', phone: '+33612345602', cardNumber: 'CARD-00002', joinedAt: '2025-10-03T09:00:00.000Z' },
  { id: 'cl3', name: 'Inès Fabre', phone: '+33612345603', email: 'ines.fabre@example.com', cardNumber: 'CARD-00003', joinedAt: '2025-11-18T09:00:00.000Z' },
  { id: 'cl4', name: 'Karim Benali', phone: '+33612345604', cardNumber: 'CARD-00004', joinedAt: '2025-08-27T09:00:00.000Z' },
  { id: 'cl5', name: 'Sofia Moretti', phone: '+33612345605', cardNumber: 'CARD-00005', joinedAt: '2025-06-14T09:00:00.000Z' },
  { id: 'cl6', name: 'Thomas Girard', phone: '+33612345606', email: 'thomas.girard@example.com', cardNumber: 'CARD-00006', joinedAt: '2025-12-01T09:00:00.000Z' },
  { id: 'cl7', name: 'Léa Rousseau', phone: '+33612345607', cardNumber: 'CARD-00007', joinedAt: '2025-11-25T09:00:00.000Z' },
  { id: 'cl8', name: 'Omar Haddad', phone: '+33612345608', cardNumber: 'CARD-00008', joinedAt: '2025-07-09T09:00:00.000Z' },
  { id: 'cl9', name: 'Nadia Cherif', phone: '+33612345609', email: 'nadia.cherif@example.com', cardNumber: 'CARD-00009', joinedAt: '2025-05-22T09:00:00.000Z' },
  { id: 'cl10', name: 'Lucas Bernard', phone: '+33612345610', cardNumber: 'CARD-00010', joinedAt: '2025-09-30T09:00:00.000Z' },
  { id: 'cl11', name: 'Amel Ziani', phone: '+33612345611', cardNumber: 'CARD-00011', joinedAt: '2025-10-15T09:00:00.000Z' },
  { id: 'cl12', name: 'Hugo Lefevre', phone: '+33612345612', email: 'hugo.lefevre@example.com', cardNumber: 'CARD-00012', joinedAt: '2025-04-11T09:00:00.000Z' },
  { id: 'cl13', name: 'Camille Dubois', phone: '+33612345613', cardNumber: 'CARD-00013', joinedAt: '2026-07-01T09:00:00.000Z' },
  { id: 'cl14', name: 'Antoine Petit', phone: '+33612345614', cardNumber: 'CARD-00014', joinedAt: '2026-07-05T09:00:00.000Z' },
  { id: 'cl15', name: 'Chloé Martin', phone: '+33612345615', email: 'chloe.martin@example.com', cardNumber: 'CARD-00015', joinedAt: '2025-08-08T09:00:00.000Z' },
  { id: 'cl16', name: 'Mehdi Alaoui', phone: '+33612345616', cardNumber: 'CARD-00016', joinedAt: '2025-03-19T09:00:00.000Z' },
  { id: 'cl17', name: 'Julie Faure', phone: '+33612345617', cardNumber: 'CARD-00017', joinedAt: '2025-12-10T09:00:00.000Z' },
  { id: 'cl18', name: 'Rayan Boumediene', phone: '+33612345618', email: 'rayan.boumediene@example.com', cardNumber: 'CARD-00018', joinedAt: '2025-09-02T09:00:00.000Z' },
]
```

- [ ] **Step 3: Confirm this breaks downstream compilation (expected at this point in the plan)**

Run: `npx tsc --noEmit`
Expected: errors in `components/clients/client-status-badge.tsx`, `components/providers/clients-provider.tsx`, `app/(staff)/clients/page.tsx`, and `app/(staff)/clients/[id]/page.tsx` — all referencing `client.status`, which no longer exists. This is expected; Tasks 5–8 fix each of these in turn. Do not attempt to fix them in this task.

- [ ] **Step 4: Commit**

```bash
git add lib/clients/types.ts lib/clients/mock-clients.ts
git commit -m "feat: extend ClientStatus with suspended and remove status from stored Client model"
```

---

### Task 5: useClientStatus hook and updated ClientStatusBadge config

**Files:**
- Create: `components/clients/use-client-status.ts`
- Modify: `components/clients/client-status-badge.tsx`

**Interfaces:**
- Consumes: `useClients()` from `@/components/providers/clients-provider` (existing, unmodified — `ClientsProvider` itself doesn't change in this plan); `useSubscriptions()` from `@/components/providers/subscriptions-provider` (Task 3); `computeSubscriptionStatus` from `@/lib/subscriptions/status` (Task 1); `ClientStatus` from `@/lib/clients/types` (Task 4, now includes `'suspended'`)
- Produces: `export function useClientStatus(clientId: string): ClientStatus`

- [ ] **Step 1: Create the derived-status hook**

```typescript
// components/clients/use-client-status.ts
'use client'

import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { ClientStatus } from '@/lib/clients/types'

export function useClientStatus(clientId: string): ClientStatus {
  const { getCurrentSubscription } = useSubscriptions()
  const current = getCurrentSubscription(clientId)
  if (!current) return 'none'
  return computeSubscriptionStatus(current)
}
```

Note: this hook does not need `useClients()` — a client's derived status only depends on its subscriptions, not on any client field. The plan's earlier mention of "combining `useClients()` + `useSubscriptions()`" in the File Structure section was about conceptual data flow (client existence + subscription lookup happen together in the pages that use this hook), not a literal dependency of this hook itself.

- [ ] **Step 2: Add the suspended entry to ClientStatusBadge**

In `components/clients/client-status-badge.tsx`, replace the `STATUS_CONFIG` object (keep the rest of the file, including imports and the `ClientStatusBadge` function, unchanged):

```typescript
const STATUS_CONFIG: Record<ClientStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  active: { label: 'Actif', variant: 'success' },
  expiring: { label: 'Expire bientôt', variant: 'warning' },
  expired: { label: 'Expiré', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'muted' },
  none: { label: 'Aucun abonnement', variant: 'muted' },
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: `client-status-badge.tsx`'s own errors are resolved. Errors remain in `components/providers/clients-provider.tsx`, `app/(staff)/clients/page.tsx`, and `app/(staff)/clients/[id]/page.tsx` — fixed in Tasks 6–8.

- [ ] **Step 4: Commit**

```bash
git add components/clients/use-client-status.ts components/clients/client-status-badge.tsx
git commit -m "feat: add useClientStatus hook and suspended badge entry"
```

---

### Task 6: Fix ClientsProvider's stale reference to Client.status

**Files:**
- Modify: `components/providers/clients-provider.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: same `useClients()` public API as before (`clients`, `addClient`, `updateClient`, `deleteClient`, `getClient`), unchanged in shape — only internal type-correctness is fixed

- [ ] **Step 1: Check whether ClientsProvider actually references `status` anywhere**

`ClientsProvider`'s `addClient` (from the prior "Gestion Clients" sub-project) set `status: 'none'` when constructing a new `Client`. Since `Client` no longer has a `status` field (Task 4), this line is now a type error (excess property). Read the current file to confirm the exact line before editing:

Read `components/providers/clients-provider.tsx` and locate the `addClient` callback's returned object literal. It currently includes a `status: 'none',` line inside the `newClient: Client = { ... }` construction.

- [ ] **Step 2: Remove the stale status field**

In `components/providers/clients-provider.tsx`, inside the `addClient` callback, remove the line `status: 'none',` from the `newClient` object literal. No other change to this file — `updateClient`'s type (`Partial<Pick<Client, 'name' | 'phone' | 'email'>>`) was never referencing `status` and needs no change; `deleteClient` and `getClient` are unaffected.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: `clients-provider.tsx`'s own errors are resolved. Errors remain in `app/(staff)/clients/page.tsx` and `app/(staff)/clients/[id]/page.tsx` — fixed in Tasks 7–8.

- [ ] **Step 4: Commit**

```bash
git add components/providers/clients-provider.tsx
git commit -m "fix: remove stale status field from ClientsProvider.addClient after Client type change"
```

---

### Task 7: SubscriptionStatusBadge, PlanPicker, SubscriptionForm, SubscriptionConfirmation

**Files:**
- Create: `components/subscriptions/subscription-status-badge.tsx`
- Create: `components/subscriptions/plan-picker.tsx`
- Create: `components/subscriptions/subscription-form.tsx`
- Create: `components/subscriptions/subscription-confirmation.tsx`

**Interfaces:**
- Consumes: `SubscriptionStatus`, `PlanId`, `PaymentMethod`, `Plan` from `@/lib/subscriptions/types` (Task 1); `PLANS` from `@/lib/subscriptions/plans` (Task 1); `Badge` from `@/components/ui/badge` (existing); `Button` from `@/components/ui/button` (existing)
- Produces: `export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus })`; `export function PlanPicker({ value, onChange }: { value: PlanId | null; onChange: (planId: PlanId) => void })`; `export function SubscriptionForm({ onSubmit, onCancel, submitLabel }: { onSubmit: (values: { planId: PlanId; paymentMethod: PaymentMethod }) => void; onCancel: () => void; submitLabel: string })`; `export function SubscriptionConfirmation({ planId, paymentMethod, startDate, endDate }: { planId: PlanId; paymentMethod: PaymentMethod; startDate: string; endDate: string })`

- [ ] **Step 1: Create SubscriptionStatusBadge**

```typescript
// components/subscriptions/subscription-status-badge.tsx
import { Badge } from '@/components/ui/badge'
import type { SubscriptionStatus } from '@/lib/subscriptions/types'

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  active: { label: 'Actif', variant: 'success' },
  expiring: { label: 'Expire bientôt', variant: 'warning' },
  expired: { label: 'Expiré', variant: 'destructive' },
  suspended: { label: 'Suspendu', variant: 'muted' },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
```

- [ ] **Step 2: Create PlanPicker**

```typescript
// components/subscriptions/plan-picker.tsx
'use client'

import { PLANS } from '@/lib/subscriptions/plans'
import type { PlanId } from '@/lib/subscriptions/types'
import { cn } from '@/lib/utils'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

export function PlanPicker({
  value,
  onChange,
}: {
  value: PlanId | null
  onChange: (planId: PlanId) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PLANS.map((plan) => (
        <button
          key={plan.id}
          type="button"
          onClick={() => onChange(plan.id)}
          className={cn(
            'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
            value === plan.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:bg-muted/50',
          )}
        >
          <span className="text-sm font-medium">{plan.label}</span>
          <span className="text-xs text-muted-foreground">{plan.durationDays} jours</span>
          <span className="text-sm font-semibold">{currency(plan.price)}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create SubscriptionForm**

```typescript
// components/subscriptions/subscription-form.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { PlanPicker } from './plan-picker'
import type { PaymentMethod, PlanId } from '@/lib/subscriptions/types'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'mobile_money', label: 'Mobile Money' },
]

export function SubscriptionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { planId: PlanId; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [planId, setPlanId] = useState<PlanId | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planId) {
      setError('Sélectionnez une formule.')
      return
    }
    setError(null)
    onSubmit({ planId, paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label>Formule</Label>
        <PlanPicker value={planId} onChange={setPlanId} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-method">Mode de paiement</Label>
        <div className="flex gap-1.5">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => setPaymentMethod(method.value)}
              className={
                paymentMethod === method.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {method.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="bg-gradient-brand text-primary-foreground">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
```

Note: `Label` is imported from `@/components/ui/input` — the existing `Input`/`Label` module from the Auth sub-project, which already exports both. This form has no `<Input>` fields, so only `Label` is imported.

- [ ] **Step 4: Create SubscriptionConfirmation**

```typescript
// components/subscriptions/subscription-confirmation.tsx
import { CheckCircle2 } from 'lucide-react'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PaymentMethod, PlanId } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SubscriptionConfirmation({
  planId,
  paymentMethod,
  startDate,
  endDate,
}: {
  planId: PlanId
  paymentMethod: PaymentMethod
  startDate: string
  endDate: string
}) {
  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return null

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{plan.label} · {currency(plan.price)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          Du {new Date(startDate).toLocaleDateString('fr-FR')} au {new Date(endDate).toLocaleDateString('fr-FR')}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors from these 4 files. Errors remain in `app/(staff)/clients/page.tsx` and `app/(staff)/clients/[id]/page.tsx` — fixed in Tasks 8.

- [ ] **Step 6: Commit**

```bash
git add components/subscriptions/subscription-status-badge.tsx components/subscriptions/plan-picker.tsx components/subscriptions/subscription-form.tsx components/subscriptions/subscription-confirmation.tsx
git commit -m "feat: add subscription status badge, plan picker, form, and confirmation components"
```

---

### Task 8: Mount SubscriptionsProvider and fix Client list page's status reference

**Files:**
- Modify: `app/(staff)/layout.tsx`
- Modify: `app/(staff)/clients/page.tsx`

**Interfaces:**
- Consumes: `SubscriptionsProvider` from `@/components/providers/subscriptions-provider` (Task 3); `useClientStatus` from `@/components/clients/use-client-status` (Task 5)

- [ ] **Step 1: Mount SubscriptionsProvider alongside ClientsProvider**

Replace the full content of `app/(staff)/layout.tsx`:

```typescript
// app/(staff)/layout.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ClientsProvider } from '@/components/providers/clients-provider'
import { SubscriptionsProvider } from '@/components/providers/subscriptions-provider'
import { useAuth } from '@/components/providers/user-provider'

function StaffGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status === 'authenticated' && session?.kind !== 'staff') {
      router.replace('/login')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.kind !== 'staff') {
    return null
  }

  return (
    <ClientsProvider>
      <SubscriptionsProvider>
        <AppShell>{children}</AppShell>
      </SubscriptionsProvider>
    </ClientsProvider>
  )
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>
}
```

Note: `SubscriptionsProvider` is nested inside `ClientsProvider` — order does not matter functionally (neither depends on the other's context value), but this keeps the diff minimal (one new wrapping element) and matches the existing nesting style from the Auth sub-project's root-layout change.

- [ ] **Step 2: Fix the client list page to use derived status**

In `app/(staff)/clients/page.tsx`, the `filtered` computation currently does `client.status === statusFilter`, which no longer compiles since `Client` has no `status` field. Replace the full content of the file:

```typescript
// app/(staff)/clients/page.tsx
'use client'

import { Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientForm } from '@/components/clients/client-form'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { useClients } from '@/components/providers/clients-provider'
import type { Client, ClientStatus } from '@/lib/clients/types'

const STATUS_FILTERS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'none', label: 'Aucun abonnement' },
]

function ClientRow({
  client,
  onClick,
}: {
  client: Client
  onClick: () => void
}) {
  const status = useClientStatus(client.id)
  return (
    <TableRow onClick={onClick}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={client.name} />
          <span className="font-medium">{client.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{client.phone}</TableCell>
      <TableCell>
        <ClientStatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(client.joinedAt).toLocaleDateString('fr-FR')}
      </TableCell>
    </TableRow>
  )
}

function useFilteredClients(clients: Client[], query: string, statusFilter: ClientStatus | 'all') {
  // Status filtering must happen per-row via useClientStatus (a hook, so it cannot be called
  // inside a plain .filter() callback). This page therefore filters by name/phone only here,
  // and applies the status filter as a second pass using a non-hook status lookup helper is not
  // possible without hooks — instead, status filtering renders all query-matched rows and hides
  // non-matching ones via a wrapper component. See StatusFilteredRow below.
  return useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) return clients
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(normalizedQuery) ||
        client.phone.toLowerCase().includes(normalizedQuery),
    )
  }, [clients, query])
}

function StatusFilteredRow({
  client,
  statusFilter,
  onClick,
}: {
  client: Client
  statusFilter: ClientStatus | 'all'
  onClick: () => void
}) {
  const status = useClientStatus(client.id)
  if (statusFilter !== 'all' && status !== statusFilter) return null
  return (
    <TableRow onClick={onClick}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={client.name} />
          <span className="font-medium">{client.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{client.phone}</TableCell>
      <TableCell>
        <ClientStatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(client.joinedAt).toLocaleDateString('fr-FR')}
      </TableCell>
    </TableRow>
  )
}

export default function ClientsPage() {
  const router = useRouter()
  const { clients, addClient } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const queryFiltered = useFilteredClients(clients, query, statusFilter)

  const handleCreate = (values: { name: string; phone: string; email?: string }) => {
    addClient(values)
    setCreateOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} client{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}.
          </p>
        </div>
        <Button
          className="bg-gradient-brand text-primary-foreground sm:w-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Ajouter un client
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom ou téléphone…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {queryFiltered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucun client trouvé.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Inscrit le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queryFiltered.map((client) => (
              <StatusFilteredRow
                key={client.id}
                client={client}
                statusFilter={statusFilter}
                onClick={() => router.push(`/clients/${client.id}`)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogHeader>
          <DialogTitle>Ajouter un client</DialogTitle>
          <DialogDescription>Créez une nouvelle fiche client.</DialogDescription>
        </DialogHeader>
        <ClientForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Créer"
        />
      </Dialog>
    </div>
  )
}
```

Note: the unused `ClientRow` helper defined above `useFilteredClients` is dead code left over from an intermediate approach — **do not include it** in the final file. Only `StatusFilteredRow`, `useFilteredClients`, and `ClientsPage` should exist in the committed file. This avoids a per-row hook being called conditionally or an unused-component lint concern. Re-read the block above: the actual file to write excludes the `ClientRow` function entirely.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: `app/(staff)/clients/page.tsx`'s own errors are resolved. Errors remain in `app/(staff)/clients/[id]/page.tsx` — fixed in Task 9. Also confirm the `ClientRow` dead-code function was excluded (grep the file for `function ClientRow` — expect no match).

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/layout.tsx" "app/(staff)/clients/page.tsx"
git commit -m "feat: mount SubscriptionsProvider and switch client list to derived status filtering"
```

---

### Task 9: Client profile page — replace Paiements stub with subscription section

**Files:**
- Modify: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `useClientStatus` from `@/components/clients/use-client-status` (Task 5); `useSubscriptions` from `@/components/providers/subscriptions-provider` (Task 3); `SubscriptionStatusBadge` from `@/components/subscriptions/subscription-status-badge` (Task 7); `SubscriptionForm` from `@/components/subscriptions/subscription-form` (Task 7); `SubscriptionConfirmation` from `@/components/subscriptions/subscription-confirmation` (Task 7); `PLANS` from `@/lib/subscriptions/plans` (Task 1); `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog` (existing)

- [ ] **Step 1: Replace the full content of the profile page**

```typescript
// app/(staff)/clients/[id]/page.tsx
'use client'

import { CalendarClock, CreditCard, Pencil, RefreshCw, Trash2, Users } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientForm } from '@/components/clients/client-form'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
import { useClientStatus } from '@/components/clients/use-client-status'
import { SubscriptionConfirmation } from '@/components/subscriptions/subscription-confirmation'
import { SubscriptionForm } from '@/components/subscriptions/subscription-form'
import { SubscriptionStatusBadge } from '@/components/subscriptions/subscription-status-badge'
import { useClients } from '@/components/providers/clients-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PaymentMethod, PlanId, Subscription } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getClient, updateClient, deleteClient } = useClients()
  const { getCurrentSubscription, getSubscriptionHistory, createSubscription, renewSubscription, suspendSubscription, reactivateSubscription } =
    useSubscriptions()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [subscriptionFormOpen, setSubscriptionFormOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Subscription | null>(null)

  const client = getClient(params.id)
  const clientStatus = useClientStatus(params.id)

  if (!client) {
    return (
      <EmptyState
        icon={Users}
        title="Client introuvable"
        description="Ce client n'existe pas ou a été supprimé."
        action={
          <Button variant="outline" onClick={() => router.push('/clients')}>
            Retour à la liste
          </Button>
        }
      />
    )
  }

  const currentSubscription = getCurrentSubscription(client.id)
  const history = getSubscriptionHistory(client.id)

  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    updateClient(client.id, values)
    setEditOpen(false)
  }

  const handleDelete = () => {
    deleteClient(client.id)
    router.push('/clients')
  }

  const handleSubscriptionSubmit = (values: { planId: PlanId; paymentMethod: PaymentMethod }) => {
    const result = currentSubscription
      ? renewSubscription(client.id, values)
      : createSubscription({ clientId: client.id, ...values })
    setSubscriptionFormOpen(false)
    setConfirmation(result)
  }

  const handleSuspend = () => {
    if (currentSubscription) suspendSubscription(currentSubscription.id)
  }

  const handleReactivate = () => {
    if (currentSubscription) reactivateSubscription(currentSubscription.id)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} className="size-14 text-base" />
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
              <p className="text-sm text-muted-foreground">{client.phone}</p>
              {client.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
              <div className="flex items-center gap-2 pt-1">
                <ClientStatusBadge status={clientStatus} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CreditCard className="size-3.5" />
                  {client.cardNumber}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Modifier
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Supprimer
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={CalendarClock}
              title="Bientôt disponible"
              description="L'historique des séances sera disponible avec la gestion des séances."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4" />
              Abonnement
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {currentSubscription ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{planLabel(currentSubscription.planId)}</span>
                  <SubscriptionStatusBadge status={clientStatus === 'none' ? 'expired' : clientStatus} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Du {new Date(currentSubscription.startDate).toLocaleDateString('fr-FR')} au{' '}
                  {new Date(currentSubscription.endDate).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currency(currentSubscription.amountPaid)} payé
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSubscriptionFormOpen(true)}>
                    <RefreshCw className="size-4" />
                    Renouveler
                  </Button>
                  {currentSubscription.suspended ? (
                    <Button size="sm" variant="outline" onClick={handleReactivate}>
                      Réactiver
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleSuspend}>
                      Suspendre
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Aucun abonnement actif.</p>
                <Button size="sm" onClick={() => setSubscriptionFormOpen(true)}>
                  Créer un abonnement
                </Button>
              </div>
            )}

            {history.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Historique
                </p>
                <ul className="flex flex-col gap-2">
                  {history.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{planLabel(s.planId)}</span>
                      <span>
                        {new Date(s.startDate).toLocaleDateString('fr-FR')} –{' '}
                        {new Date(s.endDate).toLocaleDateString('fr-FR')}
                      </span>
                      <span>{currency(s.amountPaid)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader>
          <DialogTitle>Modifier {client.name}</DialogTitle>
          <DialogDescription>Mettez à jour les informations du client.</DialogDescription>
        </DialogHeader>
        <ClientForm
          initialValues={{ name: client.name, phone: client.phone, email: client.email }}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
          submitLabel="Enregistrer"
        />
      </Dialog>

      <DeleteClientDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clientName={client.name}
        onConfirm={handleDelete}
      />

      <Dialog open={subscriptionFormOpen} onOpenChange={setSubscriptionFormOpen}>
        <DialogHeader>
          <DialogTitle>{currentSubscription ? 'Renouveler' : 'Créer'} l'abonnement</DialogTitle>
          <DialogDescription>Choisissez une formule et un mode de paiement.</DialogDescription>
        </DialogHeader>
        <SubscriptionForm
          onSubmit={handleSubscriptionSubmit}
          onCancel={() => setSubscriptionFormOpen(false)}
          submitLabel={currentSubscription ? 'Renouveler' : 'Créer'}
        />
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Paiement confirmé</DialogTitle>
        </DialogHeader>
        {confirmation && (
          <SubscriptionConfirmation
            planId={confirmation.planId}
            paymentMethod={confirmation.paymentMethod}
            startDate={confirmation.startDate}
            endDate={confirmation.endDate}
          />
        )}
      </Dialog>
    </div>
  )
}
```

Note: the line `<SubscriptionStatusBadge status={clientStatus === 'none' ? 'expired' : clientStatus} />` handles the type mismatch between `ClientStatus` (5 values, includes `'none'`) and `SubscriptionStatus` (4 values, no `'none'`) — this branch only renders when `currentSubscription` exists, so `clientStatus` is guaranteed not to be `'none'` in practice, but TypeScript cannot narrow that automatically from the `currentSubscription ? ... : ...` JSX branch alone. The `'none'` fallback to `'expired'` is dead code (unreachable given the surrounding `{currentSubscription ? (...) : (...)}` guard) purely to satisfy the type checker without an unsafe cast.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds, `/clients/[id]` still listed as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/clients/[id]/page.tsx"
git commit -m "feat: replace Paiements stub with current subscription, history, and renew/suspend actions"
```

---

### Task 10: Global /abonnements list page

**Files:**
- Modify: `app/(staff)/abonnements/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useClients()` from `@/components/providers/clients-provider` (existing); `useSubscriptions()` from `@/components/providers/subscriptions-provider` (Task 3); `useClientStatus` from `@/components/clients/use-client-status` (Task 5); `SubscriptionStatusBadge` from `@/components/subscriptions/subscription-status-badge` (Task 7); `PLANS` from `@/lib/subscriptions/plans` (Task 1); `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table` (existing); `Input` from `@/components/ui/input` (existing)

- [ ] **Step 1: Replace the stub with the global list**

```typescript
// app/(staff)/abonnements/page.tsx
'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SubscriptionStatusBadge } from '@/components/subscriptions/subscription-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { useClients } from '@/components/providers/clients-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { Client } from '@/lib/clients/types'
import type { SubscriptionStatus } from '@/lib/subscriptions/types'

const STATUS_FILTERS: { value: SubscriptionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'suspended', label: 'Suspendu' },
]

function planLabel(planId: string): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

function SubscriptionRow({
  client,
  statusFilter,
  onClick,
}: {
  client: Client
  statusFilter: SubscriptionStatus | 'all'
  onClick: () => void
}) {
  const { getCurrentSubscription } = useSubscriptions()
  const status = useClientStatus(client.id)
  const subscription = getCurrentSubscription(client.id)

  if (!subscription) return null
  if (status === 'none') return null // unreachable given the subscription check above; satisfies the type checker
  if (statusFilter !== 'all' && status !== statusFilter) return null

  return (
    <TableRow onClick={onClick}>
      <TableCell className="font-medium">{client.name}</TableCell>
      <TableCell className="text-muted-foreground">{planLabel(subscription.planId)}</TableCell>
      <TableCell>
        <SubscriptionStatusBadge status={status} />
      <TableCell className="text-muted-foreground">
        {new Date(subscription.endDate).toLocaleDateString('fr-FR')}
      </TableCell>
    </TableRow>
  )
}

export default function AbonnementsPage() {
  const router = useRouter()
  const { clients } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>('all')

  const queryFiltered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(normalizedQuery))
  }, [clients, query])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Abonnements</h1>
        <p className="text-sm text-muted-foreground">Vue d'ensemble des abonnements clients.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom de client…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Formule</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Expire le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queryFiltered.map((client) => (
            <SubscriptionRow
              key={client.id}
              client={client}
              statusFilter={statusFilter}
              onClick={() => router.push(`/clients/${client.id}`)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

Note: `SubscriptionRow` returns `null` both when a client has no subscription at all and when the status filter excludes it — this can leave the `<Table>` with zero visible rows and no "no results" message when every client is filtered out (e.g. searching a name with no active subscription, or filtering to a status nobody currently has). This is a known, accepted simplification for this task — a later polish pass could add a query-time empty-state check similar to `/clients`, but is not required by the plan's scope.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds, `/abonnements` still listed as a route.

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/abonnements/page.tsx"
git commit -m "feat: replace abonnements stub with global subscription list, search, and status filter"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds. Route list unchanged in shape from before this plan (`/abonnements` static, `/clients` static, `/clients/[id]` dynamic), no new routes added.

- [ ] **Step 3: Manual check — derived status correctness**

Run: `npm run dev` (background), log in as staff (`admin@atlas.fit` / `admin123`), then:

- Visit `/clients` → every row shows a status badge (Actif/Expire bientôt/Expiré/Suspendu/Aucun abonnement) with no crash. Compare a few rows against the mocked subscription data from Task 2 (e.g. `cl5`/Sofia Moretti should show "Expiré" since her mocked subscription's `endDate` is in the past; `cl13`/`cl14` should show "Aucun abonnement").
- Filter `/clients` by "Suspendu" → only `cl15`/Chloé Martin appears (the one mocked `suspended: true` record).
- Visit `/abonnements` → table shows one row per client that has at least one subscription record (16 of 18 mocked clients, excluding `cl13`/`cl14`), with plan label, status badge, and expiry date.
- Filter `/abonnements` by "Expiré" → only clients whose current subscription has passed its `endDate` appear.

- [ ] **Step 4: Manual check — create, renew, suspend, reactivate**

- Open `cl13`'s profile (Camille Dubois, no subscription) → "Abonnement" card shows "Aucun abonnement actif." with a "Créer un abonnement" button.
- Click it → Dialog opens with `PlanPicker` (4 plans, prices shown) and payment method chips. Submit without selecting a plan → inline error "Sélectionnez une formule.", Dialog stays open.
- Select "Mensuel", choose "Carte", submit → Dialog closes, a confirmation Dialog opens showing "Mensuel · 40 €", "Paiement : Carte", and a date range starting today.
- Close the confirmation → the profile page's "Abonnement" card now shows the new subscription, status "Actif", with "Renouveler" and "Suspendre" buttons.
- Click "Suspendre" → status badge changes to "Suspendu" immediately (no page reload), button changes to "Réactiver".
- Click "Réactiver" → status returns to "Actif" (or "Expire bientôt"/"Expiré" depending on the mocked dates), button changes back to "Suspendre".
- On a client with an existing active subscription (e.g. `cl1`/Yasmine Kaddour, `endDate` ~30 days out per Task 2's mock data), click "Renouveler", select "Annuel", submit → confirmation shows a `startDate` matching the OLD subscription's `endDate` (not today) — this is the "preserve remaining days" behavior from `computeStartDate`. Verify the date shown is NOT today's date.
- On a client with an expired subscription (e.g. `cl5`/Sofia Moretti), click "Renouveler" → confirmation shows a `startDate` of today (not the old expired `endDate`), since `computeStartDate` falls back to `now` for expired subscriptions.
- Visit `/clients/cl1` a second time (after the renewal above) → the "Historique" list under the current subscription shows 2 entries (old + new), most recent first.

- [ ] **Step 5: Manual check — client CRUD still works after the type changes**

- On `/clients`, click "Ajouter un client", create a new client with just a name and phone → succeeds, new row appears with status "Aucun abonnement" (no subscription exists for the new client yet).
- Open the new client's profile, click "Modifier", change the name, submit → name updates immediately on the profile page and in the `/clients` list.
- Delete the new client via "Supprimer" → confirmation dialog, confirm → redirected to `/clients`, client no longer listed.

- [ ] **Step 6: Stop the dev server**

Stop the background dev server process once checks pass.

- [ ] **Step 7: Commit any fixes discovered during verification**

If Steps 1–5 required fixes, stage and commit them separately with a message describing the fix. If no fixes were needed, skip this step — do not create an empty commit.

---

## Self-Review Notes

- **Spec coverage:** Subscription model + hardcoded plans + status computation (Task 1), mock data (Task 2), in-memory CRUD provider with `endDate`-based current-subscription lookup (Task 3), `ClientStatus` extended + `Client.status` removed from storage (Task 4), derived-status hook + badge update (Task 5), fix to the now-broken `ClientsProvider.addClient` (Task 6), subscription UI primitives (Task 7), provider mounting + client list migrated to derived status (Task 8), profile page's Paiements stub replaced with current subscription + history + renew/suspend/reactivate (Task 9), global `/abonnements` list (Task 10), full manual verification of every flow and edge case from the spec's "Erreurs et cas limites" section, including the `computeStartDate` remaining-days-preservation behavior explicitly called out in the user's review feedback (Task 11). All spec sections are covered.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code. Task 8 contains an explicit self-correction (the `ClientRow` dead-code note) resolved with a concrete instruction in the same task, not deferred.
- **Type consistency:** `Subscription`/`Plan`/`SubscriptionStatus`/`PaymentMethod`/`PlanId` (Task 1) used identically across `mock-subscriptions.ts` (Task 2), `SubscriptionsProvider` (Task 3), `SubscriptionStatusBadge`/`PlanPicker`/`SubscriptionForm`/`SubscriptionConfirmation` (Task 7), and both pages (Tasks 9–10). `useSubscriptions()`'s returned shape (`subscriptions`, `createSubscription`, `renewSubscription`, `suspendSubscription`, `reactivateSubscription`, `getCurrentSubscription`, `getSubscriptionHistory`) matches exactly how Tasks 5, 9, and 10 call it. `ClientStatus`'s extended union (Task 4) is consumed identically by `client-status-badge.tsx` (Task 5), `use-client-status.ts` (Task 5), and both pages. The cross-cutting breaking change to `Client` (removing `status`) is deliberately isolated to Task 4, with Tasks 5–9 each fixing exactly the downstream compile errors it introduces — verified by having each task's Step confirm the *expected remaining* error set, so an implementer mid-plan always knows whether a `tsc` error is expected-and-will-be-fixed-later or a real mistake in their own task.
