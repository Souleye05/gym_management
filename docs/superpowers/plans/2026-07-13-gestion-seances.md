# Gestion Séances journalières Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff record a paid daily gym session ("séance") for an existing client, see today's sessions on a dedicated screen, and see a client's full session history on their profile — with the session price coming from a configurable app-wide setting rather than a hardcoded constant.

**Architecture:** Same layered pattern as the Abonnements sub-project: pure types → mock data → React Context provider (in-memory state) → presentational components → screens. Two new domains: `lib/settings/` + `SettingsProvider` (generic app config, seed of the future Paramètres screen) and `lib/sessions/` + `SessionsProvider` (the séance domain itself, which reads the current price from Settings at creation time only).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, Lucide React icons. No test framework in this repo — verify with `npx tsc --noEmit` and manual checks against `npm run dev`.

## Global Constraints

- No `localStorage`/API persistence anywhere — in-memory React state only, seeded from a mock array at provider mount, exactly like `ClientsProvider`/`SubscriptionsProvider`.
- `Session.amountPaid` must be **copied** from `settings.sessionPrice` at creation time and never recalculated afterward. No `SESSION_PRICE` constant may exist anywhere in the codebase.
- A séance requires an existing `Client` (`clientId`) — no walk-in/free-text name capture. If no client is found, the UI directs to creating a client via the existing `/clients` flow; it does not create one inline.
- A séance may be recorded for a client regardless of their subscription status — no blocking logic, no warning.
- `/seances` shows **today only** — no date filter, no pagination, no multi-day browsing in this sub-project.
- `SessionsProvider` must be mounted at or below `SettingsProvider` in the component tree (it calls `useSettings()` internally).
- Reuse `PaymentMethod` from `lib/subscriptions/types.ts` — do not redefine it under `lib/sessions/`.
- French UI copy throughout, `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })` for money, `toLocaleDateString('fr-FR')` for dates — same formatting helpers already used in subscriptions components.
- Do not touch `app/(staff)/clients/page.tsx`, `app/(staff)/abonnements/page.tsx`, the Abonnement card on `/clients/[id]`, or any subscriptions/clients files except the one documented insertion point on `/clients/[id]` (the "Historique des séances" stub card).

---

### Task 1: Settings domain (types, mock, provider)

**Files:**
- Create: `lib/settings/types.ts`
- Create: `lib/settings/mock-settings.ts`
- Create: `components/providers/settings-provider.tsx`

**Interfaces:**
- Produces: `AppSettings` type (`{ sessionPrice: number }`), `DEFAULT_SETTINGS: AppSettings`, `SettingsProvider` component, `useSettings(): { settings: AppSettings; updateSettings(patch: Partial<AppSettings>): void }` hook. Later tasks (Task 3, `SessionsProvider`) consume `useSettings()`.

- [ ] **Step 1: Write `lib/settings/types.ts`**

```typescript
// lib/settings/types.ts
export type AppSettings = {
  sessionPrice: number
}
```

- [ ] **Step 2: Write `lib/settings/mock-settings.ts`**

```typescript
// lib/settings/mock-settings.ts
import type { AppSettings } from './types'

export const DEFAULT_SETTINGS: AppSettings = {
  sessionPrice: 8,
}
```

- [ ] **Step 3: Write `components/providers/settings-provider.tsx`**

```typescript
// components/providers/settings-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS } from '@/lib/settings/mock-settings'
import type { AppSettings } from '@/lib/settings/types'

type SettingsContextValue = {
  settings: AppSettings
  updateSettings(patch: Partial<AppSettings>): void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_SETTINGS }))

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the three new files.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/types.ts lib/settings/mock-settings.ts components/providers/settings-provider.tsx
git commit -m "feat: add app settings domain with configurable session price"
```

---

### Task 2: Sessions domain — types and mock data

**Files:**
- Create: `lib/sessions/types.ts`
- Create: `lib/sessions/mock-sessions.ts`

**Interfaces:**
- Consumes: `PaymentMethod` from `lib/subscriptions/types.ts` (unchanged, already exists: `'cash' | 'card' | 'mobile_money'`).
- Produces: `Session` type, `mockSessions: Session[]`. Later tasks (Task 3 `SessionsProvider`, Task 4/5 components) consume both.

- [ ] **Step 1: Write `lib/sessions/types.ts`**

