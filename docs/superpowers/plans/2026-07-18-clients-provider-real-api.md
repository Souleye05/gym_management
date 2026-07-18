# ClientsProvider Real API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ClientsProvider`'s in-memory mock data source with the real, now-shipped backend Clients API (`GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/[id]`), migrating all 5 consuming screens onto async data, real cuid-based ids, and a `deactivateClient` vocabulary that matches the backend's soft-delete semantics — while `Subscription`/`Session` data stays mocked (that's the next sub-project's job, explicitly out of scope here).

**Architecture:** `ClientsProvider` internals move from `useState` to React Query (`useQuery` for the list, `useMutation` for create/update/deactivate), mirroring the pattern already proven by `MyProfileProvider`. `ClientRepository` (search/findByCardNumber) becomes async, requiring `ClientSearch` and `ClientIdentification` to handle a pending state. `app/(staff)/layout.tsx` gains a `QueryClientProvider`. All 5 consumer screens are updated to match the new async, `deactivateClient`-named, `email: string | null` contract.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, `@tanstack/react-query` (already a dependency, added by the MyProfileProvider sub-project — no new install needed). No test framework in this repo — verify with `tsc --noEmit` and `next build`.

## Global Constraints

- **The real backend contract is exactly**: `GET /api/clients?q=&phone=&cardNumber=&page=&limit=` → `{ clients: Client[], total?: number }` (`total` present only for the paginated no-query-param path; absent — not `0`, not `null` — for `q`/`phone`/`cardNumber` results). `POST /api/clients` → `{ client: Client }` or a `409`/`400` failure. `PATCH /api/clients/[id]` → `{ client: Client }`. `DELETE /api/clients/[id]` → `{ }`/`null` data on success (soft-delete, sets `isActive: false` server-side — never a real row deletion). All wrapped in the existing `{ success, data, message, errors }` envelope (`server/shared/api-response.ts` — backend file, read-only reference, never modified by this plan).
- **This plan touches ONLY frontend files** — nothing under `server/`, `app/api/`, or `prisma/`. Per `ARCHITECTURE_RULES.md`'s Backend/Frontend split, the backend work (`listActive`, pagination, the auth guards on these routes) is already shipped and merged; this plan consumes it, never modifies it.
- **`Client.email` changes from `email?: string` to `email: string | null`.** Every existing read site that does `client.email && ...` or `initialValues?.email ?? ''` already treats `null` and `undefined` identically in JS (`&&`/`??` short-circuit on both) — these sites need NO code change, only the type update makes them officially correct instead of accidentally correct. Do not "fix" what isn't broken; verify with a comment/note in the relevant task instead of touching untouched call sites.
- **`Client.id` becomes a real backend cuid**, not `'cl1'`-style. **This creates a known, expected, temporary gap**: `lib/subscriptions/mock-subscriptions.ts` and `lib/sessions/mock-sessions.ts` still key their mock records on `clientId: 'cl1'`..`'cl18'` (Subscription/Session remain mocked per this project's sub-project sequencing). Once `ClientsProvider` serves real clients, `useClientStatus(realClientId)` / `getSubscriptionHistory(realClientId)` / `getSessionsForClient(realClientId)` will find no matches for ANY real client — every real client will display `status: 'none'` and empty session/subscription history on `/clients/[id]`, `/abonnements`, `/seances`, `/scan`. **This is expected and out of scope for this plan** — the design doc's own "Hors périmètre" section names the real `Subscription`/`Session` backend as "chantier suivant, explicitement débloqué par celui-ci." Do not attempt to patch this gap (e.g. by re-keying mock data) — it is resolved by a future sub-project, not this one. Note it explicitly in the final regression pass so nobody mistakes it for a bug introduced by this plan.
- **`deleteClient` is renamed to `deactivateClient` everywhere** — provider method, `DeleteClientDialog` component (renamed `DeactivateClientDialog`, new file), UI copy ("Supprimer" → "Désactiver"). The backend performs a soft-delete (`isActive: false`), never a real row deletion — the old name was misleading and is being corrected now, not preserved as a compat alias.
- **Phone validation in `ClientForm` is realigned to the backend's exact pattern** `/^\+\d{8,15}$/` (requires a leading `+`), replacing the current "at least 8 digits, no format check" rule — this avoids a round-trip to the server for an input that's already known to be invalid.
- **Mutations use callback-based `{ onSuccess?, onError? }` opts, not a synchronous return value** — this is required to surface a `409 phone-already-used` error to the specific form field (`phone`) that caused it, which a synchronous mock-style return can't express for an async failure.
- **`getClient(id)` stays synchronous**, reading whatever React Query has cached — returns `undefined` while the query is still loading, exactly like the mock's behavior on the very first render before `useState`'s initial value existed conceptually. No consumer's observable contract changes for this method.
- **`lib/clients/mock-clients.ts` is deleted** once `ClientsProvider` no longer imports it (confirmed via grep: `clients-provider.tsx` is its only importer today) — do not leave dead mock data behind.
- This project's `tsc`/`next`/`npx` binary resolution has been unreliable in past sessions (silently resolves to the wrong binary or fails to resolve at all, sometimes printing an error banner while still exiting 0). If `npx tsc --noEmit` behaves suspiciously (no output but you have reason to doubt it, or a visible error banner), fall back to the direct-path form: `node "node_modules/.pnpm/typescript@<version>/node_modules/typescript/bin/tsc" --noEmit` (check the exact version via `ls node_modules/.pnpm | grep typescript` first). Same pattern applies to `next build` via `node_modules/.pnpm/next@<version>_*/node_modules/next/dist/bin/next build` if `pnpm build`/`npx next build` misbehaves.
- French UI copy throughout, consistent with the rest of the app.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (the code blocks in this plan were accurate as of plan-writing time; re-verify, since a separate backend-focused agent may land concurrent commits in this shared repo).

---

## File Structure

```
lib/clients/types.ts                                    — MODIFY: Client.email → string | null, add isActive
lib/clients/fetch-clients.ts                             — CREATE: fetchClients, createClientRequest, updateClientRequest, deactivateClientRequest
lib/clients/repository.ts                                — MODIFY: ClientRepository → async (Promise-returning)
lib/clients/mock-clients.ts                              — DELETE (Task 5, once nothing imports it)

components/providers/clients-provider.tsx                — MODIFY: React Query rewrite, deactivateClient rename

components/clients/client-form.tsx                       — MODIFY: phone regex realigned to backend pattern
components/clients/delete-client-dialog.tsx               — DELETE, replaced by:
components/clients/deactivate-client-dialog.tsx           — CREATE: renamed component, "Désactiver" copy
components/sessions/client-search.tsx                     — MODIFY: async search with pending state
components/scan/client-identification.tsx                 — MODIFY: async findByCardNumber with pending state

app/(staff)/layout.tsx                                    — MODIFY: add QueryClientProvider
app/(staff)/clients/page.tsx                               — MODIFY: async list (isLoading/isError), addClient opts
app/(staff)/clients/[id]/page.tsx                          — MODIFY: async get/update/deactivate, renamed dialog
app/(staff)/abonnements/page.tsx                            — MODIFY: isLoading/isError passthrough (read-only consumer)
app/(staff)/seances/page.tsx                                — MODIFY: isLoading passthrough, async clientRepository
app/(staff)/scan/page.tsx                                   — MODIFY: async clientRepository via ClientIdentification
```

---

## Task 1: Frontend `Client` type, fetch functions, and async `ClientRepository`

**Files:**
- Modify: `lib/clients/types.ts`
- Create: `lib/clients/fetch-clients.ts`
- Modify: `lib/clients/repository.ts`

**Interfaces:**
- Consumes: nothing new at compile time — this task has no imports from `server/` (frontend cannot import backend code; the fetch functions define their own local wire-shape type, matching the real API's JSON contract by convention, same pattern as `lib/client-portal/fetch-my-profile.ts`).
- Produces:
  ```typescript
  // lib/clients/types.ts
  export type Client = {
    id: string
    name: string
    phone: string
    email: string | null
    cardNumber: string
    joinedAt: string
    isActive: boolean
  }

  // lib/clients/fetch-clients.ts
  export type ListClientsParams = { q?: string; page?: number; limit?: number }
  export type ListClientsResult = { clients: Client[]; total?: number }
  export type NewClientInput = { name: string; phone: string; email?: string }
  export type UpdateClientInput = Partial<Pick<Client, 'name' | 'phone' | 'email'>>

  export async function fetchClients(params: ListClientsParams): Promise<ListClientsResult>
  export async function createClientRequest(input: NewClientInput): Promise<Client>
  export async function updateClientRequest(id: string, input: UpdateClientInput): Promise<Client>
  export async function deactivateClientRequest(id: string): Promise<void>
  export async function findClientByCardNumberRequest(cardNumber: string): Promise<Client | undefined>

  // lib/clients/repository.ts
  export type AsyncClientRepository = {
    findByCardNumber(cardNumber: string): Promise<Client | undefined>
    search(query: string): Promise<Client[]>
  }
  ```
  Consumed by Task 2 (`ClientsProvider`). Named `AsyncClientRepository` (not `ClientRepository`) per the approved design doc (`2026-07-17-clients-provider-real-api-design.md`) — matches its `type AsyncClientRepository = { ... }` contract verbatim.

- [ ] **Step 1: Update `lib/clients/types.ts`**

Current content (verify this matches before editing):

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

New content:

```typescript
export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email: string | null
  cardNumber: string
  joinedAt: string
  isActive: boolean
}
```

- [ ] **Step 2: Write `lib/clients/fetch-clients.ts`**

Mirrors the envelope-unwrapping pattern already established in `lib/client-portal/fetch-my-profile.ts` (local `ApiEnvelope<T>` type, no `server/` import). Each function throws on `success: false`, propagating the backend's `message` verbatim so callers (React Query `onError`) can surface it.

```typescript
// lib/clients/fetch-clients.ts
import type { Client } from './types'

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

export type ListClientsParams = { q?: string; page?: number; limit?: number }
export type ListClientsResult = { clients: Client[]; total?: number }
export type NewClientInput = { name: string; phone: string; email?: string }
export type UpdateClientInput = Partial<Pick<Client, 'name' | 'phone' | 'email'>>

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  const envelope: ApiEnvelope<T> = await response.json()
  if (!envelope.success) {
    throw new Error(envelope.message || fallbackMessage)
  }
  return envelope.data
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const qs = searchParams.toString()
  return qs.length > 0 ? `?${qs}` : ''
}

export async function fetchClients(params: ListClientsParams): Promise<ListClientsResult> {
  const response = await fetch(`/api/clients${buildQuery(params)}`)
  return unwrap<ListClientsResult>(response, 'Impossible de charger la liste des clients.')
}

export async function createClientRequest(input: NewClientInput): Promise<Client> {
  const response = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ client: Client }>(response, "Impossible de créer le client.")
  return data.client
}

export async function updateClientRequest(id: string, input: UpdateClientInput): Promise<Client> {
  const response = await fetch(`/api/clients/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ client: Client }>(response, 'Impossible de modifier le client.')
  return data.client
}

