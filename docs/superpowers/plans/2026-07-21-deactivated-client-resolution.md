# Deactivated Client Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deactivated clients resolvable by id everywhere the app needs to show their name/details, using the backend's `GET /api/clients/[id]?includeInactive=true`. Fix the `/clients/[id]` fallback fetch to use it, add a clear "deactivated" state to that page, and fix the reported bug: `/seances` showing "Client inconnu" for a deactivated client's own already-recorded sessions.

**Architecture:** `getClientByIdRequest` always requests `includeInactive=true` — every current caller wants this. `/clients/[id]` gains a warning-toned banner and hides management actions when the resolved client is inactive. `/seances` gains a `useResolveSessionClient` hook built on `useQueries`, resolving any subscriber-session's `clientId` missing from the active client list via the same `['client', id]` query key already used by `/clients/[id]`'s fallback — the two screens share React Query's cache for free.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, `@tanstack/react-query`. No test framework in this repo — verify with `tsc --noEmit` and manual verification via the dev server.

## Global Constraints

- **The backend contract does not change** — this plan touches ONLY frontend files (`lib/`, `components/`, `app/`). `GET /api/clients/[id]?includeInactive=true` is already shipped (commit `af004e4`): returns `200` with `isActive: false` for a deactivated client when the param is present; unchanged `404` behavior without it.
- **`getClientByIdRequest` always appends `?includeInactive=true`**, hard-coded, no parameter — every current and planned caller (the `/clients/[id]` fallback, the new `/seances` resolution) wants this behavior; there is no caller that wants the old 404-on-inactive behavior.
- **`/clients/[id]`'s deactivated-client banner uses `warning` tone** (`components/ui/badge.tsx`'s existing `warning` variant color language — amber, not the `destructive` red), a `UserX` icon (lucide-react), positioned as a full-width element in the page's outer flex layout, above the main profile Card — not inside it.
- **Hidden when `!client.isActive`**: the "Désactiver" button, the "Enregistrer une séance" button, and all subscription action buttons/CTAs (Créer un abonnement, Renouveler, Suspendre, Réactiver). **Kept**: "Modifier", the QR code, all read-only history/subscription display. `ClientStatusBadge` (subscription status) is NOT modified — it's an orthogonal concept to the client's own active/inactive state.
- **No client-reactivation UI** — the backend does not expose an endpoint for it; do not invent one.
- **`/seances`'s resolved-but-inactive client gets `<Badge variant="muted">Désactivé</Badge>`** next to their name — the exact same visual treatment already used for `<Badge variant="muted">Visiteur</Badge>` on visitor-type sessions in the same table.
- **While a fallback resolution is loading, show `<Skeleton>` placeholders** (`components/ui/skeleton.tsx`) for both the avatar and the name text, instead of letting "Client inconnu" flash before being corrected.
- **The fallback query key is exactly `['client', clientId]`** — identical to the key `app/(staff)/clients/[id]/page.tsx` already uses for its own fallback fetch (`queryKey: ['client', params.id]`), so the two screens share React Query's cache.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (code blocks below are accurate as of plan-writing time; re-verify, since a separate backend-focused agent may land concurrent commits in this shared repo).
- French UI copy throughout, consistent with the rest of the app.
- This project's `tsc`/`next`/`npx` binary resolution has been unreliable in past sessions. If `npx tsc --noEmit` behaves suspiciously, fall back to `node "node_modules/.pnpm/typescript@<version>/node_modules/typescript/bin/tsc" --noEmit` (check the exact version via `ls node_modules/.pnpm | grep typescript` first).

---

## File Structure

```
lib/clients/fetch-clients.ts                — MODIFY: getClientByIdRequest always requests includeInactive=true
app/(staff)/clients/[id]/page.tsx            — MODIFY: deactivated-client banner, hide management actions
app/(staff)/seances/page.tsx                 — MODIFY: useResolveSessionClient hook, skeleton + Désactivé badge
```

---

## Task 1: `getClientByIdRequest` fix and `/clients/[id]` deactivated-client UI

