# MyProfileProvider Real Subscription/Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MyProfileProvider`'s mocked `subscription`/`subscriptionStatus`/`subscriptionHistory`/`sessionHistory` fields with the real data the backend now returns from `GET /api/client/me/profile` (already delivering real `subscription`/`subscriptionHistory`/`sessionHistory` alongside the already-real `client` field). Remove the now-dead `mockMyProfile` and the "Démo" badges on `/accueil`.

**Architecture:** `lib/client-portal/fetch-my-profile.ts` reads the 3 new response keys directly into the existing frontend `Subscription`/`SubscriberSession` types (no intermediate wire type needed — the backend's shape already matches exactly). `MyProfileProvider` builds `MyProfile` entirely from real data, computing `subscriptionStatus` explicitly (`'none'` when `subscription` is `null`). `app/(client)/accueil/page.tsx` drops its `demo` prop passes. `lib/client-portal/mock-my-profile.ts` is deleted.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), `@tanstack/react-query`. No test framework in this repo — verify with `tsc --noEmit` and manual verification via the dev server.

## Global Constraints

- **The backend contract does not change** — this plan touches ONLY frontend files (`lib/`, `components/`, `app/`). `GET /api/client/me/profile` is already shipped and stable (commits `183814f`, `cd4b63f`).
- **Response shape is exactly**: `{ success, data: { client, subscription, subscriptionHistory, sessionHistory }, message, errors }`. All 4 keys under `data` are ALWAYS present, even when empty (`null`/`[]`) — never omitted. `subscription` is `null` when the client has no subscription currently valid (not yet started OR already expired); a `suspended: true` subscription that's still within its date range is still returned (non-null). `planId`/`paymentMethod` are lowercase strings matching `lib/subscriptions/types.ts`'s unions exactly; `sessionHistory` items always have `type: 'subscriber'`; all dates are ISO strings; `sessionHistory` is capped at the 20 most recent server-side (no frontend pagination needed).
- **`MyProfile.subscription` changes from `Subscription | undefined` to `Subscription | null`** — the real API never sends `undefined` or omits the key, only `null`. Every read site must handle `null`, not `undefined`.
- **Response data maps directly onto existing frontend types** — `Subscription` (`lib/subscriptions/types.ts`) and `SubscriberSession` (`lib/sessions/types.ts`) already match the backend's shape field-for-field. Do NOT introduce a new intermediate/mirror type for these two fields (unlike `client`, which already has its own reduction via `toReducedClient()` — that pattern does not need to be repeated here).
- **`subscriptionStatus` is computed in the provider**, not supplied by the backend: `computeSubscriptionStatus(subscription)` (already exists, `lib/subscriptions/status.ts`, unchanged) when `subscription !== null`, else the literal string `'none'` (already a valid `ClientStatus` value, `lib/clients/types.ts`, already handled by `ClientStatusBadge`).
- **`lib/client-portal/mock-my-profile.ts` is deleted** once `my-profile-provider.tsx` no longer imports it — confirmed via exhaustive grep: that file's only importer is `my-profile-provider.tsx` itself.
- **The `demo` prop is removed** from all 3 call sites in `app/(client)/accueil/page.tsx` (`SubscriptionStatusSection`, both `HistoryList` calls) — `SubscriptionStatusSection`/`HistoryList` themselves are NOT modified beyond `subscription-status-section.tsx`'s prop type widening (below); their `demo?: boolean` prop stays as-is, simply no longer passed as `true`.
- **No new error-handling design** — `GET /api/client/me/profile` remains one network call; the provider's existing `status: 'error'` state (with `retry: () => query.refetch()`) already covers a failure on any of the 4 fields, exactly as it does today for `client` alone. Do not add a second error state.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (code blocks below are accurate as of plan-writing time; re-verify, since a separate backend-focused agent may land concurrent commits in this shared repo).
- French UI copy throughout, consistent with the rest of the app (no UI copy changes needed in this plan beyond the badge removal, which is a prop removal, not new text).

---

## File Structure

```
lib/client-portal/types.ts                          — MODIFY: MyProfile.subscription → Subscription | null
lib/client-portal/fetch-my-profile.ts                — MODIFY: read subscription/subscriptionHistory/sessionHistory from the response
lib/client-portal/mock-my-profile.ts                 — DELETE (Task 2, once nothing imports it)
components/providers/my-profile-provider.tsx         — MODIFY: build profile from real data, compute subscriptionStatus explicitly
app/(client)/accueil/page.tsx                        — MODIFY: remove demo props (3 call sites)
components/client-portal/subscription-status-section.tsx — MODIFY: subscription prop type → Subscription | null
```

---

## Task 1: Types and fetch layer

**Files:**
- Modify: `lib/client-portal/types.ts`
- Modify: `lib/client-portal/fetch-my-profile.ts`

**Interfaces:**
- Consumes: `Subscription` (`lib/subscriptions/types.ts`, unchanged), `SubscriberSession` (`lib/sessions/types.ts`, unchanged).
- Produces:
  ```typescript
  // lib/client-portal/types.ts
  export type MyProfile = {
    client: { name: string; phone: string; cardNumber: string }
    subscription: Subscription | null
    subscriptionStatus: ClientStatus
    subscriptionHistory: Subscription[]
    sessionHistory: SubscriberSession[]
  }

  // lib/client-portal/fetch-my-profile.ts
  export type FetchMyProfileResult =
    | {
        kind: 'found'
        client: MyProfile['client']
        subscription: Subscription | null
        subscriptionHistory: Subscription[]
        sessionHistory: SubscriberSession[]
      }
    | { kind: 'not-linked' }

  export async function fetchMyClientProfile(): Promise<FetchMyProfileResult>
  ```
  Consumed by Task 2 (`MyProfileProvider`).

- [ ] **Step 1: Update `lib/client-portal/types.ts`**

Current content (verify this matches before editing):

```typescript
import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

export type MyProfile = {
  client: {
    name: string
    phone: string
    cardNumber: string
  }
  subscription: Subscription | undefined
  subscriptionStatus: ClientStatus
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}
```

New content (only the `subscription` field's type changes):

```typescript
import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

export type MyProfile = {
  client: {
    name: string
    phone: string
    cardNumber: string
  }
  subscription: Subscription | null
  subscriptionStatus: ClientStatus
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}
```

- [ ] **Step 2: Update `lib/client-portal/fetch-my-profile.ts`**

Current content (verify this matches before editing):

```typescript
import type { MyProfile } from './types'

type RealClient = {
  id: string
  cardNumber: string
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: string
}

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

export type FetchMyProfileResult =
  | { kind: 'found'; client: MyProfile['client'] }
  | { kind: 'not-linked' }

function toReducedClient(client: RealClient): MyProfile['client'] {
  return {
    name: client.name,
    phone: client.phone,
    cardNumber: client.cardNumber,
  }
}

export async function fetchMyClientProfile(): Promise<FetchMyProfileResult> {
  const response = await fetch('/api/client/me/profile')
  const envelope: ApiEnvelope<{ client: RealClient | null }> = await response.json()

  if (!envelope.success) {
    throw new Error(envelope.message || 'Impossible de charger votre profil.')
  }

  if (envelope.data.client === null) {
    return { kind: 'not-linked' }
  }

  return { kind: 'found', client: toReducedClient(envelope.data.client) }
}
```

New content:

```typescript
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'
import type { MyProfile } from './types'

type RealClient = {
  id: string
  cardNumber: string
  name: string
  phone: string
  email: string | null
  isActive: boolean
  joinedAt: string
}

type RealProfileData = {
  client: RealClient | null
  subscription: Subscription | null
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

export type FetchMyProfileResult =
  | {
      kind: 'found'
      client: MyProfile['client']
      subscription: Subscription | null
      subscriptionHistory: Subscription[]
      sessionHistory: SubscriberSession[]
    }
  | { kind: 'not-linked' }

function toReducedClient(client: RealClient): MyProfile['client'] {
  return {
    name: client.name,
    phone: client.phone,
    cardNumber: client.cardNumber,
  }
}

export async function fetchMyClientProfile(): Promise<FetchMyProfileResult> {
  const response = await fetch('/api/client/me/profile')
  const envelope: ApiEnvelope<RealProfileData> = await response.json()

  if (!envelope.success) {
    throw new Error(envelope.message || 'Impossible de charger votre profil.')
  }

  if (envelope.data.client === null) {
    return { kind: 'not-linked' }
  }

  return {
    kind: 'found',
    client: toReducedClient(envelope.data.client),
    subscription: envelope.data.subscription,
    subscriptionHistory: envelope.data.subscriptionHistory,
    sessionHistory: envelope.data.sessionHistory,
  }
}
```

Note `subscription`/`subscriptionHistory`/`sessionHistory` are read straight off `envelope.data` with no transformation — `RealProfileData`'s shape for these 3 fields is deliberately identical to `Subscription`/`SubscriberSession`, so no reduction function like `toReducedClient` is needed for them.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in `components/providers/my-profile-provider.tsx` (still reads the old `FetchMyProfileResult['found']` shape without the 3 new fields, and still imports `mockMyProfile`) and possibly `app/(client)/accueil/page.tsx` (if it references `Subscription | undefined` anywhere) — expected, fixed in Tasks 2-3. Confirm the 2 files touched in this task themselves have zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/client-portal/types.ts lib/client-portal/fetch-my-profile.ts
git commit -m "feat: read real subscription/session history from GET /api/client/me/profile"
```

---

## Task 2: Rewrite `MyProfileProvider`, delete dead mock

**Files:**
- Modify: `components/providers/my-profile-provider.tsx`
- Delete: `lib/client-portal/mock-my-profile.ts`

**Interfaces:**
- Consumes: `fetchMyClientProfile`, `FetchMyProfileResult` (Task 1); `computeSubscriptionStatus` (`lib/subscriptions/status.ts`, unchanged); `MyProfile` (Task 1).
- Produces: `useMyProfile()`'s returned `MyProfileState` shape is UNCHANGED (`{status:'loading'}` / `{status:'error', retry}` / `{status:'no-profile'}` / `{status:'ready', profile}`) — only how `profile` is built internally changes. No consumer of `useMyProfile()` needs to change its own state-handling logic.

- [ ] **Step 1: Rewrite `components/providers/my-profile-provider.tsx`**

Current content (verify this matches before editing):

```typescript
// components/providers/my-profile-provider.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { fetchMyClientProfile } from '@/lib/client-portal/fetch-my-profile'
import { mockMyProfile } from '@/lib/client-portal/mock-my-profile'
import type { MyProfile } from '@/lib/client-portal/types'

type MyProfileState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-profile' }
  | { status: 'ready'; profile: MyProfile }

const MyProfileContext = createContext<MyProfileState | null>(null)

export function MyProfileProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['my-client-profile'],
    queryFn: fetchMyClientProfile,
  })

  let state: MyProfileState

  if (query.isPending) {
    state = { status: 'loading' }
  } else if (query.isError) {
    state = { status: 'error', retry: () => query.refetch() }
  } else if (query.data.kind === 'not-linked') {
    state = { status: 'no-profile' }
  } else {
    const profile: MyProfile = {
      client: query.data.client,
      subscription: mockMyProfile.subscription,
      subscriptionStatus: mockMyProfile.subscriptionStatus,
      subscriptionHistory: mockMyProfile.subscriptionHistory,
      sessionHistory: mockMyProfile.sessionHistory,
    }
    state = { status: 'ready', profile }
  }

  return <MyProfileContext.Provider value={state}>{children}</MyProfileContext.Provider>
}

