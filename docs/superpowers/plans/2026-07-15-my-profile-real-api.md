# MyProfileProvider Real API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MyProfileProvider`'s static mock data source with a real `GET /api/client/me/profile` fetch (via React Query) for the client's identity/card, while subscription and history data remain mocked (those backend models don't exist yet) — with a visible "Données de démonstration" badge marking what's still fake, a dedicated empty state for an unlinked account, and a retry-capable error state for fetch failures.

**Architecture:** `MyProfileProvider` internals change from `useState` to `useQuery`; its external contract (`useMyProfile()`) changes from a 2-state to a 4-state union, which is a breaking change to an already-shipped hook with exactly one call site (`app/(client)/accueil/page.tsx`). A new `QueryClientProvider` is mounted once in `app/(client)/layout.tsx`. `SubscriptionStatusSection` and `HistoryList` gain an optional demo badge; `DigitalCardSection` does not (its data becomes real). This is a frontend-only change — no backend, Prisma, or API route file is touched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, `@tanstack/react-query` (new dependency). No test framework in this repo — verify with `npx tsc --noEmit` and `pnpm build`.

## Global Constraints

- **`MyProfile`'s `subscription`/`subscriptionStatus`/`subscriptionHistory`/`sessionHistory` remain sourced from `lib/client-portal/mock-my-profile.ts` unchanged.** Only `MyProfile.client` becomes real. Do not invent a fetch for anything beyond `client` — the backend has no `Subscription`/`Session`/`Payment` model to fetch from.
- **`MyProfile.client` keeps its current reduced shape** (`{name, phone, cardNumber}`), not the full real `Client` type (`{id, cardNumber, name, phone, email, isActive, joinedAt}`). Map down to the reduced shape inside the provider/fetch function — do not widen `MyProfile.client`'s type or pass extra fields through to consuming components (YAGNI — no consumer needs them today).
- **`useMyProfile()`'s new contract is a discriminated union on `status`**: `'loading' | 'error' | 'no-profile' | 'ready'`. `profile: MyProfile` only exists on the `'ready'` variant; `retry: () => void` only exists on the `'error'` variant. This is a breaking change to code already shipped — the one existing call site must be updated in the same plan, not left broken.
- **`client: null` in the API response is NOT an error.** It must produce `status: 'no-profile'`, distinct from `status: 'error'` (network/server failure). Do not conflate these two cases.
- **No backend files touched.** Do not modify `app/api/client/me/profile/route.ts`, anything under `server/`, or `prisma/`. This plan is frontend-only per the project's Backend/Frontend role split (`ARCHITECTURE_RULES.md`).
- **No custom React Query configuration** (no custom `retry`/`staleTime`/`gcTime` tuning) — use the library's defaults. Don't add complexity the design didn't ask for.
- Demo badge appears on exactly 3 sections (`SubscriptionStatusSection`, and both `HistoryList` instances for payments and sessions) and nowhere else (`DigitalCardSection` must not show it, since its data is now real).
- French UI copy throughout, consistent with the rest of the app.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (the code blocks in this plan were accurate as of plan-writing time; re-verify, since other work may land concurrently).

---

### Task 1: Install React Query

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `@tanstack/react-query` available as an importable package for Task 3+.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add @tanstack/react-query`

- [ ] **Step 2: Verify install**

Run: `npx tsc --noEmit`
Expected: no new errors (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @tanstack/react-query for client portal profile fetch"
```

---

### Task 2: `MyProfile.client` real-fetch types and mapping function

**Files:**
- Create: `lib/client-portal/fetch-my-profile.ts`

