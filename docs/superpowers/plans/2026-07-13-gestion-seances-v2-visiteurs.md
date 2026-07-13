# Gestion Séances journalières — Révision 2 (Visiteurs occasionnels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second séance-recording path for occasional visitors who never become `Client` records, by turning `Session` into a discriminated union (`SubscriberSession | VisitorSession`), while preserving every subscriber-facing behavior already shipped (client history, non-blocking subscription status, settings-driven pricing).

**Architecture:** This plan modifies already-shipped code from the first Gestion Séances plan (`docs/superpowers/plans/2026-07-13-gestion-seances.md`, merged to `main`). It is a targeted revision, not a rewrite: `lib/sessions/types.ts` gains a discriminant, `SessionsProvider` gains a second creation method and narrows an existing one, `SessionConfirmation` changes its prop shape, `/seances` gains a second dialog, and `/clients/[id]` gets one call-site rename. No new architectural layer is introduced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, Lucide React icons. No test framework in this repo — verify with `npx tsc --noEmit` and `npm run build`.

## Global Constraints

- `Session` is `SubscriberSession | VisitorSession`, discriminated on `type: 'subscriber' | 'visitor'`. No optional-field modeling (`clientId?`, `fullName?`) anywhere — the union itself is the invariant enforcement mechanism.
- A `VisitorSession` must never cause a write to `ClientsProvider`. `recordVisitorSession` must not import or call anything from `components/providers/clients-provider.tsx`.
- The subscriber path's non-blocking subscription-status rule (established in the first plan) is unchanged: displaying `useClientStatus`/`ClientStatusBadge` during subscriber-session recording is purely informational and must never prevent calling `recordSubscriberSession`.
- `amountPaid` is still copied from `settings.sessionPrice` at creation time for both session types, and never recalculated afterward — this rule from the first plan is unchanged and applies identically to `recordVisitorSession`.
- `getSessionsForClient` must return `SubscriberSession[]` (not `Session[]`), using a type-predicate filter (`(s): s is SubscriberSession => ...`) — no `as` casts.
- `/seances` shows today-only sessions — unchanged, no date filter, no pagination.
- No PDF generation, no SMS, no share button anywhere in this plan (still out of scope — sous-projet 9).
- French UI copy throughout; `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })` for money, `toLocaleDateString('fr-FR')`/`toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })` for dates — matching the codebase's existing convention.
- Do not touch `app/(staff)/clients/page.tsx`, `app/(staff)/abonnements/page.tsx`, the Abonnement card/dialogs on `/clients/[id]`, or any subscriptions/clients files. This plan's only touch point on `/clients/[id]` is the "Historique des séances" card area and its existing session dialogs (already isolated from the Abonnement section by prior work).
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (do not assume the content shown in this plan's code blocks is still byte-for-byte current; it was accurate as of plan-writing time but re-verify).

---

### Task 1: Rewrite `Session` as a discriminated union

**Files:**
- Modify: `lib/sessions/types.ts`

**Interfaces:**
- Produces: `SessionBase` (not exported — internal building block), `SubscriberSession`, `VisitorSession`, `Session = SubscriberSession | VisitorSession`. Every later task consumes these three exported names.
- Consumes: `PaymentMethod` from `lib/subscriptions/types.ts` (unchanged).

- [ ] **Step 1: Replace the file's content**

Current content (verify this matches before editing):

```typescript
import type { PaymentMethod } from '@/lib/subscriptions/types'

export type Session = {
  id: string
  clientId: string
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: string // ISO datetime string
}
```

New content:

```typescript
// lib/sessions/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionBase = {
  id: string
  amountPaid: number // copied from settings.sessionPrice at creation time, never modified after
  paymentMethod: PaymentMethod
  checkedInAt: string // ISO datetime string
}

export type SubscriberSession = SessionBase & {
  type: 'subscriber'
  clientId: string
}

export type VisitorSession = SessionBase & {
  type: 'visitor'
  fullName: string
  phoneNumber: string
}

export type Session = SubscriberSession | VisitorSession
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: multiple errors, all originating from OTHER files that still use the old flat `Session` shape (`components/providers/sessions-provider.tsx`, `lib/sessions/mock-sessions.ts`, `app/(staff)/seances/page.tsx`, `app/(staff)/clients/[id]/page.tsx`, `components/sessions/session-confirmation.tsx`). This is expected — those files are fixed in Tasks 2-6. Confirm the errors are all `Property 'clientId' does not exist on type 'Session'` / `Object literal may only specify known properties` style errors in those specific files, not in `lib/sessions/types.ts` itself (which should have zero errors on its own).

- [ ] **Step 3: Commit**

```bash
git add lib/sessions/types.ts
git commit -m "feat: turn Session into a subscriber/visitor discriminated union"
```

---

### Task 2: Migrate mock data and update `SessionsProvider`

**Files:**
- Modify: `lib/sessions/mock-sessions.ts`
- Modify: `components/providers/sessions-provider.tsx`

**Interfaces:**
- Consumes: `SubscriberSession`, `VisitorSession`, `Session` from `lib/sessions/types.ts` (Task 1); `useSettings()` from `components/providers/settings-provider.tsx` (unchanged).
- Produces:
```typescript
type SessionsContextValue = {
  sessions: Session[]
  recordSubscriberSession(input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession
  recordVisitorSession(input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession
  getSessionsForClient(clientId: string): SubscriberSession[]
  getSessionsForToday(): Session[]
}
```
This REPLACES the previous `recordSession(input: { clientId; paymentMethod }): Session` method with two explicit methods. Later tasks (Task 4 `/seances` page, Task 5 `/clients/[id]`) call `recordSubscriberSession` and/or `recordVisitorSession` by these exact names — there is no more `recordSession`.

- [ ] **Step 1: Migrate `lib/sessions/mock-sessions.ts`**

Add `type: 'subscriber'` to every existing entry (they all have `clientId`, confirming they're subscriber sessions), and add two visitor entries — one from today, one from a previous day, using distinct fictional names/phone numbers not used elsewhere in the mock data:

```typescript
// lib/sessions/mock-sessions.ts
import type { Session } from './types'

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

export const mockSessions: Session[] = [
  { type: 'subscriber', id: 'sess1', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-2) },
  { type: 'subscriber', id: 'sess2', clientId: 'cl7', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-1) },
  { type: 'subscriber', id: 'sess3', clientId: 'cl12', amountPaid: 8, paymentMethod: 'mobile_money', checkedInAt: hoursFromNow(-0.5) },
  { type: 'subscriber', id: 'sess4', clientId: 'cl1', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-30) },
  { type: 'subscriber', id: 'sess5', clientId: 'cl3', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-54) },
  { type: 'visitor', id: 'sess6', fullName: 'Nadia Ferrand', phoneNumber: '+33698765432', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-3) },
  { type: 'visitor', id: 'sess7', fullName: 'Julien Roche', phoneNumber: '+33687654321', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-40) },
]
```

- [ ] **Step 2: Rewrite `components/providers/sessions-provider.tsx`**

```typescript
// components/providers/sessions-provider.tsx
'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useSettings } from '@/components/providers/settings-provider'
import { mockSessions } from '@/lib/sessions/mock-sessions'
import type { Session, SubscriberSession, VisitorSession } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionsContextValue = {
  sessions: Session[]
  recordSubscriberSession(input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession
  recordVisitorSession(input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession
  getSessionsForClient(clientId: string): SubscriberSession[]
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

  const recordSubscriberSession = useCallback(
    (input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession => {
      const created: SubscriberSession = {
        type: 'subscriber',
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

  const recordVisitorSession = useCallback(
    (input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession => {
      const created: VisitorSession = {
        type: 'visitor',
        id: `sess${Date.now()}`,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
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
    (clientId: string): SubscriberSession[] =>
      sessions
        .filter((s): s is SubscriberSession => s.type === 'subscriber' && s.clientId === clientId)
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
      value={{
        sessions,
        recordSubscriberSession,
        recordVisitorSession,
        getSessionsForClient,
        getSessionsForToday,
      }}
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

Note `recordVisitorSession` does not import or reference `ClientsProvider`/`useClients` anywhere — this is the enforcement point for "a visitor never creates a Client."

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors should now be reduced to only `components/sessions/session-confirmation.tsx`, `app/(staff)/seances/page.tsx`, and `app/(staff)/clients/[id]/page.tsx` (fixed in Tasks 3-5). `lib/sessions/mock-sessions.ts` and `components/providers/sessions-provider.tsx` themselves should have zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/sessions/mock-sessions.ts components/providers/sessions-provider.tsx
git commit -m "feat: split SessionsProvider into subscriber/visitor recording methods"
```

---

### Task 3: Rewrite `SessionConfirmation` to accept the full `Session` union

**Files:**
- Modify: `components/sessions/session-confirmation.tsx`

**Interfaces:**
- Consumes: `Session` from `lib/sessions/types.ts` (Task 1).
- Produces: `SessionConfirmation` component with new props `{ session: Session; clientName?: string }`. This REPLACES the previous props shape (`{ amountPaid, paymentMethod, checkedInAt }`). Later tasks (Task 4, Task 5) must call it with the new shape.

- [ ] **Step 1: Replace the file's content**

Current content (verify this matches before editing):

```typescript
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

New content:

```typescript
// components/sessions/session-confirmation.tsx
import { CheckCircle2 } from 'lucide-react'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile_money: 'Mobile Money',
}

export function SessionConfirmation({
  session,
  clientName,
}: {
  session: Session
  clientName?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <div className="flex flex-col gap-1">
        {session.type === 'subscriber' ? (
          <p className="text-sm font-medium">{clientName ?? 'Client'}</p>
        ) : (
          <>
            <p className="text-sm font-medium">{session.fullName}</p>
            <p className="text-xs text-muted-foreground">{session.phoneNumber}</p>
          </>
        )}
        <p className="text-sm font-medium">{currency(session.amountPaid)}</p>
        <p className="text-xs text-muted-foreground">Paiement : {PAYMENT_LABELS[session.paymentMethod]}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(session.checkedInAt).toLocaleDateString('fr-FR')}{' '}
          {new Date(session.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs text-muted-foreground">Séance n°{session.id}</p>
      </div>
    </div>
  )
}
```

The added date (not just time) and the visible session id (`Séance n°{session.id}`) satisfy the spec's ticket traceability requirement (id, date/heure, montant, paiement, and — for visitors — name/phone) for both session types in one component.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/(staff)/seances/page.tsx` and `app/(staff)/clients/[id]/page.tsx` (both call `SessionConfirmation` with the old prop shape — fixed in Tasks 4-5).

- [ ] **Step 3: Commit**

```bash
git add components/sessions/session-confirmation.tsx
git commit -m "feat: adapt SessionConfirmation to render both session types as a ticket"
```

---

### Task 4: Visitor session form component

**Files:**
- Create: `components/sessions/visitor-session-form.tsx`

**Interfaces:**
- Consumes: `PaymentMethodPicker` from `components/sessions/payment-method-picker.tsx` (unchanged, existing); `PaymentMethod` from `lib/subscriptions/types.ts`.
- Produces: `VisitorSessionForm` component, props `{ onSubmit: (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => void; onCancel: () => void; submitLabel: string }`. Consumed by Task 5 (`/seances` visitor dialog).

- [ ] **Step 1: Write `components/sessions/visitor-session-form.tsx`**

Follow the existing form pattern in this codebase (see `components/clients/client-form.tsx` or `components/subscriptions/subscription-form.tsx` for the established shape: controlled inputs, inline validation, `Button` footer):

```typescript
// components/sessions/visitor-session-form.tsx
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { PaymentMethodPicker } from './payment-method-picker'
import type { PaymentMethod } from '@/lib/subscriptions/types'

export function VisitorSessionForm({
  onSubmit,
  onCancel,
  submitLabel,
}: {
  onSubmit: (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fullName.trim().length === 0 || phoneNumber.trim().length === 0) {
      setError('Le nom et le téléphone sont obligatoires.')
      return
    }
    setError(null)
    onSubmit({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), paymentMethod })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-full-name">Nom complet</Label>
        <Input
          id="visitor-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom et prénom"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visitor-phone">Téléphone</Label>
        <Input
          id="visitor-phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+33…"
        />
      </div>
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
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

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (it is not yet consumed anywhere, so it cannot introduce integration errors — only check the file itself has none).

- [ ] **Step 3: Commit**

```bash
git add components/sessions/visitor-session-form.tsx
git commit -m "feat: add visitor session form component"
```

---

### Task 5: Rewire `/seances` page — two entry points, both dialogs, updated table

**Files:**
- Modify: `app/(staff)/seances/page.tsx`

**Interfaces:**
- Consumes: `recordSubscriberSession`, `recordVisitorSession`, `getSessionsForToday` from `useSessions()` (Task 2); `SessionConfirmation` (Task 3, new props); `VisitorSessionForm` (Task 4); `ClientSearch`, `PaymentMethodPicker` (unchanged, existing); `useClientStatus` from `components/clients/use-client-status.ts` (existing); `ClientStatusBadge` from `components/clients/client-status-badge.tsx` (existing); `Badge` from `components/ui/badge.tsx` (existing, for the "Visiteur" tag).

- [ ] **Step 1: Replace the file's content**

Current content — verify this matches before editing (it should, since Task 6 of the first plan is the only prior writer of this file):

```typescript
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
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

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

New content:

```typescript
// app/(staff)/seances/page.tsx
'use client'

import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { ClientSearch } from '@/components/sessions/client-search'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { VisitorSessionForm } from '@/components/sessions/visitor-session-form'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'

const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type SubscriberStep = 'search' | 'payment'

function SelectedClientStatus({ clientId }: { clientId: string }) {
  const status = useClientStatus(clientId)
  return <ClientStatusBadge status={status} />
}

export default function SeancesPage() {
  const router = useRouter()
  const { clients } = useClients()
  const { getSessionsForToday, recordSubscriberSession, recordVisitorSession } = useSessions()

  const [subscriberDialogOpen, setSubscriberDialogOpen] = useState(false)
  const [subscriberStep, setSubscriberStep] = useState<SubscriberStep>('search')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false)

  const [confirmation, setConfirmation] = useState<Session | null>(null)
  const [confirmationClientName, setConfirmationClientName] = useState<string | undefined>(undefined)

  const todaysSessions = getSessionsForToday()

  const clientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? 'Client inconnu'

  const openSubscriberDialog = () => {
    setSubscriberStep('search')
    setSelectedClient(null)
    setPaymentMethod('cash')
    setSubscriberDialogOpen(true)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setSubscriberStep('payment')
  }

  const handleConfirmSubscriber = () => {
    if (!selectedClient) return
    const created = recordSubscriberSession({ clientId: selectedClient.id, paymentMethod })
    setSubscriberDialogOpen(false)
    setConfirmationClientName(selectedClient.name)
    setConfirmation(created)
  }

  const handleConfirmVisitor = (values: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }) => {
    const created = recordVisitorSession(values)
    setVisitorDialogOpen(false)
    setConfirmationClientName(undefined)
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setVisitorDialogOpen(true)}>
            Nouvelle séance journalière
          </Button>
          <Button className="bg-gradient-brand text-primary-foreground" onClick={openSubscriberDialog}>
            Enregistrer la séance d'un abonné
          </Button>
        </div>
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
              <TableRow
                key={session.id}
                onClick={session.type === 'subscriber' ? () => router.push(`/clients/${session.clientId}`) : undefined}
                className={session.type === 'visitor' ? 'cursor-default' : undefined}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={session.type === 'subscriber' ? clientName(session.clientId) : session.fullName} />
                    <span className="font-medium">
                      {session.type === 'subscriber' ? clientName(session.clientId) : session.fullName}
                    </span>
                    {session.type === 'visitor' && <Badge variant="muted">Visiteur</Badge>}
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

      <Dialog open={subscriberDialogOpen} onOpenChange={setSubscriberDialogOpen}>
        <DialogHeader>
          <DialogTitle>Enregistrer la séance d'un abonné</DialogTitle>
          <DialogDescription>
            {subscriberStep === 'search' ? 'Recherchez le client concerné.' : 'Choisissez le mode de paiement.'}
          </DialogDescription>
        </DialogHeader>
        {subscriberStep === 'search' ? (
          <ClientSearch clients={clients} onSelect={handleSelectClient} />
        ) : (
          selectedClient && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedClient.name} />
                  <span className="text-sm font-medium">{selectedClient.name}</span>
                </div>
                <SelectedClientStatus clientId={selectedClient.id} />
              </div>
              <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSubscriberStep('search')}>
                  Retour
                </Button>
                <Button type="button" className="bg-gradient-brand text-primary-foreground" onClick={handleConfirmSubscriber}>
                  Confirmer
                </Button>
              </div>
            </div>
          )
        )}
      </Dialog>

      <Dialog open={visitorDialogOpen} onOpenChange={setVisitorDialogOpen}>
        <DialogHeader>
          <DialogTitle>Nouvelle séance journalière</DialogTitle>
          <DialogDescription>Saisissez les informations du visiteur.</DialogDescription>
        </DialogHeader>
        <VisitorSessionForm
          onSubmit={handleConfirmVisitor}
          onCancel={() => setVisitorDialogOpen(false)}
          submitLabel="Confirmer"
        />
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogHeader>
          <DialogTitle>Séance enregistrée</DialogTitle>
        </DialogHeader>
        {confirmation && <SessionConfirmation session={confirmation} clientName={confirmationClientName} />}
      </Dialog>
    </div>
  )
}
```

Key points for the implementer:
- `SelectedClientStatus` is a tiny inline component because `useClientStatus` is a hook and cannot be called conditionally inside the parent render — same pattern already used elsewhere in this codebase (e.g. `StatusFilteredRow` in `app/(staff)/clients/page.tsx`) for the same reason.
- The subscriber status badge is purely decorative here — it is not read anywhere in `handleConfirmSubscriber`, and nothing about its value affects whether the button is enabled or what happens on click. Do not add any conditional logic keyed on it.
- Visitor rows in the table have no `onClick` and a `cursor-default` class instead of the default row hover/click affordance — there's no client page to navigate to.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/(staff)/clients/[id]/page.tsx` (Task 6).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, navigate to `/seances`.
Expected: two buttons in the header ("Nouvelle séance journalière", "Enregistrer la séance d'un abonné"). Today's table shows both mocked subscriber sessions and the mocked visitor session (`sess6`, "Nadia Ferrand", with a "Visiteur" badge, non-clickable row). Clicking "Nouvelle séance journalière" opens a form (name, phone, payment method); submitting with empty fields shows inline validation; a valid submission closes the form and shows the confirmation/ticket with the visitor's name, phone, amount, payment method, date/time, and session id. Clicking "Enregistrer la séance d'un abonné" opens client search; selecting a client shows their subscription status badge next to their name (informational, doesn't block); confirming works regardless of the badge shown.

- [ ] **Step 4: Commit**

```bash
git add app/\(staff\)/seances/page.tsx
git commit -m "feat: add visitor session entry point alongside subscriber flow on /seances"
```

---

### Task 6: Update `/clients/[id]` call sites

**Files:**
- Modify: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `recordSubscriberSession` from `useSessions()` (Task 2, renamed from `recordSession`); `SessionConfirmation` new props (Task 3).

This task is a narrow, mechanical update — only three call sites change. No new UI, no new state. The Abonnement card, client header, and edit/delete dialogs are untouched.

- [ ] **Step 1: Update the `useSessions()` destructure**

Find:
```typescript
const { getSessionsForClient, recordSession } = useSessions()
```

Replace with:
```typescript
const { getSessionsForClient, recordSubscriberSession } = useSessions()
```

- [ ] **Step 2: Update the confirm handler**

Find:
```typescript
const handleConfirmSession = () => {
  const created = recordSession({ clientId: client.id, paymentMethod: sessionPaymentMethod })
  setSessionDialogOpen(false)
  setSessionConfirmation(created)
}
```

Replace with:
```typescript
const handleConfirmSession = () => {
  const created = recordSubscriberSession({ clientId: client.id, paymentMethod: sessionPaymentMethod })
  setSessionDialogOpen(false)
  setSessionConfirmation(created)
}
```

- [ ] **Step 3: Update the `SessionConfirmation` call**

Find:
```typescript
{sessionConfirmation && (
  <SessionConfirmation
    amountPaid={sessionConfirmation.amountPaid}
    paymentMethod={sessionConfirmation.paymentMethod}
    checkedInAt={sessionConfirmation.checkedInAt}
  />
)}
```

Replace with:
```typescript
{sessionConfirmation && (
  <SessionConfirmation session={sessionConfirmation} clientName={client.name} />
)}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project. This is the last file with outstanding errors from Task 1's type change — confirm they're all resolved now.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate to `/clients/cl3` (has existing mocked subscriber session history).
Expected: "Historique des séances" card still shows the existing session history unchanged (all subscriber sessions, since `getSessionsForClient` now only returns those — no visible difference from before, since this client never had visitor sessions to begin with). Clicking "Enregistrer une séance" still opens the payment-method dialog (unchanged UI), confirming shows the enriched confirmation (now including client name, session id) and the new session appears at the top of the history.

- [ ] **Step 6: Commit**

```bash
git add app/\(staff\)/clients/\[id\]/page.tsx
git commit -m "fix: adapt client profile session recording to renamed provider method"
```

---

### Task 7: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no errors, all routes generated including `/seances`.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. Verify:
- `/seances`: both entry points work end-to-end (subscriber flow with status badge shown informationally; visitor flow with validation and ticket).
- `/clients/[id]` (e.g. `/clients/cl3`): Abonnement card and its actions (Renouveler/Suspendre/Réactiver) behave exactly as before this revision — no regression from the `Session` type change. Session history section unaffected.
- `/clients`, `/abonnements`: unaffected by this revision (no files in this plan touch them) — quick visual check only.
- Confirm no `Client` was created anywhere as a side effect of submitting the visitor form (check `/clients` list count before and after recording a visitor session — it must not change).

- [ ] **Step 4: Commit** (only if Step 1-3 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in Gestion Séances visitor-path regression pass"
```