export function useMyProfile(): MyProfileState {
  const ctx = useContext(MyProfileContext)
  if (!ctx) throw new Error('useMyProfile must be used within a MyProfileProvider')
  return ctx
}
```

New content:

```typescript
// components/providers/my-profile-provider.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { fetchMyClientProfile } from '@/lib/client-portal/fetch-my-profile'
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { MyProfile } from '@/lib/client-portal/types'
import type { ClientStatus } from '@/lib/clients/types'

type MyProfileState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-profile' }
  | { status: 'ready'; profile: MyProfile }

const MyProfileContext = createContext<MyProfileState | null>(null)

export function MyProfileProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['my-client-profile'],
    queryFn: fetchMyClientProfile,
  })

  let state: MyProfileState

  if (query.isPending) {
    state = { status: 'loading' }
  } else if (query.isError) {
    state = { status: 'error', retry: () => query.refetch() }
  } else if (query.data.kind === 'not-linked') {
    state = { status: 'no-profile' }
  } else {
    const { client, subscription, subscriptionHistory, sessionHistory } = query.data
    const subscriptionStatus: ClientStatus = subscription
      ? computeSubscriptionStatus(subscription)
      : 'none'

    const profile: MyProfile = {
      client,
      subscription,
      subscriptionStatus,
      subscriptionHistory,
      sessionHistory,
    }
    state = { status: 'ready', profile }
  }

  return <MyProfileContext.Provider value={state}>{children}</MyProfileContext.Provider>
}