**Interfaces:**
- Consumes: nothing new at compile time beyond built-in `fetch`/`Response` — this file has no imports from `server/` (frontend cannot import backend code; it only knows the wire shape as a plain TypeScript type it defines locally, matching the real API's JSON contract by convention, not by shared import).
- Produces:
```typescript
type FetchMyProfileResult =
  | { kind: 'found'; client: MyProfile['client'] }
  | { kind: 'not-linked' }
export async function fetchMyClientProfile(): Promise<FetchMyProfileResult>
```
Consumed by Task 3 (`MyProfileProvider`).

- [ ] **Step 1: Write `lib/client-portal/fetch-my-profile.ts`**

The real API's response envelope (`server/shared/api-response.ts`, already used by auth routes) is `{ success: true, data: T, message: string, errors: null } | { success: false, data: null, message: string, errors: {field,message}[] | null }`. This file defines a local, minimal type for exactly the shape `GET /api/client/me/profile` returns — it does not attempt to model the full generic envelope type, since this file has no access to backend code and must not import from `server/`.

```typescript
// lib/client-portal/fetch-my-profile.ts
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

Note: `fetch('/api/client/me/profile')` relies on the browser sending the existing session cookie automatically (same-origin request) — no explicit header/credentials configuration needed, consistent with how the rest of this app's client-side code already calls its own API routes.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to this new file.

- [ ] **Step 3: Commit**

```bash
git add lib/client-portal/fetch-my-profile.ts
git commit -m "feat: add real fetch function and response mapping for client profile"
```

---

### Task 3: Rewrite `MyProfileProvider` on React Query

**Files:**
- Modify: `components/providers/my-profile-provider.tsx`

**Interfaces:**
- Consumes: `fetchMyClientProfile`, `FetchMyProfileResult` from `lib/client-portal/fetch-my-profile.ts` (Task 2); `mockMyProfile` from `lib/client-portal/mock-my-profile.ts` (existing, unchanged); `useQuery` from `@tanstack/react-query` (Task 1).
- Produces (BREAKING CHANGE to an already-shipped hook):
```typescript
type MyProfileState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-profile' }
  | { status: 'ready'; profile: MyProfile }

export function useMyProfile(): MyProfileState
```
Previously `useMyProfile()` returned `{ profile: MyProfile; status: 'loading' | 'ready' }` unconditionally. The one existing call site (`app/(client)/accueil/page.tsx`) is updated in Task 5 — do not update it in this task, but be aware this task's compile will surface an error there until Task 5 lands (expected, same multi-task pattern used throughout this project's history).

This task does NOT mount `QueryClientProvider` — that's Task 4. `MyProfileProvider` itself just calls `useQuery`, which requires a `QueryClientProvider` ancestor to function; that dependency is satisfied one task later, and is fine to leave temporarily unmet at the type level (React Query's hooks don't require the provider to type-check, only to run correctly at runtime — Task 4's manual verification step is where this gets exercised together).

- [ ] **Step 1: Rewrite `components/providers/my-profile-provider.tsx`**

Current content (verify this matches before editing):

```typescript
'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { mockMyProfile } from '@/lib/client-portal/mock-my-profile'
import type { MyProfile } from '@/lib/client-portal/types'

type MyProfileContextValue = {
  profile: MyProfile
  status: 'loading' | 'ready'
}

const MyProfileContext = createContext<MyProfileContextValue | null>(null)

export function MyProfileProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    setStatus('ready')
  }, [])

  return (
    <MyProfileContext.Provider value={{ profile: mockMyProfile, status }}>
      {children}
    </MyProfileContext.Provider>
  )
}

export function useMyProfile(): MyProfileContextValue {
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

Note `query.isPending` (React Query v5 naming — confirm this matches the installed version's actual API by checking `node_modules/@tanstack/react-query/build/**/types.d.ts` or its README if `tsc` reports a mismatch; v5 uses `isPending`, v4 used `isLoading` for the equivalent no-data-yet state — adapt to whichever major version Task 1 actually installed).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: this file itself has zero errors. `app/(client)/accueil/page.tsx` now shows an error (old 2-state destructuring against the new 4-state union) — expected, fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add components/providers/my-profile-provider.tsx
git commit -m "feat: rewrite MyProfileProvider on React Query with real client fetch"
```

---

### Task 4: Mount `QueryClientProvider`

**Files:**
- Modify: `app/(client)/layout.tsx`

**Interfaces:**
- Consumes: `QueryClient`, `QueryClientProvider` from `@tanstack/react-query` (Task 1).

- [ ] **Step 1: Add `QueryClientProvider` to `app/(client)/layout.tsx`**

Current content (verify this matches before editing — it was last touched by the original Interface Client sub-project; re-read to confirm):

```typescript
// app/(client)/layout.tsx
'use client'

import { Dumbbell, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MyProfileProvider } from '@/components/providers/my-profile-provider'
import { useAuth } from '@/components/providers/user-provider'

function ClientGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status, logout } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/connexion')
      return
    }
    if (status === 'authenticated' && session?.kind !== 'client') {
      router.replace('/connexion')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.kind !== 'client') {
    return null
  }

  const handleLogout = async () => {
    const success = await logout()
    if (success) router.replace('/connexion')
  }

  return (
    <MyProfileProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
              <Dumbbell className="size-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Atlas</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Déconnexion" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </div>
    </MyProfileProvider>
  )
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientGuard>{children}</ClientGuard>
}
```

New content — `QueryClientProvider` wraps `MyProfileProvider` (must be an ancestor, since `MyProfileProvider` calls `useQuery`), created once via `useState(() => new QueryClient())` so a fresh `QueryClient` isn't constructed on every render:

```typescript
// app/(client)/layout.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dumbbell, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MyProfileProvider } from '@/components/providers/my-profile-provider'
import { useAuth } from '@/components/providers/user-provider'

function ClientGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status, logout } = useAuth()
  const [queryClient] = useState(() => new QueryClient())

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/connexion')
      return
    }
    if (status === 'authenticated' && session?.kind !== 'client') {
      router.replace('/connexion')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (status === 'unauthenticated' || session?.kind !== 'client') {
    return null
  }

  const handleLogout = async () => {
    const success = await logout()
    if (success) router.replace('/connexion')
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MyProfileProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <header className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
                <Dumbbell className="size-3.5" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Atlas</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Déconnexion" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
        </div>
      </MyProfileProvider>
    </QueryClientProvider>
  )
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientGuard>{children}</ClientGuard>
}
```

Only three changes from current: the `QueryClient`/`QueryClientProvider` import, `useState` added to the React import, the `queryClient` instantiation, and wrapping `MyProfileProvider` in `<QueryClientProvider client={queryClient}>`. Guard logic, header markup, `handleLogout` are untouched.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: same single remaining error as after Task 3 (`app/(client)/accueil/page.tsx`, fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add "app/(client)/layout.tsx"
git commit -m "feat: mount QueryClientProvider for client portal data fetching"
```

---

### Task 5: Demo badge on section components

**Files:**
- Modify: `components/client-portal/subscription-status-section.tsx`
- Modify: `components/client-portal/history-list.tsx`

**Interfaces:**
- Consumes: `Badge` from `components/ui/badge.tsx` (existing, unchanged — `variant="muted"` already exists).
- Produces: both components gain an optional prop to render the demo badge. `SubscriptionStatusSection` and `HistoryList` are the only two component files that need this — `DigitalCardSection` is NOT modified in this task (per Global Constraints, it never shows the badge).

- [ ] **Step 1: Add the badge to `components/client-portal/subscription-status-section.tsx`**

Current content (verify this matches before editing):

```typescript
import { Card, CardContent } from '@/components/ui/card'
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
}: {
  name: string
  status: ClientStatus
  subscription: Subscription | undefined
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
        <div className="flex items-center gap-2">
          <ClientStatusBadge status={status} />
          {status === 'expiring' && subscription && (
            <span className="text-xs text-muted-foreground">
              Expire dans {daysRemaining(subscription.endDate)} jour{daysRemaining(subscription.endDate) > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

New content — adds a `demo` prop (defaults to not shown if omitted; Task 6 will always pass `demo` explicitly since this section is always fed mocked data today, but making it a prop rather than hardcoding the badge keeps this component honest about not knowing its own data's realness):

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
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
          {demo && <Badge variant="muted">Démo</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <ClientStatusBadge status={status} />
          {status === 'expiring' && subscription && (
            <span className="text-xs text-muted-foreground">
              Expire dans {daysRemaining(subscription.endDate)} jour{daysRemaining(subscription.endDate) > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add the badge to `components/client-portal/history-list.tsx`**

Current content (verify this matches before editing):

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

export type HistoryRow = {
  key: string
  label: string
  date: string
  amount: string
}

export function HistoryList({
  icon: Icon,
  title,
  rows,
  emptyMessage,
}: {
  icon: LucideIcon
  title: string
  rows: HistoryRow[]
  emptyMessage: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{row.label}</span>
                <span>{row.date}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

New content — adds the same `demo?: boolean` prop, badge placed in the header next to the title:

```typescript
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

