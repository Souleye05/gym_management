# Interface Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-facing portal screen (`/accueil`) showing subscription status, digital QR card, and payment/session history — backed entirely by a new, self-contained mock provider (`MyProfileProvider`) with zero dependency on the real authenticated session's identity, so the internal implementation can later be swapped for a real API call without touching any screen component.

**Architecture:** Frontend-only. A new `lib/client-portal/` domain (types + static mock data) feeds a new `MyProfileProvider` (read-only context, no mutations), mounted inside the existing `app/(client)/layout.tsx`'s `ClientGuard`. The existing stub at `app/(client)/accueil/page.tsx` is replaced with four stacked sections, reusing already-shipped components (`ClientStatusBadge`, `ClientQrCode`) wherever possible. No Prisma, no API route, no auth changes — those are out of scope per `ARCHITECTURE_RULES.md`'s Backend/Frontend split.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, Lucide React icons. No test framework in this repo — verify with `npx tsc --noEmit` and `npm run build` (or `pnpm build` — this repo uses pnpm, see Global Constraints).

## Global Constraints

- **No correspondence logic between the real session and mock data.** `MyProfileProvider` must never read `useCurrentClient()`/`session.id`/`session.phone` to select or filter its data. Its mock profile is static and independent of who is actually logged in. This is the single most important rule in this plan — a task that introduces any such lookup is out of scope and must be rejected in review.
- **No real API calls.** No `fetch()`, no `lib/api/http-client.ts` usage, nothing that hits `app/api/`. The provider's data source is a static in-repo mock module only.
- **Read-only provider.** `MyProfileContextValue` must expose no mutation functions — the type itself must make this structurally true, not just a convention.
- **Reuse existing types and components, don't duplicate.** `Subscription`, `SubscriberSession`, `ClientStatus`, `PaymentMethod` (all already defined) are reused as-is. `ClientStatusBadge` and `ClientQrCode` (already shipped) are reused as-is, not reimplemented.
- **This project uses `pnpm`, not `npm`** — if any command needs a package manager, use `pnpm`. No new dependencies are needed for this plan.
- Do not touch `app/(staff)/`, any staff provider (`ClientsProvider`, `SubscriptionsProvider`, `SessionsProvider`, `SettingsProvider`), `lib/clients/`, `lib/subscriptions/`, `lib/sessions/` (only their *types* are imported, never modified), `components/providers/user-provider.tsx`, `middleware.ts`, or anything under `server/`/`prisma/`/`app/api/`. This plan's only touch points are `app/(client)/layout.tsx` (provider mount only), `app/(client)/accueil/page.tsx` (full rewrite), and new files under `lib/client-portal/` and `components/client-portal/`.
- French UI copy throughout; `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })` for money, `toLocaleDateString('fr-FR')`/`toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })` for dates — matching the codebase's existing convention exactly (see `app/(staff)/clients/[id]/page.tsx` for the reference pattern).
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (the code blocks in this plan were accurate as of plan-writing time; re-verify, since other work may land concurrently from a separate backend-focused agent working in this same repo).

---

### Task 1: `lib/client-portal/` types and mock data

**Files:**
- Create: `lib/client-portal/types.ts`
- Create: `lib/client-portal/mock-my-profile.ts`