export function useMyProfile(): MyProfileState {
  const ctx = useContext(MyProfileContext)
  if (!ctx) throw new Error('useMyProfile must be used within a MyProfileProvider')
  return ctx
}
```

- [ ] **Step 2: Delete the now-dead mock file**

```bash
git rm lib/client-portal/mock-my-profile.ts
```

(Confirm with a grep before deleting: `grep -rn "mock-my-profile\|mockMyProfile" lib/ components/ app/` should show zero remaining matches after Step 1's edit lands — `my-profile-provider.tsx` was its only importer.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/(client)/accueil/page.tsx` (still passes `demo` props, and `SubscriptionStatusSection`'s prop type hasn't been widened yet) — expected, fixed in Task 3. Confirm `my-profile-provider.tsx` itself has zero errors, and confirm no file anywhere still imports `mock-my-profile`.

- [ ] **Step 4: Commit**

```bash
git add components/providers/my-profile-provider.tsx lib/client-portal/mock-my-profile.ts
git commit -m "feat: build MyProfile from real subscription/session data, drop mock"
```

---

## Task 3: `/accueil` page — drop demo badges, widen prop type

**Files:**
- Modify: `app/(client)/accueil/page.tsx`
- Modify: `components/client-portal/subscription-status-section.tsx`

**Interfaces:**
- Consumes: `MyProfile` (Task 1, `subscription: Subscription | null`).