export async function deactivateClientRequest(id: string): Promise<void> {
  const response = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
  await unwrap<unknown>(response, 'Impossible de désactiver le client.')
}

export async function findClientByCardNumberRequest(cardNumber: string): Promise<Client | undefined> {
  const result = await fetchClients({ q: undefined, page: undefined, limit: undefined })
  // placeholder — see Step 3 note below, this function's real implementation queries ?cardNumber= directly
  return result.clients[0]
}
```

**Implementer note on `findClientByCardNumberRequest`**: the placeholder body above is WRONG on purpose — replace it with a direct `?cardNumber=` query, matching the backend's exact-match `cardNumber` param (confirmed already supported by `list-clients.controller.ts`, unchanged by the recent `listActive` work):

```typescript
export async function findClientByCardNumberRequest(cardNumber: string): Promise<Client | undefined> {
  const response = await fetch(`/api/clients?cardNumber=${encodeURIComponent(cardNumber)}`)
  const data = await unwrap<ListClientsResult>(response, 'Impossible de rechercher le client.')
  return data.clients[0]
}
```

(This plan's text above intentionally shows the wrong version first and then the correction — write the file with the CORRECTED version only; the "placeholder" block exists in this plan purely to make the correction impossible to miss, not as two steps to perform in sequence.)

- [ ] **Step 3: Rewrite `lib/clients/repository.ts`**

Current content (verify this matches before editing):

```typescript
import type { Client } from './types'