**Files:**
- Modify: `lib/clients/fetch-clients.ts`
- Modify: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Produces: `getClientByIdRequest(id: string): Promise<Client | undefined>` — signature unchanged, only its internal URL changes. `Client.isActive` (already part of `lib/clients/types.ts`, unchanged) becomes load-bearing UI state on this page for the first time.

- [ ] **Step 1: Update `lib/clients/fetch-clients.ts`**

Current content (verify this matches before editing):

```typescript
export async function getClientByIdRequest(id: string): Promise<Client | undefined> {
  const response = await fetch(`/api/clients/${id}`)
  let envelope: ApiEnvelope<{ client: Client }>
  try {
    envelope = await response.json()
  } catch {
    return undefined
  }
  return envelope.success ? envelope.data.client : undefined
}
```

New content (only the fetch URL changes):

```typescript
export async function getClientByIdRequest(id: string): Promise<Client | undefined> {
  const response = await fetch(`/api/clients/${id}?includeInactive=true`)
  let envelope: ApiEnvelope<{ client: Client }>
  try {
    envelope = await response.json()
  } catch {
    return undefined
  }
  return envelope.success ? envelope.data.client : undefined
}
```

Also update the function's doc comment (immediately above it) to reflect the new behavior — find:

```typescript
/**
 * Fallback single-client lookup used when a client isn't present in the (paginated) in-memory
 * clients list — e.g. an active client beyond the first page. Unlike the other request helpers,
 * this treats a failed envelope (including a 404 "not found") as an expected, non-exceptional
 * `undefined` result rather than throwing, since callers use this purely to double-check before
 * concluding a client truly doesn't exist.
 */
```

Replace with:

```typescript
/**
 * Fallback single-client lookup used when a client isn't present in the (paginated, active-only)
 * in-memory clients list — e.g. an active client beyond the first page, or a deactivated client
 * (always requests `includeInactive=true`, since every current caller needs to resolve a
 * deactivated client's details, never just confirm they're gone). Unlike the other request
 * helpers, this treats a failed envelope (including a genuine 404 "not found") as an expected,
 * non-exceptional `undefined` result rather than throwing, since callers use this purely to
 * double-check before concluding a client truly doesn't exist.
 */
```

- [ ] **Step 2: Update `app/(staff)/clients/[id]/page.tsx`**

Current content (verify this matches before editing — targeted edits on a large file; re-read the live file first).

**2a. Add the `UserX` icon import.** Find:

```typescript
import { CalendarClock, CreditCard, Pencil, RefreshCw, Trash2, Users } from 'lucide-react'
```

Replace:

```typescript
import { CalendarClock, CreditCard, Pencil, RefreshCw, Trash2, UserX, Users } from 'lucide-react'
```

**2b. Wrap the return JSX's outer container to add the banner.** Find:

```typescript
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
```

Replace:

```typescript
  return (
    <div className="flex flex-col gap-6">
      {!client.isActive && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <UserX className="size-4 shrink-0" />
          <span>Ce client est désactivé — consultation seule.</span>
        </div>
      )}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
```

**2c. Hide the "Désactiver" button when the client is already inactive.** Find:

```typescript
              <Button variant="outline" onClick={handleOpenEdit}>
                <Pencil className="size-4" />
                Modifier
              </Button>
              <Button variant="destructive" onClick={handleOpenDeactivate}>
                <Trash2 className="size-4" />
                Désactiver
              </Button>
```

Replace:

```typescript
              <Button variant="outline" onClick={handleOpenEdit}>
                <Pencil className="size-4" />
                Modifier
              </Button>
              {client.isActive && (
                <Button variant="destructive" onClick={handleOpenDeactivate}>
                  <Trash2 className="size-4" />
                  Désactiver
                </Button>
              )}
```

**2d. Hide the "Enregistrer une séance" button.** Find:

```typescript
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleRecordSession}>
              Enregistrer une séance
            </Button>
```

Replace:

```typescript
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              Historique des séances
            </CardTitle>
            {client.isActive && (
              <Button size="sm" variant="outline" onClick={handleRecordSession}>
                Enregistrer une séance
              </Button>
            )}
```