- [ ] **Step 1: Update `components/client-portal/subscription-status-section.tsx`**

Current content (verify this matches before editing):

```typescript
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'

function daysRemaining(endDate: string): number {
  const ms = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export function SubscriptionStatusSection({
  name,
  status,
  subscription,
  demo,
}: {
  name: string
  status: ClientStatus
  subscription: Subscription | undefined
  demo?: boolean
}) {
```

Change ONLY the `subscription` prop's type (find/replace):

Find:

```typescript
  subscription: Subscription | undefined
```

Replace:

```typescript
  subscription: Subscription | null
```

The rest of the component (`daysRemaining`, the `demo && <Badge>` render, the `status === 'expiring' && subscription &&` guard) is unchanged — `&&` already treats `null` the same as `undefined` (both falsy), so no logic changes needed, only the type annotation.

- [ ] **Step 2: Update `app/(client)/accueil/page.tsx`**

Current content (verify this matches before editing — the `demo` props are on lines ~99, 107, 114):

```typescript
      <SubscriptionStatusSection
        name={profile.client.name}
        status={profile.subscriptionStatus}
        subscription={profile.subscription}
        demo
      />
      <DigitalCardSection cardNumber={profile.client.cardNumber} />
      <HistoryList
        icon={Receipt}
        title="Historique paiements"
        rows={paymentHistoryRows}
        emptyMessage="Aucun historique pour l'instant."
        demo
      />
      <HistoryList
        icon={CalendarClock}
        title="Historique séances"
        rows={sessionHistoryRows}
        emptyMessage="Aucune séance pour l'instant."
        demo
      />
```