**Interfaces:**
- Consumes: `PaymentMethod`, `Subscription` from `lib/subscriptions/types.ts` (existing, unchanged); `ClientStatus` from `lib/clients/types.ts` (existing, unchanged); `SubscriberSession` from `lib/sessions/types.ts` (existing, unchanged); `computeSubscriptionStatus` from `lib/subscriptions/status.ts` (existing, unchanged, used only to derive the mock's `subscriptionStatus` field consistently with how the rest of the app computes it).
- Produces: `MyProfile` type, `mockMyProfile: MyProfile` constant. Consumed by Task 2 (`MyProfileProvider`).

- [ ] **Step 1: Write `lib/client-portal/types.ts`**

```typescript
// lib/client-portal/types.ts
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

- [ ] **Step 2: Write `lib/client-portal/mock-my-profile.ts`**

A single representative fictional profile: an active subscription, a subscription history including at least one expired entry (to exercise the history list's variety), and several session-history entries. Use relative-to-now date helpers matching the style already used in `lib/subscriptions/mock-subscriptions.ts`/`lib/sessions/mock-sessions.ts` (`daysFromNow`/`hoursFromNow`), defined locally in this file — do not import them from the staff mock files (those are a different domain; this file must stand alone per the "no correspondence" constraint, and per YAGNI there's no shared helper module to justify creating just for two small functions used in exactly one file each).

```typescript
// lib/client-portal/mock-my-profile.ts
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'
import type { MyProfile } from './types'

function daysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

const currentSubscription: Subscription = {
  id: 'my-sub-current',
  clientId: 'my-client',
  planId: 'quarterly',
  startDate: daysFromNow(-45),
  endDate: daysFromNow(45),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'card',
  createdAt: daysFromNow(-45),
}

const pastSubscription: Subscription = {
  id: 'my-sub-past',
  clientId: 'my-client',
  planId: 'monthly',
  startDate: daysFromNow(-90),
  endDate: daysFromNow(-46),
  suspended: false,
  amountPaid: 40,
  paymentMethod: 'cash',
  createdAt: daysFromNow(-90),
}

const sessionHistory: SubscriberSession[] = [
  { type: 'subscriber', id: 'my-sess-1', clientId: 'my-client', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-20) },
  { type: 'subscriber', id: 'my-sess-2', clientId: 'my-client', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-90) },
  { type: 'subscriber', id: 'my-sess-3', clientId: 'my-client', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-200) },
]

export const mockMyProfile: MyProfile = {
  client: {
    name: 'Camille Bernard',
    phone: '+33698712345',
    cardNumber: 'CARD-00099',
  },
  subscription: currentSubscription,
  subscriptionStatus: computeSubscriptionStatus(currentSubscription),
  subscriptionHistory: [currentSubscription, pastSubscription],
  sessionHistory,
}
```

Note the fictional client's `id`/`clientId` values (`'my-client'`) are deliberately NOT any real mock ID from `lib/clients/mock-clients.ts` (`'cl1'`...`'cl18'`) — this is intentional, reinforcing that this profile is fully independent fictional data, not a disguised reference to a staff-side mock client.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the two new files.

- [ ] **Step 4: Commit**

```bash
git add lib/client-portal/types.ts lib/client-portal/mock-my-profile.ts
git commit -m "feat: add client portal profile types and mock data"
```

---

### Task 2: `MyProfileProvider`

**Files:**
- Create: `components/providers/my-profile-provider.tsx`

**Interfaces:**
- Consumes: `MyProfile` from `lib/client-portal/types.ts` (Task 1); `mockMyProfile` from `lib/client-portal/mock-my-profile.ts` (Task 1).
- Produces:
```typescript
type MyProfileContextValue = {
  profile: MyProfile
  status: 'loading' | 'ready'
}
function useMyProfile(): MyProfileContextValue
```
Consumed by Task 4 (`/accueil` page) and its section components (Task 3).

- [ ] **Step 1: Write `components/providers/my-profile-provider.tsx`**

Follows the same `createContext` + null-check hook pattern already established by every other provider in this codebase (see `components/providers/settings-provider.tsx` for the simplest reference). The brief `'loading'` → `'ready'` transition on mount exists so the UI has a real loading state to render — useful today for demonstrating the loading section, and meaningful later when this provider's internals are swapped for a real fetch.

```typescript
// components/providers/my-profile-provider.tsx
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