export type HistoryRow = {
  key: string
  label: string
  date: string
  amount: string
}

export function HistoryList({
  icon: Icon,
  title,
  rows,
  emptyMessage,
  demo,
}: {
  icon: LucideIcon
  title: string
  rows: HistoryRow[]
  emptyMessage: string
  demo?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        {demo && <Badge variant="muted">Démo</Badge>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{row.label}</span>
                <span>{row.date}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: same single remaining error as before (`app/(client)/accueil/page.tsx`, fixed in Task 6 — note this task is numbered 5 but the page rewrite is Task 6 per this plan's numbering; both new `demo` props are optional so nothing breaks by not being passed yet).

- [ ] **Step 4: Commit**

```bash
git add components/client-portal/subscription-status-section.tsx components/client-portal/history-list.tsx
git commit -m "feat: add optional demo badge to subscription and history sections"
```

---

### Task 6: Rewrite `/accueil` for the 4-state contract

**Files:**
- Modify: `app/(client)/accueil/page.tsx`

**Interfaces:**
- Consumes: `useMyProfile()`'s new 4-state return (Task 3); `demo` prop on `SubscriptionStatusSection`/`HistoryList` (Task 5).

- [ ] **Step 1: Rewrite `app/(client)/accueil/page.tsx`**

Current content (verify this matches before editing):

```typescript
// app/(client)/accueil/page.tsx
'use client'

import { CalendarClock, Receipt } from 'lucide-react'
import { DigitalCardSection } from '@/components/client-portal/digital-card-section'
import { HistoryList, type HistoryRow } from '@/components/client-portal/history-list'
import { SubscriptionStatusSection } from '@/components/client-portal/subscription-status-section'
import { useMyProfile } from '@/components/providers/my-profile-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PlanId, Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

function subscriptionRow(s: Subscription): HistoryRow {
  return {
    key: s.id,
    label: planLabel(s.planId),
    date: new Date(s.createdAt).toLocaleDateString('fr-FR'),
    amount: currency(s.amountPaid),
  }
}

function sessionRow(s: SubscriberSession): HistoryRow {
  return {
    key: s.id,
    label: 'Séance',
    date: `${new Date(s.checkedInAt).toLocaleDateString('fr-FR')} ${new Date(s.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    amount: currency(s.amountPaid),
  }
}

function byMostRecent<T>(items: T[], isoDateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => new Date(isoDateOf(b)).getTime() - new Date(isoDateOf(a)).getTime())
}

export default function ClientHomePage() {
  const { profile, status } = useMyProfile()

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const paymentHistoryRows: HistoryRow[] = byMostRecent(
    [
      ...profile.subscriptionHistory.map((s) => ({ isoDate: s.createdAt, row: subscriptionRow(s) })),
      ...profile.sessionHistory.map((s) => ({ isoDate: s.checkedInAt, row: sessionRow(s) })),
    ],
    (entry) => entry.isoDate
  ).map((entry) => entry.row)

  const sessionHistoryRows: HistoryRow[] = byMostRecent(profile.sessionHistory, (s) => s.checkedInAt).map(sessionRow)

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
```

New content — the row-building helpers (`currency`, `planLabel`, `subscriptionRow`, `sessionRow`, `byMostRecent`) are UNCHANGED, only the component body and its imports change:

```typescript
// app/(client)/accueil/page.tsx
'use client'

import { CalendarClock, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DigitalCardSection } from '@/components/client-portal/digital-card-section'
import { HistoryList, type HistoryRow } from '@/components/client-portal/history-list'
import { SubscriptionStatusSection } from '@/components/client-portal/subscription-status-section'
import { useMyProfile } from '@/components/providers/my-profile-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { PlanId, Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

function subscriptionRow(s: Subscription): HistoryRow {
  return {
    key: s.id,
    label: planLabel(s.planId),
    date: new Date(s.createdAt).toLocaleDateString('fr-FR'),
    amount: currency(s.amountPaid),
  }
}

function sessionRow(s: SubscriberSession): HistoryRow {
  return {
    key: s.id,
    label: 'Séance',
    date: `${new Date(s.checkedInAt).toLocaleDateString('fr-FR')} ${new Date(s.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    amount: currency(s.amountPaid),
  }
}

function byMostRecent<T>(items: T[], isoDateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => new Date(isoDateOf(b)).getTime() - new Date(isoDateOf(a)).getTime())
}

export default function ClientHomePage() {
  const state = useMyProfile()

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger votre profil.</p>
        <Button variant="outline" onClick={state.retry}>
          Réessayer
        </Button>
      </div>
    )
  }

  if (state.status === 'no-profile') {
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">
          Votre compte n'est pas encore relié à une fiche client. Contactez l'accueil.
        </p>
      </div>
    )
  }

  const { profile } = state

  const paymentHistoryRows: HistoryRow[] = byMostRecent(
    [
      ...profile.subscriptionHistory.map((s) => ({ isoDate: s.createdAt, row: subscriptionRow(s) })),
      ...profile.sessionHistory.map((s) => ({ isoDate: s.checkedInAt, row: sessionRow(s) })),
    ],
    (entry) => entry.isoDate
  ).map((entry) => entry.row)

  const sessionHistoryRows: HistoryRow[] = byMostRecent(profile.sessionHistory, (s) => s.checkedInAt).map(sessionRow)

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
```

Note `demo` is passed as a bare prop (`demo` shorthand for `demo={true}`) on `SubscriptionStatusSection` and both `HistoryList` instances, and deliberately NOT passed to `DigitalCardSection` (which has no `demo` prop at all — its data is real).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project. This is the last file with the outstanding breaking-change error from Task 3 — confirm it's resolved.

- [ ] **Step 3: Manual verification**

Run: `pnpm dev` (ensure Postgres is running and seeded per the project's existing dev setup — `pnpm prisma migrate dev` then `pnpm tsx prisma/seed.ts` if not already done). Log in via `/connexion` using OTP (fixed dev code `123456` for any seeded phone number — see project conventions) with:
- `+33612345601` (Yasmine Kaddour, linked to a `Client`) → `/accueil` should show `status: 'ready'`, her real name/phone/card number in `DigitalCardSection` (no demo badge there), and the mocked "Camille Bernard" data should NOT leak into the client identity display — only into the 3 demo-badged sections (subscription status shows the mocked plan/status, history lists show the mocked entries).
- `+33612345604` (Karim Benali, NOT linked to a `Client`) → `/accueil` should show the `'no-profile'` message, no sections rendered below it.

To exercise `status: 'error'`, temporarily stop the dev server's database connection or block the network request via browser devtools, reload `/accueil`, confirm the error message + "Réessayer" button appear, and that clicking "Réessayer" retries (restore the connection first, then click, to confirm it recovers to `'ready'`).

- [ ] **Step 4: Commit**

```bash
git add "app/(client)/accueil/page.tsx"
git commit -m "feat: wire /accueil to the 4-state MyProfileProvider contract"
```

---

### Task 7: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: build succeeds with no errors, all routes generated including `/accueil`.

- [ ] **Step 3: Constraint audit (do not skip)**

Grep the diff for any accidental scope creep:
- Confirm no file under `server/`, `app/api/`, or `prisma/` appears in `git diff` for this plan's commits.
- Confirm `MyProfile.client`'s type in `lib/client-portal/types.ts` was NOT widened (still exactly `{name, phone, cardNumber}`) — this plan's Task 2 deliberately keeps the reduced shape; if a later task accidentally expanded it, that's a scope violation to flag.
- Confirm `DigitalCardSection`'s file (`components/client-portal/digital-card-section.tsx`) has zero diff across this whole plan — it should never have been touched.

- [ ] **Step 4: Manual smoke test of adjacent features**

Verify staff-side routes (`/clients`, `/seances`, `/scan`, `/abonnements`) are unaffected — this plan only touches the client portal's files.

- [ ] **Step 5: Commit** (only if Step 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in MyProfileProvider real-API wiring regression pass"
```