**2e. Hide the subscription renew/suspend/reactivate buttons.** Find:

```typescript
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
```

Replace:

```typescript
                {client.isActive && (
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
                )}
```

**2f. Hide the "Créer un abonnement" CTA for the no-subscription case.** Find:

```typescript
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Aucun abonnement actif.</p>
                <Button size="sm" onClick={() => setSubscriptionFormOpen(true)}>
                  Créer un abonnement
                </Button>
              </div>
```

Replace:

```typescript
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Aucun abonnement actif.</p>
                {client.isActive && (
                  <Button size="sm" onClick={() => setSubscriptionFormOpen(true)}>
                    Créer un abonnement
                  </Button>
                )}
              </div>
```

Nothing else on this page changes — the dialogs themselves (`DeactivateClientDialog`, `SubscriptionForm`, the session dialog) stay mounted in the JSX but are simply never opened when their triggering buttons are hidden, so no dialog-level changes are needed. `client.isActive` is already part of the `Client` type (`lib/clients/types.ts`) and already flows through both `listClient` (from `useClients().getClient`) and `fallbackClientQuery.data` (from `getClientByIdRequest`, Step 1) — no new data-fetching needed on this page.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors in both touched files. Errors may remain in `app/(staff)/seances/page.tsx` if it's touched by a concurrent process — not expected from this task, but if seen, confirm they're pre-existing before treating them as this task's problem (this task doesn't touch that file).

- [ ] **Step 4: Manual verification**

Run the dev server (`superpowers:run`/`pnpm dev` against a running, seeded Postgres). Deactivate a client via `/clients/[id]` → "Désactiver" (or use one already deactivated from prior testing). Navigate directly to that client's `/clients/[id]` URL (or reach it via a session on `/seances` once Task 2 lands — for this task alone, direct URL navigation is enough). Confirm: the warning banner appears at the top; "Désactiver", "Enregistrer une séance", and all subscription action buttons are gone; "Modifier" still works; the QR code and history sections still render normally. Confirm an ACTIVE client's page is completely unaffected (no banner, all buttons present).

- [ ] **Step 5: Commit**

```bash
git add lib/clients/fetch-clients.ts "app/(staff)/clients/[id]/page.tsx"
git commit -m "feat: resolve and display deactivated clients on the client detail page"
```

---

## Task 2: `/seances` deactivated-client name resolution

**Files:**
- Modify: `app/(staff)/seances/page.tsx`

**Interfaces:**
- Consumes: `getClientByIdRequest` (Task 1, now requests `includeInactive=true`); `useQueries` (`@tanstack/react-query`); `Skeleton` (`components/ui/skeleton.tsx`); `Badge` (`components/ui/badge.tsx`, already imported in this file).
- Produces:
  ```typescript
  type ResolvedSessionClient = { name: string; isLoading: boolean; isInactive: boolean }
  function useResolveSessionClient(
    clients: Client[],
    missingClientIds: string[],
  ): (clientId: string) => ResolvedSessionClient
  ```
  Internal to this file — no other file consumes it.

- [ ] **Step 1: Update `app/(staff)/seances/page.tsx`**