Note `MyProfileContextValue` has exactly two fields, `profile` and `status` — no function of any kind. This is the structural read-only guarantee: there is nothing to call that could mutate anything, not even a naming convention to follow.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/providers/my-profile-provider.tsx
git commit -m "feat: add read-only MyProfileProvider for client portal"
```

---

### Task 3: Section components

**Files:**
- Create: `components/client-portal/subscription-status-section.tsx`
- Create: `components/client-portal/digital-card-section.tsx`
- Create: `components/client-portal/history-list.tsx`

**Interfaces:**
- Consumes: `MyProfile` fields as props (not `useMyProfile()` directly — these are presentational components, receiving data via props, consistent with the codebase's existing pattern of small presentational components fed by a page-level hook call); `ClientStatusBadge` from `components/clients/client-status-badge.tsx` (existing, unchanged); `ClientQrCode` from `components/scan/client-qr-code.tsx` (existing, unchanged); `Card`/`CardHeader`/`CardTitle`/`CardContent` from `components/ui/card.tsx` (existing, unchanged); `Subscription`, `SubscriberSession`, `PaymentMethod` types.
- Produces: `SubscriptionStatusSection`, `DigitalCardSection`, `HistoryList` components. Consumed by Task 4 (`/accueil` page).

- [ ] **Step 1: Write `components/client-portal/subscription-status-section.tsx`**

Shows name, status badge, and (only when `expiring`) a "days remaining" line computed from `subscription.endDate`.

```typescript
// components/client-portal/subscription-status-section.tsx
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

- [ ] **Step 2: Write `components/client-portal/digital-card-section.tsx`**

Wraps the existing `ClientQrCode` in a `Card`, presented more prominently than its small usage on the staff client-profile page (this is the client's main screen, not a secondary detail) — but the QR component itself is reused unchanged, not reimplemented at a different size internally (its canvas is a fixed 96px per its own implementation; "more prominent" here means card padding/emphasis, not scaling the canvas).

```typescript
// components/client-portal/digital-card-section.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientQrCode } from '@/components/scan/client-qr-code'
import { CreditCard } from 'lucide-react'

export function DigitalCardSection({ cardNumber }: { cardNumber: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4" />
          Carte numérique
        </CardTitle>
      </CardHeader>
      <CardContent className="flex justify-center pb-6">
        <ClientQrCode cardNumber={cardNumber} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Write `components/client-portal/history-list.tsx`**

A generic, reusable list-in-a-card component for both "Historique paiements" (Task 4 will pass it a merged/sorted list of mixed entries) and "Historique séances" (Task 4 will pass it `sessionHistory` alone). Takes pre-formatted row data rather than raw domain objects, so it stays agnostic of `Subscription`/`SubscriberSession` — the caller (the page) does the merging/sorting/formatting, this component only renders.

```typescript
// components/client-portal/history-list.tsx
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

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the three new files (none are consumed yet).

- [ ] **Step 5: Commit**

```bash
git add components/client-portal/subscription-status-section.tsx components/client-portal/digital-card-section.tsx components/client-portal/history-list.tsx
git commit -m "feat: add client portal section components"
```

---

### Task 4: Mount provider and rebuild `/accueil`

**Files:**
- Modify: `app/(client)/layout.tsx`
- Modify: `app/(client)/accueil/page.tsx`

**Interfaces:**
- Consumes: `MyProfileProvider` (Task 2); `useMyProfile()` (Task 2); `SubscriptionStatusSection`, `DigitalCardSection`, `HistoryList` (Task 3); `PaymentMethod` from `lib/subscriptions/types.ts`.

- [ ] **Step 1: Mount `MyProfileProvider` in `app/(client)/layout.tsx`**

Current content (verify this matches before editing):

```typescript
// app/(client)/layout.tsx
'use client'

import { Dumbbell, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  )
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientGuard>{children}</ClientGuard>
}
```

New: wrap only the `children` passed into `ClientGuard`'s rendered `<main>` with `MyProfileProvider` — the provider must sit AFTER the authentication check (inside the branch that already confirmed `status === 'authenticated' && session?.kind === 'client'`), never before, since mounting it earlier would render it for unauthenticated visitors pointlessly (and contradicts the spec's explicit ordering requirement).

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