```typescript
// lib/sessions/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'

export type Session = {
  id: string
  clientId: string
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: string // ISO datetime string
}
```

- [ ] **Step 2: Write `lib/sessions/mock-sessions.ts`**

Seed a mix of past-day and today sessions for clients `cl1`, `cl3`, `cl7`, `cl12` (a mix of clients with and without active subscriptions, per existing mock data), so `/seances` shows entries on first load without requiring any action. Use a `hoursFromNow` helper for readable relative timestamps, matching the `daysFromNow` helper style already used in `lib/subscriptions/mock-subscriptions.ts`.

```typescript
// lib/sessions/mock-sessions.ts
import type { Session } from './types'

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

export const mockSessions: Session[] = [
  { id: 'sess1', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-2) },
  { id: 'sess2', clientId: 'cl7', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-1) },
  { id: 'sess3', clientId: 'cl12', amountPaid: 8, paymentMethod: 'mobile_money', checkedInAt: hoursFromNow(-0.5) },
  { id: 'sess4', clientId: 'cl1', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-30) },
  { id: 'sess5', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-54) },
]
```

Note: `sess4` and `sess5` land on earlier calendar days (30 and 54 hours ago) so `getSessionsForToday()` (Task 3) has real data to filter out, proving the "today only" filter actually filters. `sess1`–`sess3` land today (0.5–2 hours ago) provided the plan is executed the same day the mock is authored; this is acceptable per the existing convention in `mock-subscriptions.ts` (relative-to-now mock data).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the two new files.

- [ ] **Step 4: Commit**

```bash
git add lib/sessions/types.ts lib/sessions/mock-sessions.ts
git commit -m "feat: add session type and mock data"
```

---

### Task 3: SessionsProvider

**Files:**
- Create: `components/providers/sessions-provider.tsx`

**Interfaces:**
- Consumes: `useSettings()` from `components/providers/settings-provider.tsx` (Task 1) for `settings.sessionPrice`; `Session` and `mockSessions` from Task 2; `PaymentMethod` from `lib/subscriptions/types.ts`.
- Produces:
```typescript
type SessionsContextValue = {
  sessions: Session[]
  recordSession(input: { clientId: string; paymentMethod: PaymentMethod }): Session
  getSessionsForClient(clientId: string): Session[]
  getSessionsForToday(): Session[]
}
```
Later tasks (Task 6 `/seances` page, Task 7 client profile section, Task 4 confirmation component via its props) rely on exactly these four names and signatures.

- [ ] **Step 1: Write `components/providers/sessions-provider.tsx`**

```typescript
// components/providers/sessions-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useSettings } from '@/components/providers/settings-provider'
import { mockSessions } from '@/lib/sessions/mock-sessions'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionsContextValue = {
  sessions: Session[]
  recordSession(input: { clientId: string; paymentMethod: PaymentMethod }): Session
  getSessionsForClient(clientId: string): Session[]
  getSessionsForToday(): Session[]
}

const SessionsContext = createContext<SessionsContextValue | null>(null)

function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA)
  const b = new Date(isoB)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function SessionsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [sessions, setSessions] = useState<Session[]>(() => [...mockSessions])

  const recordSession = useCallback(
    (input: { clientId: string; paymentMethod: PaymentMethod }) => {
      const created: Session = {
        id: `sess${Date.now()}`,
        clientId: input.clientId,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        checkedInAt: new Date().toISOString(),
      }
      setSessions((prev) => [...prev, created])
      return created
    },
    [settings.sessionPrice],
  )

  const getSessionsForClient = useCallback(
    (clientId: string) =>
      sessions
        .filter((s) => s.clientId === clientId)
        .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()),
    [sessions],
  )

  const getSessionsForToday = useCallback(() => {
    const now = new Date().toISOString()
    return sessions
      .filter((s) => isSameDay(s.checkedInAt, now))
      .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
  }, [sessions])

  return (
    <SessionsContext.Provider
      value={{ sessions, recordSession, getSessionsForClient, getSessionsForToday }}
    >
      {children}
    </SessionsContext.Provider>
  )
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext)
  if (!ctx) throw new Error('useSessions must be used within a SessionsProvider')
  return ctx
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/providers/sessions-provider.tsx
git commit -m "feat: add SessionsProvider with settings-driven pricing"
```

---

### Task 4: Session presentational components