Current content (verify this matches before editing — full file, 283 lines, reproduced here for the implementer's convenience; VERIFY against the actual current file first).

**1a. Add imports.** Find:

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
import { ClientIdentification } from '@/components/scan/client-identification'
import { IneligibilityNotice } from '@/components/scan/ineligibility-notice'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { VisitorSessionForm } from '@/components/sessions/visitor-session-form'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { checkSessionEligibility } from '@/lib/sessions/eligibility'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'
```

Replace:

```typescript
// app/(staff)/seances/page.tsx
'use client'

import { useQueries } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { ClientIdentification } from '@/components/scan/client-identification'
import { IneligibilityNotice } from '@/components/scan/ineligibility-notice'
import { PaymentMethodPicker } from '@/components/sessions/payment-method-picker'
import { SessionConfirmation } from '@/components/sessions/session-confirmation'
import { VisitorSessionForm } from '@/components/sessions/visitor-session-form'
import { useClients } from '@/components/providers/clients-provider'
import { useSessions } from '@/components/providers/sessions-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { checkSessionEligibility } from '@/lib/sessions/eligibility'
import { getClientByIdRequest } from '@/lib/clients/fetch-clients'
import type { Client } from '@/lib/clients/types'
import type { Session } from '@/lib/sessions/types'
import type { PaymentMethod } from '@/lib/subscriptions/types'
```

**1b. Add the `useResolveSessionClient` hook.** Insert immediately after the `currency` helper and before `type SubscriberStep`. Find:

```typescript
const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type SubscriberStep = 'identify' | 'payment'
```

Replace:

```typescript
const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

type ResolvedSessionClient = { name: string; isLoading: boolean; isInactive: boolean }

// Resolves a subscriber session's clientId to a display name even when the client isn't in the
// active-only `clients` list (deactivated, or beyond the list's page size). Falls back to a
// per-id React Query lookup, sharing the exact `['client', id]` cache key that
// app/(staff)/clients/[id]/page.tsx's own fallback fetch already uses.
function useResolveSessionClient(
  clients: Client[],
  missingClientIds: string[],
): (clientId: string) => ResolvedSessionClient {
  const fallbackQueries = useQueries({
    queries: missingClientIds.map((id) => ({
      queryKey: ['client', id],
      queryFn: () => getClientByIdRequest(id),
    })),
  })

  return (clientId: string): ResolvedSessionClient => {
    const listClient = clients.find((c) => c.id === clientId)
    if (listClient) {
      return { name: listClient.name, isLoading: false, isInactive: false }
    }

    const index = missingClientIds.indexOf(clientId)
    const query = index >= 0 ? fallbackQueries[index] : undefined

    if (!query || query.isLoading) {
      return { name: '', isLoading: true, isInactive: false }
    }
    if (query.data) {
      return { name: query.data.name, isLoading: false, isInactive: !query.data.isActive }
    }
    return { name: 'Client inconnu', isLoading: false, isInactive: false }
  }
}

type SubscriberStep = 'identify' | 'payment'
```

**1c. Compute `missingClientIds` and call the hook in `SeancesPage`, replacing the old `clientName` helper.** Find:

```typescript
export default function SeancesPage() {
  const router = useRouter()
  const { clients, clientRepository, isLoading, isError, refetch } = useClients()
  const { getSessionsForToday, recordSubscriberSession, recordVisitorSession } = useSessions()

  const [subscriberDialogOpen, setSubscriberDialogOpen] = useState(false)
  const [subscriberStep, setSubscriberStep] = useState<SubscriberStep>('identify')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false)

  const [confirmation, setConfirmation] = useState<Session | null>(null)
  const [confirmationClientName, setConfirmationClientName] = useState<string | undefined>(undefined)

  const todaysSessions = getSessionsForToday()

  const clientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? 'Client inconnu'
```

Replace:

```typescript
export default function SeancesPage() {
  const router = useRouter()
  const { clients, clientRepository, isLoading, isError, refetch } = useClients()
  const { getSessionsForToday, recordSubscriberSession, recordVisitorSession } = useSessions()

  const [subscriberDialogOpen, setSubscriberDialogOpen] = useState(false)
  const [subscriberStep, setSubscriberStep] = useState<SubscriberStep>('identify')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')

  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false)

  const [confirmation, setConfirmation] = useState<Session | null>(null)
  const [confirmationClientName, setConfirmationClientName] = useState<string | undefined>(undefined)

  const todaysSessions = getSessionsForToday()

  const missingClientIds = useMemo(() => {
    const ids = new Set<string>()
    for (const session of todaysSessions) {
      if (session.type === 'subscriber' && !clients.some((c) => c.id === session.clientId)) {
        ids.add(session.clientId)
      }
    }
    return [...ids]
  }, [todaysSessions, clients])

  const resolveSessionClient = useResolveSessionClient(clients, missingClientIds)
```

**1d. Update the session table row rendering to use `resolveSessionClient` once per row, with skeleton and badge.** Find:

```typescript
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
```

Replace:

```typescript
            {todaysSessions.map((session) => {
              const resolved = session.type === 'subscriber' ? resolveSessionClient(session.clientId) : null

              return (
                <TableRow
                  key={session.id}
                  onClick={session.type === 'subscriber' ? () => router.push(`/clients/${session.clientId}`) : undefined}
                  className={session.type === 'visitor' ? 'cursor-default' : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {resolved?.isLoading ? (
                        <>
                          <Skeleton className="size-8 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </>
                      ) : (
                        <>
                          <Avatar name={session.type === 'subscriber' ? (resolved?.name ?? '') : session.fullName} />
                          <span className="font-medium">
                            {session.type === 'subscriber' ? resolved?.name : session.fullName}
                          </span>
                          {session.type === 'visitor' && <Badge variant="muted">Visiteur</Badge>}
                          {resolved?.isInactive && <Badge variant="muted">Désactivé</Badge>}
                        </>
                      )}
                    </div>
                  </TableCell>
```

This closes the `TableRow` inside a returned JSX block instead of the previous single-expression arrow — the rest of that `<TableRow>` (the 3 remaining `<TableCell>`s for heure/montant/paiement) stays exactly as it is today, just now inside this block's `return (...)`. Find the row's closing (immediately after the existing, unchanged cells):

```typescript
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
```

Replace:

```typescript
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
              )
            })}
```

Note the indentation of every line between the opening `{todaysSessions.map((session) => {` and this closing block increases by 2 spaces (now inside a block body, not a single JSX expression) — apply consistently across the whole mapped block, matching standard Prettier formatting for this codebase.

Nothing else in this file changes — `SubscriberEligibilityStep`, the dialogs, `handleIdentifyClient`, `handleConfirmSubscriber`, `handleConfirmVisitor`, and all other handlers are untouched.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide. This is the last file in this plan with any changes — confirm the whole project is clean.

- [ ] **Step 3: Manual verification**

Run the dev server. Record a subscriber session for an active client via "Enregistrer la séance d'un abonné" on `/seances` (confirm it appears in today's list with the correct name, no skeleton stuck showing). Then deactivate that same client via `/clients/[id]`. Return to `/seances`: confirm their already-recorded session row now shows their real name (not "Client inconnu") with a `<Badge variant="muted">Désactivé</Badge>` next to it, briefly showing a skeleton on first load if the cache was cold. Confirm a normal active client's session row is unaffected (no badge, no skeleton flash beyond the very first render). Confirm visitor-type session rows are completely unaffected (still show "Visiteur" badge, no interaction with the new resolution logic since `resolved` is `null` for them).

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/seances/page.tsx"
git commit -m "fix: resolve deactivated clients' names on the seances page"
```

---

## Task 3: Final regression pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `pnpm build` (or `npx next build`)
Expected: build succeeds, all routes generated.

- [ ] **Step 3: Constraint audit**

- Confirm `grep -n "includeInactive" lib/clients/fetch-clients.ts` shows exactly one match, inside `getClientByIdRequest`.
- Confirm no file under `server/`, `app/api/`, or `prisma/` appears in `git diff --name-only <baseline>..HEAD` for this plan's commits (baseline = the commit before Task 1 — check the ledger for the exact SHA).
- Confirm `grep -rn "clientName(" "app/(staff)/seances/page.tsx"` shows zero matches (the old helper is fully replaced by `resolveSessionClient`).
- Confirm `client.isActive` is referenced at least 5 times in `app/(staff)/clients/[id]/page.tsx` (the banner + 4 hidden-action-block conditions).

- [ ] **Step 4: Manual smoke test of adjacent, untouched features**

Verify `/clients` (list), `/abonnements`, `/scan`, and the client portal (`/connexion` → `/accueil`) are entirely unaffected — this plan only changes how deactivated clients are resolved and displayed on 2 staff screens.

- [ ] **Step 5: Commit** (only if Steps 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in deactivated-client-resolution regression pass"
```