export type ClientRepository = {
  findByCardNumber(cardNumber: string): Client | undefined
  search(query: string): Client[]
}

export function createInMemoryClientRepository(clients: Client[]): ClientRepository {
  return {
    findByCardNumber: (cardNumber) => {
      const normalized = cardNumber.trim()
      return clients.find((c) => c.cardNumber === normalized)
    },
    search: (query) => {
      const normalizedQuery = query.trim().toLowerCase()
      if (normalizedQuery.length === 0) return []
      return clients.filter(
        (client) =>
          client.name.toLowerCase().includes(normalizedQuery) ||
          client.phone.toLowerCase().includes(normalizedQuery),
      )
    },
  }
}
```

New content — the in-memory implementation is replaced entirely by one backed by the real API. The factory function's name changes from `createInMemoryClientRepository` to `createApiClientRepository` (no longer in-memory) and no longer takes a `clients` array (it queries the network directly per call, not a locally-held snapshot):

```typescript
// lib/clients/repository.ts
import { findClientByCardNumberRequest, fetchClients } from './fetch-clients'
import type { Client } from './types'

export type AsyncClientRepository = {
  findByCardNumber(cardNumber: string): Promise<Client | undefined>
  search(query: string): Promise<Client[]>
}

export function createApiClientRepository(): AsyncClientRepository {
  return {
    findByCardNumber: (cardNumber) => findClientByCardNumberRequest(cardNumber.trim()),
    search: async (query) => {
      const normalizedQuery = query.trim()
      if (normalizedQuery.length === 0) return []
      const result = await fetchClients({ q: normalizedQuery })
      return result.clients
    },
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in every current consumer of the old sync `ClientRepository`/`Client` shape (`components/providers/clients-provider.tsx`, `components/sessions/client-search.tsx`, `components/scan/client-identification.tsx`, all 5 page files) — expected, fixed in later tasks. Confirm the 3 files touched in this task themselves have zero errors.

- [ ] **Step 5: Commit**

```bash
git add lib/clients/types.ts lib/clients/fetch-clients.ts lib/clients/repository.ts
git commit -m "feat: add real Client fetch functions and async ClientRepository"
```

---

## Task 2: `ClientsProvider` on React Query

**Files:**
- Modify: `components/providers/clients-provider.tsx`

**Interfaces:**
- Consumes: `fetchClients`, `createClientRequest`, `updateClientRequest`, `deactivateClientRequest`, `NewClientInput`, `UpdateClientInput` (Task 1); `createApiClientRepository` (Task 1); `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query` (already installed).
- Produces (BREAKING CHANGE to an already-shipped provider — every consumer is updated in Tasks 3-7 of this same plan, nothing is left half-migrated):
  ```typescript
  type ClientsContextValue = {
    clients: Client[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
    clientRepository: AsyncClientRepository
    addClient(input: NewClientInput, opts?: { onSuccess?: (client: Client) => void; onError?: (message: string) => void }): void
    updateClient(id: string, input: UpdateClientInput, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
    deactivateClient(id: string, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
    getClient(id: string): Client | undefined
  }
  ```

- [ ] **Step 1: Rewrite `components/providers/clients-provider.tsx`**

Current content (verify this matches before editing — see Task-writing-time snapshot in this plan's introspection; re-read the live file since it predates this plan by several sub-projects).

New content:

```typescript
// components/providers/clients-provider.tsx
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import {
  createClientRequest,
  deactivateClientRequest,
  fetchClients,
  updateClientRequest,
  type NewClientInput,
  type UpdateClientInput,
} from '@/lib/clients/fetch-clients'
import { createApiClientRepository, type AsyncClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

const CLIENTS_QUERY_KEY = ['clients'] as const

type MutationOpts<TResult = void> = { onSuccess?: (result: TResult) => void; onError?: (message: string) => void }

type ClientsContextValue = {
  clients: Client[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  clientRepository: AsyncClientRepository
  addClient(input: NewClientInput, opts?: MutationOpts<Client>): void
  updateClient(id: string, input: UpdateClientInput, opts?: MutationOpts): void
  deactivateClient(id: string, opts?: MutationOpts): void
  getClient(id: string): Client | undefined
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function ClientsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => fetchClients({}),
  })

  const clients = query.data?.clients ?? []

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY })
  }, [queryClient])

  const addMutation = useMutation({
    mutationFn: createClientRequest,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClientInput }) => updateClientRequest(id, input),
  })

  const deactivateMutation = useMutation({
    mutationFn: deactivateClientRequest,
  })

  const addClient = useCallback(
    (input: NewClientInput, opts?: MutationOpts<Client>) => {
      addMutation.mutate(input, {
        onSuccess: (client) => {
          invalidate()
          opts?.onSuccess?.(client)
        },
        onError: (error) => opts?.onError?.(errorMessage(error, "Impossible de créer le client.")),
      })
    },
    [addMutation, invalidate],
  )

  const updateClient = useCallback(
    (id: string, input: UpdateClientInput, opts?: MutationOpts) => {
      updateMutation.mutate(
        { id, input },
        {
          onSuccess: () => {
            invalidate()
            opts?.onSuccess?.()
          },
          onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de modifier le client.')),
        },
      )
    },
    [updateMutation, invalidate],
  )

  const deactivateClient = useCallback(
    (id: string, opts?: MutationOpts) => {
      deactivateMutation.mutate(id, {
        onSuccess: () => {
          invalidate()
          opts?.onSuccess?.()
        },
        onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de désactiver le client.')),
      })
    },
    [deactivateMutation, invalidate],
  )

  const getClient = useCallback((id: string) => clients.find((client) => client.id === id), [clients])

  const clientRepository = useMemo(() => createApiClientRepository(), [])

  return (
    <ClientsContext.Provider
      value={{
        clients,
        isLoading: query.isPending,
        isError: query.isError,
        refetch: () => query.refetch(),
        clientRepository,
        addClient,
        updateClient,
        deactivateClient,
        getClient,
      }}
    >
      {children}
    </ClientsContext.Provider>
  )
}

export function useClients(): ClientsContextValue {
  const ctx = useContext(ClientsContext)
  if (!ctx) throw new Error('useClients must be used within a ClientsProvider')
  return ctx
}
```

Note `clientRepository` no longer depends on `clients` (it's created once, `useMemo(() => ..., [])`) since `createApiClientRepository()` queries the network directly rather than filtering a locally-held array — this is a deliberate simplification versus the old in-memory version, not an oversight.

Note `invalidate()` after every successful mutation is the React-Query-idiomatic way to keep `clients` in sync post-mutation, standing in for the old mock's direct `setClients((prev) => ...)` — the design doc's own error-handling table calls out this exact pattern ("même pattern que `MyProfileProvider`" for the query side; mutations follow React Query's standard invalidate-on-success convention, which `MyProfileProvider` didn't need since it had no mutations).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: `components/providers/clients-provider.tsx` itself has zero errors. Consumer errors remain in the 5 page files plus `client-search.tsx`/`client-identification.tsx` — expected, fixed in Tasks 3-7.

- [ ] **Step 3: Commit**

```bash
git add components/providers/clients-provider.tsx
git commit -m "feat: rewrite ClientsProvider on React Query against the real Clients API"
```

---

## Task 3: Mount `QueryClientProvider` in the staff layout

**Files:**
- Modify: `app/(staff)/layout.tsx`

**Interfaces:**
- Consumes: `QueryClient`, `QueryClientProvider` from `@tanstack/react-query`.

- [ ] **Step 1: Add `QueryClientProvider` to `app/(staff)/layout.tsx`**

Current content (verify this matches before editing):

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

New content — `QueryClientProvider` must be an ancestor of `ClientsProvider` (which now calls `useQuery`/`useMutation`), created once via `useState(() => new QueryClient())` (never a bare `new QueryClient()` in the render body — that would recreate the client, and its cache, on every render):

```typescript
// app/(staff)/layout.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ClientsProvider } from '@/components/providers/clients-provider'
import { SettingsProvider } from '@/components/providers/settings-provider'
import { SessionsProvider } from '@/components/providers/sessions-provider'
import { SubscriptionsProvider } from '@/components/providers/subscriptions-provider'
import { useAuth } from '@/components/providers/user-provider'

function StaffGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, status } = useAuth()
  const [queryClient] = useState(() => new QueryClient())

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
    <QueryClientProvider client={queryClient}>
      <ClientsProvider>
        <SubscriptionsProvider>
          <SettingsProvider>
            <SessionsProvider>
              <AppShell>{children}</AppShell>
            </SessionsProvider>
          </SettingsProvider>
        </SubscriptionsProvider>
      </ClientsProvider>
    </QueryClientProvider>
  )
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>
}
```

This is a SEPARATE `QueryClient` instance from the one already mounted in `app/(client)/layout.tsx` (the two layouts are already fully isolated render trees — a client user and a staff user never share a browser tab's React tree — so there is no cross-contamination risk and no reason to share a single global `QueryClient`).

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: same consumer errors as after Task 2 (5 page files, `client-search.tsx`, `client-identification.tsx`) — fixed in Tasks 4-7.

- [ ] **Step 3: Commit**

```bash
git add "app/(staff)/layout.tsx"
git commit -m "feat: mount QueryClientProvider for staff-side data fetching"
```

---

## Task 4: Async `ClientSearch` and `ClientIdentification`

**Files:**
- Modify: `components/sessions/client-search.tsx`
- Modify: `components/scan/client-identification.tsx`

**Interfaces:**
- Consumes: `AsyncClientRepository` (Task 1).
- Produces: `ClientSearch`'s external props (`{ clientRepository, onSelect }`) are UNCHANGED — only its internals change to handle an async `search()`. Same for `ClientIdentification`'s `{ clientRepository, onIdentified }`. Consumers of both components (Task 6, Task 7) do not need to change how they invoke these two components — only how they obtain `clientRepository` itself (already handled since `useClients().clientRepository` keeps the same shape from the caller's perspective).

- [ ] **Step 1: Rewrite `components/sessions/client-search.tsx`**

Current content (verify this matches before editing):

```typescript
'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { ClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

export function ClientSearch({
  clientRepository,
  onSelect,
}: {
  clientRepository: ClientRepository
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => clientRepository.search(query), [clientRepository, query])

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

New content — `useMemo` (synchronous) is replaced by a `useEffect`-driven fetch with local `results`/`isSearching` state. A request-id guard prevents an out-of-order older response from clobbering a newer one if the user types quickly (a real concern now that `search()` is a real network call with variable latency, unlike the old synchronous mock filter):

```typescript
'use client'

import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { AsyncClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

export function ClientSearch({
  clientRepository,
  onSelect,
}: {
  clientRepository: AsyncClientRepository
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setIsSearching(false)
      return
    }
    const requestId = ++requestIdRef.current
    setIsSearching(true)
    clientRepository.search(trimmed).then((clients) => {
      if (requestIdRef.current !== requestId) return // a newer search superseded this one
      setResults(clients)
      setIsSearching(false)
    })
  }, [clientRepository, query])

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
          {isSearching ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Recherche…</p>
          ) : results.length === 0 ? (
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

- [ ] **Step 2: Rewrite `components/scan/client-identification.tsx`**

Current content: already read in full during this plan's preparation — re-read the live file to confirm before editing, it is a substantial file (135 lines) and this plan will not repeat it verbatim here. The only change needed is to `resolveCardNumber`: it currently calls `clientRepository.findByCardNumber(cardNumber)` synchronously; it must now `await` the call. Apply this targeted change:

Find:

```typescript
  const resolveCardNumber = useCallback(
    (cardNumber: string) => {
      const client = clientRepository.findByCardNumber(cardNumber)
      if (client) {
        setNotFound(false)
        onIdentified(client)
      } else {
        setNotFound(true)
        scannerRef.current?.reset()
      }
    },
    [clientRepository, onIdentified],
  )
```

Replace with:

```typescript
  const resolveCardNumber = useCallback(
    async (cardNumber: string) => {
      const client = await clientRepository.findByCardNumber(cardNumber)
      if (client) {
        setNotFound(false)
        onIdentified(client)
      } else {
        setNotFound(true)
        scannerRef.current?.reset()
      }
    },
    [clientRepository, onIdentified],
  )
```

`resolveCardNumber` is called from two places in this file — `handleQrDetect` (via `resolveCardNumber(value)`, no `await`, fire-and-forget) and `handleCardNumberSubmit` (same, no `await`). Neither call site needs to change: a fire-and-forget async call is fine here since nothing downstream depends on `resolveCardNumber`'s own completion synchronously (the UI update happens inside the function via `setNotFound`/`onIdentified`, both of which fire correctly whenever the promise resolves). Do not add unnecessary `await`/loading-state plumbing here beyond what's needed — the QR/card-number identification path already has no visible "searching…" indicator today and this plan doesn't ask for one to be added (unlike `ClientSearch`, which already had a natural place for a status message).

This file also imports the repository type by name — apply this additional find/replace (the type was renamed in Task 1 from `ClientRepository` to `AsyncClientRepository`; without this edit the file won't compile since the old export no longer exists):

Find:

```typescript
import type { ClientRepository } from '@/lib/clients/repository'
```

Replace:

```typescript
import type { AsyncClientRepository } from '@/lib/clients/repository'
```

And wherever the component's props type declares `clientRepository: ClientRepository`, change it to `clientRepository: AsyncClientRepository` (same rename, applied to the prop type annotation — the file has exactly one such declaration, in `ClientIdentification`'s props type).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: both edited files have zero errors. Remaining errors confined to the 5 page files — fixed in Tasks 5-7.

- [ ] **Step 4: Commit**

```bash
git add components/sessions/client-search.tsx components/scan/client-identification.tsx
git commit -m "feat: make ClientSearch and ClientIdentification async"
```

---

## Task 5: `ClientForm`, rename `DeleteClientDialog` → `DeactivateClientDialog`

**Files:**
- Modify: `components/clients/client-form.tsx`
- Delete: `components/clients/delete-client-dialog.tsx`
- Create: `components/clients/deactivate-client-dialog.tsx`
- Delete: `lib/clients/mock-clients.ts`

**Interfaces:**
- Produces: `DeactivateClientDialog` (renamed from `DeleteClientDialog`, identical props shape `{ open, onOpenChange, clientName, onConfirm }`, "Désactiver" copy instead of "Supprimer"). `ClientForm`'s exported shape (`{ initialValues?, onSubmit, onCancel, submitLabel }`) is UNCHANGED — only its internal phone-validation regex changes.

- [ ] **Step 1: Realign phone validation in `components/clients/client-form.tsx`**

Current content (verify this matches before editing):

```typescript
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Client } from '@/lib/clients/types'

type ClientFormValues = {
  name: string
  phone: string
  email?: string
}

type ClientFormErrors = Partial<Record<'name' | 'phone' | 'email', string>>

function validate(values: { name: string; phone: string; email: string }): ClientFormErrors {
  const errors: ClientFormErrors = {}
  if (values.name.trim().length === 0) {
    errors.name = 'Le nom est requis.'
  }
  const digitCount = values.phone.replace(/\D/g, '').length
  if (digitCount < 8) {
    errors.phone = 'Numéro de téléphone invalide.'
  }
  if (values.email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Adresse e-mail invalide.'
  }
  return errors
}
```

Change ONLY the phone validation block inside `validate`:

Find:

```typescript
  const digitCount = values.phone.replace(/\D/g, '').length
  if (digitCount < 8) {
    errors.phone = 'Numéro de téléphone invalide.'
  }
```

Replace with:

```typescript
  if (!/^\+\d{8,15}$/.test(values.phone.trim())) {
    errors.phone = 'Le numéro doit commencer par + et contenir entre 8 et 15 chiffres.'
  }
```

Nothing else in this file changes — `initialValues?.email ?? ''` (line 44 in the current file) already handles `Client.email`'s new `string | null` type correctly with no edit needed (per this plan's Global Constraints note on `??`/`&&` already treating `null` and `undefined` identically).

- [ ] **Step 2: Create `components/clients/deactivate-client-dialog.tsx`**

```typescript
// components/clients/deactivate-client-dialog.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeactivateClientDialog({
  open,
  onOpenChange,
  clientName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  onConfirm: () => void
}) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Désactiver {clientName} ?</DialogTitle>
        <DialogDescription>
          Le client sera désactivé et n'apparaîtra plus dans les listes actives. Cette action ne supprime aucune donnée.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm}>
          Désactiver
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
```

Note the description copy is updated (not just the title/button) to correctly describe a soft-delete rather than the old, inaccurate "Cette action est irréversible." — a real client record is not destroyed, it's deactivated (matching the backend's actual, verified behavior).

- [ ] **Step 3: Delete the old files**

```bash
git rm components/clients/delete-client-dialog.tsx
git rm lib/clients/mock-clients.ts
```

(`lib/clients/mock-clients.ts` is deleted here rather than in a later task since its only importer, the old `clients-provider.tsx`, was already rewritten in Task 2 to no longer reference it — confirm this with a grep before deleting: `grep -rn "mock-clients" lib/ components/ app/` should show zero remaining matches after Task 2 landed.)

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors in `app/(staff)/clients/[id]/page.tsx` (still imports `DeleteClientDialog` from the now-deleted file) — expected, fixed in Task 6. Confirm `client-form.tsx` and the new `deactivate-client-dialog.tsx` have zero errors.

- [ ] **Step 5: Commit**

```bash
git add components/clients/client-form.tsx components/clients/deactivate-client-dialog.tsx
git commit -m "feat: realign phone validation, rename DeleteClientDialog to DeactivateClientDialog"
```

---

## Task 6: `/clients` and `/clients/[id]` pages

**Files:**
- Modify: `app/(staff)/clients/page.tsx`
- Modify: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `useClients()`'s new shape (Task 2: `isLoading`, `isError`, `refetch`, `deactivateClient`, async `clientRepository` via Task 4's updated components); `DeactivateClientDialog` (Task 5).

- [ ] **Step 1: Update `app/(staff)/clients/page.tsx`**

Re-read the live file before editing (137 lines already read during this plan's preparation — reproduced in full here for the implementer's convenience, but VERIFY against the actual current file first, since this is a large multi-task migration and other work may have landed).

Key changes needed, applied to the current file:

1. `useFilteredClients`'s `clientRepository.search(query)` call becomes async — this hook currently returns a plain array computed via `useMemo`; it must become stateful like `ClientSearch` in Task 4 (local `results`/`isSearching` state driven by a `useEffect`), OR — the simpler, preferred approach for this specific page — inline the same request-id-guarded `useEffect` pattern directly in `ClientsPage` rather than keeping a separate hook, since `useFilteredClients` has exactly one call site.

2. Add `isLoading`/`isError` handling from `useClients()`: a loading state shows a simple "Chargement…" message in place of the table (matching the pattern already established by `MyProfileProvider`'s consumers); an error state shows a message + "Réessayer" button calling `refetch()`.

3. `addClient` is now callback-based — `handleCreate` must pass `{ onSuccess, onError }` and surface a form-level error if creation fails (e.g. `409 phone-already-used`). `ClientForm` does not currently accept an external error prop — add one (`serverError?: string`, rendered above the submit buttons) since the existing `ClientFormErrors` state is for client-side validation only, and a `409` is a distinct, server-originated failure that arrives after client-side validation already passed.

Rewrite `components/clients/client-form.tsx` is NOT required for this — instead, `ClientForm` gains one new optional prop. Add to `client-form.tsx` (small addition, done as part of this task since it's needed to complete `/clients/page.tsx`'s error-surfacing requirement — note this in your task report as a cross-task file touch, expected and small):

```typescript
export function ClientForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  serverError,
}: {
  initialValues?: Pick<Client, 'name' | 'phone' | 'email'>
  onSubmit: (values: ClientFormValues) => void
  onCancel: () => void
  submitLabel: string
  serverError?: string
}) {
```

And render it just above the `<div className="flex justify-end gap-2 pt-2">` footer:

```typescript
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
```

Now the full rewrite of `app/(staff)/clients/page.tsx`:

```typescript
'use client'

import { Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  const { clients, isLoading, isError, refetch, addClient, clientRepository } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>(undefined)

  const [searchResults, setSearchResults] = useState<Client[] | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setSearchResults(null)
      return
    }
    const requestId = ++requestIdRef.current
    clientRepository.search(trimmed).then((results) => {
      if (requestIdRef.current !== requestId) return
      setSearchResults(results)
    })
  }, [clientRepository, query])

  const queryFiltered = searchResults ?? clients

  const handleCreate = (values: { name: string; phone: string; email?: string }) => {
    setCreateError(undefined)
    addClient(values, {
      onSuccess: () => setCreateOpen(false),
      onError: (message) => setCreateError(message),
    })
  }

  const handleOpenCreate = () => {
    setCreateError(undefined)
    setCreateOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger la liste des clients.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </div>
    )
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
          onClick={handleOpenCreate}
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
          serverError={createError}
        />
      </Dialog>
    </div>
  )
}
```

Note `queryFiltered = searchResults ?? clients` — when `query` is empty, `searchResults` is `null` and the full `clients` list (from the paginated `listActive` fetch) shows, matching the page's pre-existing "browse everyone by default" behavior; once a query is typed, `searchResults` holds the server's `search()` results instead. This preserves the exact UX the design doc's Option A decision was made to protect.

- [ ] **Step 2: Update `app/(staff)/clients/[id]/page.tsx`**

Targeted changes only — this file is large (334 lines) and most of it (Abonnement card, session card, session dialogs) is untouched by this plan; re-read the live file first, then apply exactly these changes:

1. Import rename: `DeleteClientDialog` → `DeactivateClientDialog` from the new file path.
2. `useClients()` destructure: `deleteClient` → `deactivateClient`.
3. `handleDelete` → `handleDeactivate`, using the callback form.
4. `getClient(id)` may return `undefined` while `isLoading` is true (not just "not found") — add an `isLoading` branch before the existing `!client` branch so a real client mid-fetch doesn't briefly flash the "Client introuvable" empty state.
5. `<DeleteClientDialog ... />` usage → `<DeactivateClientDialog ... />`.
6. `updateClient` becomes callback-based — `handleUpdate` needs an error path too, mirroring `handleCreate` in Task 6 Step 1. Reuse the same `serverError` prop added to `ClientForm`.

Apply these find/replace edits to the current file:

Find:
```typescript
import { DeleteClientDialog } from '@/components/clients/delete-client-dialog'
```
Replace:
```typescript
import { DeactivateClientDialog } from '@/components/clients/deactivate-client-dialog'
```

Find:
```typescript
  const { getClient, updateClient, deleteClient } = useClients()
```
Replace:
```typescript
  const { getClient, updateClient, deactivateClient, isLoading: clientsLoading } = useClients()
```

Find:
```typescript
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
```
Replace:
```typescript
  const [editOpen, setEditOpen] = useState(false)
  const [editError, setEditError] = useState<string | undefined>(undefined)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
```

Find:
```typescript
  const client = getClient(params.id)
  const clientStatus = useClientStatus(params.id)

  if (!client) {
```
Replace:
```typescript
  const client = getClient(params.id)
  const clientStatus = useClientStatus(params.id)

  if (clientsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (!client) {
```

Find:
```typescript
  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    updateClient(client.id, values)
    setEditOpen(false)
  }

  const handleDelete = () => {
    deleteClient(client.id)
    router.push('/clients')
  }
```
Replace:
```typescript
  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    setEditError(undefined)
    updateClient(client.id, values, {
      onSuccess: () => setEditOpen(false),
      onError: (message) => setEditError(message),
    })
  }

  const handleDeactivate = () => {
    deactivateClient(client.id, {
      onSuccess: () => router.push('/clients'),
    })
  }
```

Find:
```typescript
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Supprimer
              </Button>
```
Replace:
```typescript
              <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
                <Trash2 className="size-4" />
                Désactiver
              </Button>
```

Find:
```typescript
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
```
Replace:
```typescript
        <ClientForm
          initialValues={{ name: client.name, phone: client.phone, email: client.email }}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
          submitLabel="Enregistrer"
          serverError={editError}
        />
      </Dialog>

      <DeactivateClientDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        clientName={client.name}
        onConfirm={handleDeactivate}
      />
```

`ClientForm`'s `initialValues={{ name: client.name, phone: client.phone, email: client.email }}` — `client.email` is now `string | null` instead of `string | undefined`. This is passed into `Pick<Client, 'name' | 'phone' | 'email'>`, which is fine since `ClientForm`'s prop type is derived directly from `Client` — no separate type to update.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/(staff)/abonnements/page.tsx`, `app/(staff)/seances/page.tsx`, `app/(staff)/scan/page.tsx` — fixed in Task 7.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev` (ensure Postgres is running, migrated, seeded per this project's existing dev conventions). Log in as staff (`admin@atlas.fit`/`admin123`), navigate to `/clients`.
Expected: loading state briefly, then the real client list (seeded clients, if any — the dev DB's `Client` table may currently be empty or near-empty since it's separate from the old `'cl1'..'cl18'` mock; this is expected). Create a client via the "Ajouter un client" dialog with a fresh phone number, confirm it appears in the list after creation (no manual refresh needed — `invalidate()` should trigger the refetch automatically). Attempt to create a second client with the SAME phone number, confirm the `409 phone-already-used` error surfaces inline in the dialog (not a silent failure, not a thrown unhandled error). Open a client's profile, edit their name, confirm it persists after a page reload. Click "Désactiver", confirm the client disappears from `/clients`'s default list afterward (server-side `isActive: false` filtering already confirmed working by the backend's own tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(staff)/clients/page.tsx" "app/(staff)/clients/[id]/page.tsx" components/clients/client-form.tsx
git commit -m "feat: wire /clients and /clients/[id] to the real Clients API"
```

---

## Task 7: `/abonnements`, `/seances`, `/scan` — read-only and identification consumers

**Files:**
- Modify: `app/(staff)/abonnements/page.tsx`
- Modify: `app/(staff)/seances/page.tsx`
- Modify: `app/(staff)/scan/page.tsx`

**Interfaces:**
- Consumes: `useClients()`'s `isLoading` (Task 2); `ClientIdentification`'s unchanged external props, now backed by async `clientRepository` (Task 4).

These three screens are lighter touches than Task 6 — none of them create/edit/deactivate clients, they only read `clients` and/or pass `clientRepository` through to `ClientIdentification` (already made async in Task 4, no call-site change needed there).

- [ ] **Step 1: Add a loading guard to `app/(staff)/abonnements/page.tsx`**

Re-read the live file first. Add `isLoading` handling — insert immediately after the `useClients()` destructure and before the existing `useMemo`:

Find:
```typescript
  const { clients } = useClients()
```
Replace:
```typescript
  const { clients, isLoading } = useClients()
```

Find the component's `return (` statement (the outermost JSX return) and insert a loading guard immediately before it:

```typescript
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  return (
```

No other change needed — `clients` itself stays a plain `Client[]`, this page's own client-side name-substring filter (`useMemo`) is untouched, and it was never affected by the `ClientRepository`/`clientRepository` async change since this page doesn't use `clientRepository` at all.

- [ ] **Step 2: Add a loading guard to `app/(staff)/seances/page.tsx`**

Re-read the live file first. This page uses both `clients` (for `clientName()` lookups in the table) and `clientRepository` (passed through to `ClientIdentification`, already async-compatible per Task 4 — no change needed at that call site).

Find:
```typescript
  const { clients, clientRepository } = useClients()
```
Replace:
```typescript
  const { clients, clientRepository, isLoading } = useClients()
```

Insert a loading guard before the component's outermost `return (`:

```typescript
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  return (
```

No other change — `<ClientIdentification clientRepository={clientRepository} onIdentified={handleIdentifyClient} />` (used in the subscriber-session dialog) already works unchanged since `ClientIdentification`'s internals were made async in Task 4 without changing its external prop contract.

- [ ] **Step 3: `app/(staff)/scan/page.tsx` — confirm no change needed**

Re-read the live file. This page only destructures `clientRepository` from `useClients()` (never `clients` directly) and passes it straight to `ClientIdentification`. Since `ClientIdentification`'s prop contract is unchanged (Task 4), and this page has no client list of its own to show a loading state for, **no edit is expected here**. Verify this by reading the file and confirming `clientRepository` is its only `useClients()` usage — if that holds, this step is a no-op confirmation, not a code change. If the file has drifted from this description since this plan was written, apply the same `isLoading`-guard pattern as Steps 1-2 only if `clients` (the array, not `clientRepository`) is actually used somewhere in the file.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: ZERO errors across the whole project. This is the last file set in the plan with any outstanding compile error from the `ClientsProvider`/`ClientRepository` migration — confirm they're all resolved.

- [ ] **Step 5: Manual verification**

With the dev server still running: navigate to `/abonnements`, confirm the client list loads (briefly showing "Chargement…", then the table). Navigate to `/seances`, open "Enregistrer la séance d'un abonné", confirm all three identification methods (QR/card-number/search) still work against the real client list — search a real client's name, confirm they appear (async, may take a moment now, unlike the old instant mock filter). Navigate to `/scan`, repeat the same identification check.

**Expected, not a bug**: per this plan's Global Constraints, any client identified via any of these screens will show subscription status `'none'` and empty session/payment history, since `Subscription`/`Session` mock data is still keyed on the old `'cl1'..'cl18'` ids which no longer correspond to any real client. Confirm this is indeed what you observe (status badge reads "Aucun abonnement" for every real client) — if instead you see a crash or an unhandled error rather than a graceful "none" status, that IS a bug to investigate, since `useClientStatus`/`getCurrentSubscription` are designed to return `'none'`/`undefined` gracefully for an unknown `clientId`, never throw.

- [ ] **Step 6: Commit**

```bash
git add "app/(staff)/abonnements/page.tsx" "app/(staff)/seances/page.tsx" "app/(staff)/scan/page.tsx"
git commit -m "feat: add loading state to read-only Clients consumers"
```

(If Step 3 confirmed no change was needed for `scan/page.tsx`, the `git add` above naturally includes zero changes for that file — do not force an empty change into it just to justify staging it.)

---

## Task 8: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task validates the integration of all prior tasks.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project. If `npx tsc` behaves suspiciously per this plan's Global Constraints note, use the direct-path fallback.

- [ ] **Step 2: Production build**

Run: `pnpm build` (or `npx next build`)
Expected: build succeeds with no errors, all routes generated. If this fails due to an unrelated, pre-existing environment issue (this project has had a recurring `node_modules` corruption around `@alloc/quick-lru` in past sessions — check whether `pnpm install` resolves it before concluding this plan's code is at fault), document the failure clearly as environment-vs-code and do not attempt to force a `node_modules` repair that could disrupt a concurrent agent's checkout.

- [ ] **Step 3: Constraint audit (do not skip)**

- Confirm `lib/clients/mock-clients.ts` no longer exists (`git status`/`ls lib/clients/` should not show it) and grep confirms zero remaining references anywhere in the repo.
- Confirm `components/clients/delete-client-dialog.tsx` no longer exists, and zero remaining references to `DeleteClientDialog` anywhere (`grep -rn "DeleteClientDialog" app/ components/`).
- Confirm this plan touched ONLY frontend files — `git diff --name-only <baseline>..HEAD` (baseline = the commit before Task 1) should show no path under `server/`, `app/api/`, or `prisma/`.
- Confirm `deleteClient` no longer exists anywhere in `ClientsContextValue` or any consumer (`grep -rn "deleteClient" app/ components/ lib/` should return zero matches).

- [ ] **Step 4: Manual smoke test of adjacent, untouched features**

Verify `/parametres`, `/statistiques` (if they exist and render), and the client portal (`/connexion` → `/accueil`) are entirely unaffected — this plan never touches `app/(client)/` or anything outside the staff-side Clients migration.

- [ ] **Step 5: Commit** (only if Step 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in ClientsProvider real-API wiring regression pass"
```