**Files:**
- Create: `components/sessions/payment-method-picker.tsx`
- Create: `components/sessions/session-confirmation.tsx`

**Interfaces:**
- Consumes: `PaymentMethod` from `lib/subscriptions/types.ts`.
- Produces: `PaymentMethodPicker` component (`{ value: PaymentMethod; onChange: (value: PaymentMethod) => void }`), `SessionConfirmation` component (`{ amountPaid: number; paymentMethod: PaymentMethod; checkedInAt: string }`). Consumed by Task 5 (`SessionForm`... actually the picker is embedded directly in Task 6/7 dialogs) and by Task 6/7 confirmation dialogs.

`PaymentMethodPicker` extracts the payment-method button-group markup already duplicated inline in `components/subscriptions/subscription-form.tsx` (lines 49-67), so it can be reused without duplicating that markup a third time across the two new séance entry points (Task 6 dialog with search, Task 7 dialog without search).

- [ ] **Step 1: Write `components/sessions/payment-method-picker.tsx`**

```typescript
// components/sessions/payment-method-picker.tsx
'use client'

import { Label } from '@/components/ui/input'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'mobile_money', label: 'Mobile Money' },
]

export function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod
  onChange: (value: PaymentMethod) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Mode de paiement</Label>
      <div className="flex gap-1.5">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange(method.value)}
            className={
              value === method.value
                ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
            }
          >
            {method.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/sessions/session-confirmation.tsx`**

```typescript
// components/sessions/session-confirmation.tsx
import { CheckCircle2 } from 'lucide-react'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SessionConfirmation({
  amountPaid,
  paymentMethod,
  checkedInAt,
}: {
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{currency(amountPaid)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the two new files.

- [ ] **Step 4: Commit**

```bash
git add components/sessions/payment-method-picker.tsx components/sessions/session-confirmation.tsx
git commit -m "feat: add session payment picker and confirmation components"
```

---

### Task 5: Client search component (for the /seances entry dialog)

**Files:**
- Create: `components/sessions/client-search.tsx`

**Interfaces:**
- Consumes: `Client` from `lib/clients/types.ts`.
- Produces: `ClientSearch` component (`{ clients: Client[]; onSelect: (client: Client) => void }`) — a text input filtering by name/phone (same filter predicate as `app/(staff)/clients/page.tsx`'s `useFilteredClients`) plus a results list of clickable rows. Consumed by Task 6 (`/seances` recording dialog).

- [ ] **Step 1: Write `components/sessions/client-search.tsx`**

```typescript
// components/sessions/client-search.tsx
'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { Client } from '@/lib/clients/types'