Only two changes from current: the `MyProfileProvider` import and wrapper, and `<main>`'s className gaining `gap-4` (the new page has multiple stacked `Card` sections that need spacing — `flex flex-col` was already there, `gap-4` is additive). Nothing else in this file changes.

- [ ] **Step 2: Replace `app/(client)/accueil/page.tsx`**

Current content (verify this matches before editing):

```typescript
// app/(client)/accueil/page.tsx
'use client'

import { useCurrentClient } from '@/components/providers/user-provider'

export default function ClientHomePage() {
  const session = useCurrentClient()
  const maskedPhone = session.phone.replace(/\d(?=\d{2})/g, '•')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Bienvenue, {session.name}</h1>
      <p className="text-sm text-muted-foreground">{maskedPhone}</p>
    </div>
  )
}
```

New content — this REPLACES the entire file. Note it stops calling `useCurrentClient()` from `user-provider` entirely for the profile display (per the global constraint: no correspondence with the real session); `useMyProfile()` is now the sole data source for this page.

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

const PAYMENT_LABELS: Record<Subscription['paymentMethod'], string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

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

export default function ClientHomePage() {
  const { profile, status } = useMyProfile()

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const paymentHistoryRows: HistoryRow[] = [
    ...profile.subscriptionHistory.map(subscriptionRow),
    ...profile.sessionHistory.map(sessionRow),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  const sessionHistoryRows: HistoryRow[] = profile.sessionHistory
    .map(sessionRow)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

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

Implementer note: the payment-history row sort (`a.date < b.date ? 1 : -1`) is a simple string comparison on the ALREADY-FORMATTED French date string, which is unreliable for cross-date ordering (French `toLocaleDateString` format is `DD/MM/YYYY`, so lexical string comparison does not sort chronologically). If you hit this while testing (Step 3 below), fix it by sorting the underlying `Subscription`/`SubscriberSession` arrays by their real ISO date field (`createdAt`/`checkedInAt`) BEFORE mapping to `HistoryRow`, not by sorting the formatted strings — this is a bug in this plan's reference code, not a design requirement to preserve. Note the fix in your report.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, log in as a client (via `/connexion` → OTP flow — check `prisma/seed.ts` or ask if unsure which phone numbers are seeded for client login), navigate to `/accueil`.
Expected: page shows the loading state briefly, then the mock profile's name ("Camille Bernard") + status badge ("Actif" since the mock's current subscription is active), the QR code + card number ("CARD-00099"), a payment history list correctly SORTED BY REAL DATE (most recent first — verify this explicitly, per the sort-bug note above), and a session history list. Confirm this is the SAME regardless of which real account you logged in as — since the profile is static mock data, logging in as any different seeded client must show the exact identical "Camille Bernard" profile, proving there is no correspondence logic. Confirm logout still works.

- [ ] **Step 5: Commit**

```bash
git add "app/(client)/layout.tsx" "app/(client)/accueil/page.tsx"
git commit -m "feat: build client portal home screen with mocked profile data"
```

---

### Task 5: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: build succeeds with no errors, all routes generated including `/accueil`.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`. Log in via `/connexion` (OTP flow) with any seeded client phone number, confirm `/accueil` renders the full mock profile correctly. Log out, confirm redirect to `/connexion`. Confirm `app/(staff)/` routes (e.g. `/clients`, `/seances`, `/scan`) are entirely unaffected — this plan never touches staff providers or pages.

- [ ] **Step 4: Constraint audit (do not skip)**

Grep the diff for any accidental violation of the "no correspondence" constraint: confirm `components/providers/my-profile-provider.tsx` and `app/(client)/accueil/page.tsx` do not import `useAuth`/`useCurrentClient` from `user-provider` for anything beyond what layout.tsx already needs (the page itself should have ZERO import from `user-provider` after Task 4 — verify this explicitly, since the original stub imported `useCurrentClient` and that import must be fully gone, not just unused).

- [ ] **Step 5: Commit** (only if Step 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in Interface Client regression pass"
```