New content (remove the `demo` line from each of the 3 elements):

```typescript
      <SubscriptionStatusSection
        name={profile.client.name}
        status={profile.subscriptionStatus}
        subscription={profile.subscription}
      />
      <DigitalCardSection cardNumber={profile.client.cardNumber} />
      <HistoryList
        icon={Receipt}
        title="Historique paiements"
        rows={paymentHistoryRows}
        emptyMessage="Aucun historique pour l'instant."
      />
      <HistoryList
        icon={CalendarClock}
        title="Historique séances"
        rows={sessionHistoryRows}
        emptyMessage="Aucune séance pour l'instant."
      />
```

Nothing else in this file changes — `subscriptionRow`, `sessionRow`, `byMostRecent`, and the `paymentHistoryRows`/`sessionHistoryRows` computation all already operate on `Subscription`/`SubscriberSession` values with no dependency on whether the data is mocked or real.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: ZERO errors across the whole project. This is the last file in this plan with any outstanding compile error — confirm it's resolved.

- [ ] **Step 4: Manual verification**

Run the dev server (`superpowers:run`/`pnpm dev` against a running Postgres, seeded). Log in as a client via `/connexion` using one of the seeded client-portal-history phone numbers (e.g. Yasmine Kaddour — active current subscription, past subscriptions, recent sessions; or Marc Delaunay — expired-only, `currentSubscription` should resolve to `'none'` status; or Inès Fabre — suspended-but-current). Confirm on `/accueil`:
- No "Démo" badge appears anywhere.
- The status badge matches the seeded scenario (active/expired-so-none/suspended).
- "Historique paiements" and "Historique séances" show real, correctly-sorted entries (not the old mock data — e.g. not "Camille Bernard" amounts).
- For a client with no subscriptions at all (if one exists in seed data) or hitting the `'none'` case (Marc Delaunay), confirm the UI shows the empty/none state gracefully, no crash.

- [ ] **Step 5: Commit**

```bash
git add "app/(client)/accueil/page.tsx" components/client-portal/subscription-status-section.tsx
git commit -m "feat: drop Démo badges and widen subscription type for real client-portal data"
```

---

## Task 4: Final regression pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project. If `npx tsc` behaves suspiciously, fall back to `node "node_modules/.pnpm/typescript@<version>/node_modules/typescript/bin/tsc" --noEmit` (check the exact version via `ls node_modules/.pnpm | grep typescript` first).

- [ ] **Step 2: Production build**

Run: `pnpm build` (or `npx next build`)
Expected: build succeeds, all routes generated.

- [ ] **Step 3: Constraint audit**

- Confirm `lib/client-portal/mock-my-profile.ts` no longer exists and has zero remaining references (`grep -rn "mock-my-profile\|mockMyProfile" .`).
- Confirm no `demo` prop is passed anywhere in `app/(client)/accueil/page.tsx` (`grep -n "demo" "app/(client)/accueil/page.tsx"` should show nothing, or only unrelated matches).
- Confirm this plan touched ONLY frontend files (`git diff --name-only <baseline>..HEAD` should show no path under `server/`, `app/api/`, or `prisma/` — baseline = the commit before Task 1, check the ledger for the exact SHA).
- Confirm no remaining `Subscription | undefined` usage tied to `MyProfile`/`SubscriptionStatusSection` (`grep -rn "Subscription | undefined"` in `lib/client-portal/` and `components/client-portal/` should show nothing).

- [ ] **Step 4: Manual smoke test of adjacent, untouched features**

Verify the staff side (`/clients`, `/abonnements`, `/seances`, `/scan`) and the rest of the client portal (`/connexion` login flow itself) are entirely unaffected — this plan only touches `MyProfileProvider` and the `/accueil` page's rendering of already-fetched data.

- [ ] **Step 5: Commit** (only if Steps 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in MyProfileProvider real-history regression pass"
```