export function ClientSearch({
  clients,
  onSelect,
}: {
  clients: Client[]
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) return []
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(normalizedQuery) ||
        client.phone.toLowerCase().includes(normalizedQuery),
    )
  }, [clients, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="pl-9"
          autoFocus
        />
      </div>
      {query.trim().length > 0 && (
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun client trouvé.</p>
          ) : (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => onSelect(client)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <Avatar name={client.name} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{client.name}</span>
                  <span className="text-xs text-muted-foreground">{client.phone}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add components/sessions/client-search.tsx
git commit -m "feat: add client search component for session recording"
```

---

### Task 6: Mount providers and build the /seances page

**Files:**
- Modify: `app/(staff)/layout.tsx`
- Modify: `app/(staff)/seances/page.tsx` (replace stub entirely)

**Interfaces:**
- Consumes: `SettingsProvider` (Task 1), `SessionsProvider` + `useSessions()` (Task 3), `PaymentMethodPicker` + `SessionConfirmation` (Task 4), `ClientSearch` (Task 5), `useClients()` (existing), `Dialog`/`DialogHeader`/`DialogTitle`/`DialogDescription` (existing `components/ui/dialog.tsx`), `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow` (existing `components/ui/table.tsx`), `EmptyState` (existing), `Avatar` (existing), `Button` (existing).

- [ ] **Step 1: Mount `SettingsProvider` and `SessionsProvider` in the staff layout**

In `app/(staff)/layout.tsx`, `SettingsProvider` must wrap `SessionsProvider` (per Global Constraints — `SessionsProvider` calls `useSettings()`). Nest both inside the existing `ClientsProvider`/`SubscriptionsProvider` wrapping, in any order relative to those two (no dependency between the four providers besides Settings→Sessions):

```typescript
// app/(staff)/layout.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ClientsProvider } from '@/components/providers/clients-provider'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { SessionsProvider } from '@/components/providers/sessions-provider'
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
        <SettingsProvider>
          <SessionsProvider>
            <AppShell>{children}</AppShell>
          </SessionsProvider>
        </SettingsProvider>
      </SubscriptionsProvider>
    </ClientsProvider>
  )
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>
}
```

Only the import block and the returned JSX tree change; `StaffGuard`'s auth logic and `StaffLayout` are otherwise untouched.

- [ ] **Step 2: Replace `app/(staff)/seances/page.tsx`**

```typescript
// app/(staff)/seances/page.tsx
'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientSearch } from '@/components/sessions/client-search'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import type { Client } from '@/lib/clients/types'
import type { PaymentMethod, Session } from '@/lib/sessions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type RecordStep = 'search' | 'payment'

export default function SeancesPage() {
  const router = useRouter()
  const { clients } = useClients()
  const { getSessionsForToday, recordSession } = useSessions()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [step, setStep] = useState<RecordStep>('search')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [confirmation, setConfirmation] = useState<Session | null>(null)

  const todaysSessions = getSessionsForToday()

  const clientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? 'Client inconnu'

  const openDialog = () => {
    setStep('search')
    setSelectedClient(null)
    setPaymentMethod('cash')
    setDialogOpen(true)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setStep('payment')
  }

  const handleConfirm = () => {
    if (!selectedClient) return
    const created = recordSession({ clientId: selectedClient.id, paymentMethod })
    setDialogOpen(false)
    setConfirmation(created)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Séances journalières</h1>
          <p className="text-sm text-muted-foreground">
            {todaysSessions.length} séance{todaysSessions.length > 1 ? 's' : ''} aujourd'hui.
          </p>
        </div>
        <Button className="bg-gradient-brand text-primary-foreground sm:w-auto" onClick={openDialog}>
          Enregistrer une séance
        </Button>
      </div>

      {todaysSessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune séance aujourd'hui"
          description="Les séances enregistrées aujourd'hui apparaîtront ici."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Heure</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Paiement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {todaysSessions.map((session) => (
              <TableRow key={session.id} onClick={() => router.push(`/clients/${session.clientId}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={clientName(session.clientId)} />
                    <span className="font-medium">{clientName(session.clientId)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell className="text-muted-foreground">{currency(session.amountPaid)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {session.paymentMethod === 'cash' && 'Espèces'}
                  {session.paymentMethod === 'card' && 'Carte'}
                  {session.paymentMethod === 'mobile_money' && 'Mobile Money'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer une séance</DialogTitle>
          <DialogDescription>
            {step === 'search' ? 'Recherchez le client concerné.' : 'Choisissez le mode de paiement.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'search' ? (
          <ClientSearch clients={clients} onSelect={handleSelectClient} />
        ) : (
          selectedClient && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={selectedClient.name} />
                <span className="text-sm font-medium">{selectedClient.name}</span>
              </div>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep('search')}>
                  Retour
                </Button>
                <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirm}>
                  Confirmer
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {confirmation && (
          <SessionConfirmation
            amountPaid={confirmation.amountPaid}
            paymentMethod={confirmation.paymentMethod}
            checkedInAt={confirmation.checkedInAt}
          />
        )}
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, navigate to `/seances` as a logged-in staff user.
Expected: page shows today's mocked sessions (from Task 2's `sess1`–`sess3`) in a table; clicking "Enregistrer une séance" opens the search dialog; typing a client name/phone filters results; selecting a client moves to the payment step; confirming closes the dialog and shows the confirmation dialog with the correct amount (should read the current `DEFAULT_SETTINGS.sessionPrice`, i.e. 8€ unless changed); the new session appears in the table after closing the confirmation.

- [ ] **Step 5: Commit**

```bash
git add app/\(staff\)/layout.tsx app/\(staff\)/seances/page.tsx
git commit -m "feat: build /seances page and mount settings/sessions providers"
```

---

### Task 7: Client profile — Historique des séances section

**Files:**
- Modify: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `useSessions()` (Task 3), `PaymentMethodPicker` + `SessionConfirmation` (Task 4).

This task replaces exactly the "Historique des séances" `Card` (lines 121-136 in the current file) with a real history list plus a quick-record action. Every other part of the file (client header, edit/delete dialogs, the Abonnement card, its dialogs) is untouched.

- [ ] **Step 1: Add imports and session-related state**

At the top of `app/(staff)/clients/[id]/page.tsx`, the file already imports `PaymentMethod` from `@/lib/subscriptions/types` (used by the existing Abonnement form) — reuse that exact import for the séance state below; do not re-import or alias it. Add these new import lines alongside the existing subscription imports:

```typescript
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { useSessions } from '@/components/providers/sessions-provider'
import type { Session } from '@/lib/sessions/types'
```

Add new state alongside the existing `subscriptionFormOpen`/`confirmation` state:

```typescript
const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
const [sessionPaymentMethod, setSessionPaymentMethod] = useState<PaymentMethod>('cash')
const [sessionConfirmation, setSessionConfirmation] = useState<Session | null>(null)
```

Add the hook call alongside `useSubscriptions()`:

```typescript
const { getSessionsForClient, recordSession } = useSessions()
```

And compute the history list alongside `currentSubscription`/`history`:

```typescript
const sessionHistory = getSessionsForClient(client.id)
```

Add the two handlers alongside `handleSuspend`/`handleReactivate`:

```typescript
const handleRecordSession = () => {
  setSessionPaymentMethod('cash')
  setSessionDialogOpen(true)
}

const handleConfirmSession = () => {
  const created = recordSession({ clientId: client.id, paymentMethod: sessionPaymentMethod })
  setSessionDialogOpen(false)
  setSessionConfirmation(created)
}
```

- [ ] **Step 2: Replace the "Historique des séances" Card**

Replace this block (current lines 121-136):

```tsx
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
```

With:

```tsx
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleRecordSession}>
              Enregistrer une séance
            </Button>
          </CardHeader>
          <CardContent>
            {sessionHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucune séance enregistrée.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sessionHistory.map((session) => (
                  <li key={session.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {new Date(session.checkedInAt).toLocaleDateString('fr-FR')}{' '}
                      {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>{currency(session.amountPaid)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
```

(`currency` is already defined at the top of this file for the Abonnement card — reused here, not redefined. `Button` is already imported.)

- [ ] **Step 3: Add the session dialogs**

After the existing subscription confirmation `Dialog` block (the one wrapping `SubscriptionConfirmation`), add two more dialogs, following the exact same open/close pattern:

```tsx
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer une séance</DialogTitle>
          <DialogDescription>Choisissez le mode de paiement pour {client.name}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <PaymentMethodPicker value={sessionPaymentMethod} onChange={setSessionPaymentMethod} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSessionDialogOpen(false)}>
              Annuler
            </Button>
            <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirmSession}>
              Confirmer
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={sessionConfirmation !== null} onOpenChange={(open) => !open && setSessionConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {sessionConfirmation && (
          <SessionConfirmation
            amountPaid={sessionConfirmation.amountPaid}
            paymentMethod={sessionConfirmation.paymentMethod}
            checkedInAt={sessionConfirmation.checkedInAt}
          />
        )}
      </Dialog>
```

Insert these immediately before the closing `</div>` that ends the component's returned JSX (i.e., as the last two dialogs in the file, after the subscription confirmation dialog).

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. In particular, confirm there is no duplicate `PaymentMethod` import and no unused `SessionPaymentMethod` alias left behind (Step 1 explicitly said not to add it — verify the final file doesn't contain it).

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate to a client profile (e.g. `/clients/cl3`, which has mocked session history from Task 2).
Expected: "Historique des séances" card shows past sessions (date, heure, montant) instead of the old "Bientôt disponible" placeholder; clicking "Enregistrer une séance" opens a payment-method dialog (no search step, client already known); confirming shows the confirmation dialog and the new session appears at the top of the history list.

- [ ] **Step 6: Commit**

```bash
git add app/\(staff\)/clients/\[id\]/page.tsx
git commit -m "feat: add session history and quick-record to client profile"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual smoke test of adjacent features**

Run: `npm run dev`. Verify `/clients`, `/clients/[id]` (Abonnement card + actions), and `/abonnements` still behave exactly as before this sub-project (no regressions from the provider nesting change in `app/(staff)/layout.tsx`).

- [ ] **Step 4: Commit** (only if Step 1-3 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in Gestion Séances regression pass"
```
