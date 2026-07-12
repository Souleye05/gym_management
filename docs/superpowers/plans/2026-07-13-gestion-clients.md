# Gestion Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/clients` stub with a working client directory: searchable/filterable list, create/edit/delete via a new reusable `Dialog`, and a basic profile page with reserved (stubbed) slots for history/payments — all backed by an in-memory React context seeded from mock data.

**Architecture:** A new `lib/clients/` module defines the `Client` type and ~18 mocked records. A `ClientsProvider` (React context, mounted inside the existing `(staff)` guard) holds `clients` state in memory and exposes `addClient`/`updateClient`/`deleteClient`/`getClient`. Two new generic UI primitives (`Dialog`, `Table`) are built first since the list and CRUD screens depend on them. A shared `ClientForm` component drives both the create and edit flows inside the same `Dialog`. The profile page uses `useParams()` (client-side, avoiding Next 15+'s async `params` prop entirely) to look up a client from the context.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `motion`, Lucide React. No test runner is configured in this repo — verification uses `tsc --noEmit`, `next build`, and manual/HTTP checks against the dev server, consistent with prior sub-projects' plans.

## Global Constraints

- Client state (`clients` array) lives in a React context, seeded once from `lib/clients/mock-clients.ts` via `useState(() => [...mockClients])`, never re-read after mount. No `localStorage`, no API calls.
- `addClient` generates `id`, `cardNumber` (format `CARD-<sequential>`), `status: 'none'`, and `joinedAt` (current ISO timestamp) — callers never supply these fields.
- `updateClient` only allows changing `name`, `phone`, `email` — never `id`, `cardNumber`, `status`, or `joinedAt` in this sub-project.
- No role restriction on delete — both `admin` and `agent` can create/edit/delete, matching the rest of the CRUD.
- History and payment sections on the profile page render `EmptyState` with a context-specific message — never a fake/empty table implying real data exists.
- `ClientsProvider` is mounted inside the existing `(staff)` route guard (only for authenticated staff), not at the root layout.
- Follow existing conventions: `'use client'` where hooks/interactivity are used, `cn()` from `@/lib/utils` for conditional classes, named exports for non-page components, default exports for Next.js page files, French UI text throughout.
- Do not modify `lib/mock-data.ts` (dashboard mocks) or `lib/auth/mock-client-directory.ts` (OTP directory) — the new client directory (`lib/clients/mock-clients.ts`) is a separate, unconnected data source.
- Do not add a role check, `localStorage` persistence, real QR/card rendering, or list sorting — all explicitly out of scope per the spec.

---

## File Structure

```
lib/clients/
  types.ts                        NEW — Client, ClientStatus
  mock-clients.ts                 NEW — ~18 mocked client records

components/providers/
  clients-provider.tsx            NEW — ClientsProvider, useClients()

components/ui/
  dialog.tsx                      NEW — Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter
  table.tsx                       NEW — Table, TableHeader, TableBody, TableRow, TableHead, TableCell

components/clients/
  client-form.tsx                 NEW — shared create/edit form (used inside Dialog)
  client-status-badge.tsx         NEW — maps ClientStatus to a Badge variant + label
  delete-client-dialog.tsx        NEW — confirmation dialog for delete

app/(staff)/
  layout.tsx                      MODIFY — mount ClientsProvider inside the guard
  clients/
    page.tsx                      REWRITE — list, search, filter, create
    [id]/
      page.tsx                    NEW — profile, edit, delete, history/payments stubs
```

---

### Task 1: Client type and mock data

**Files:**
- Create: `lib/clients/types.ts`
- Create: `lib/clients/mock-clients.ts`

**Interfaces:**
- Produces: `export type ClientStatus = 'active' | 'expiring' | 'expired' | 'none'`, `export type Client = { id: string; name: string; phone: string; email?: string; cardNumber: string; status: ClientStatus; joinedAt: string }`, `export const mockClients: Client[]`

- [ ] **Step 1: Create the type definitions**

```typescript
// lib/clients/types.ts
export type ClientStatus = 'active' | 'expiring' | 'expired' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email?: string
  cardNumber: string
  status: ClientStatus
  joinedAt: string
}
```

- [ ] **Step 2: Create the mock client directory**

```typescript
// lib/clients/mock-clients.ts
import type { Client } from './types'

export const mockClients: Client[] = [
  { id: 'cl1', name: 'Yasmine Kaddour', phone: '+33612345601', email: 'yasmine.kaddour@example.com', cardNumber: 'CARD-00001', status: 'active', joinedAt: '2025-09-12T09:00:00.000Z' },
  { id: 'cl2', name: 'Marc Delaunay', phone: '+33612345602', cardNumber: 'CARD-00002', status: 'active', joinedAt: '2025-10-03T09:00:00.000Z' },
  { id: 'cl3', name: 'Inès Fabre', phone: '+33612345603', email: 'ines.fabre@example.com', cardNumber: 'CARD-00003', status: 'expiring', joinedAt: '2025-11-18T09:00:00.000Z' },
  { id: 'cl4', name: 'Karim Benali', phone: '+33612345604', cardNumber: 'CARD-00004', status: 'active', joinedAt: '2025-08-27T09:00:00.000Z' },
  { id: 'cl5', name: 'Sofia Moretti', phone: '+33612345605', cardNumber: 'CARD-00005', status: 'expired', joinedAt: '2025-06-14T09:00:00.000Z' },
  { id: 'cl6', name: 'Thomas Girard', phone: '+33612345606', email: 'thomas.girard@example.com', cardNumber: 'CARD-00006', status: 'expiring', joinedAt: '2025-12-01T09:00:00.000Z' },
  { id: 'cl7', name: 'Léa Rousseau', phone: '+33612345607', cardNumber: 'CARD-00007', status: 'expiring', joinedAt: '2025-11-25T09:00:00.000Z' },
  { id: 'cl8', name: 'Omar Haddad', phone: '+33612345608', cardNumber: 'CARD-00008', status: 'active', joinedAt: '2025-07-09T09:00:00.000Z' },
  { id: 'cl9', name: 'Nadia Cherif', phone: '+33612345609', email: 'nadia.cherif@example.com', cardNumber: 'CARD-00009', status: 'active', joinedAt: '2025-05-22T09:00:00.000Z' },
  { id: 'cl10', name: 'Lucas Bernard', phone: '+33612345610', cardNumber: 'CARD-00010', status: 'active', joinedAt: '2025-09-30T09:00:00.000Z' },
  { id: 'cl11', name: 'Amel Ziani', phone: '+33612345611', cardNumber: 'CARD-00011', status: 'active', joinedAt: '2025-10-15T09:00:00.000Z' },
  { id: 'cl12', name: 'Hugo Lefevre', phone: '+33612345612', email: 'hugo.lefevre@example.com', cardNumber: 'CARD-00012', status: 'expired', joinedAt: '2025-04-11T09:00:00.000Z' },
  { id: 'cl13', name: 'Camille Dubois', phone: '+33612345613', cardNumber: 'CARD-00013', status: 'none', joinedAt: '2026-07-01T09:00:00.000Z' },
  { id: 'cl14', name: 'Antoine Petit', phone: '+33612345614', cardNumber: 'CARD-00014', status: 'none', joinedAt: '2026-07-05T09:00:00.000Z' },
  { id: 'cl15', name: 'Chloé Martin', phone: '+33612345615', email: 'chloe.martin@example.com', cardNumber: 'CARD-00015', status: 'active', joinedAt: '2025-08-08T09:00:00.000Z' },
  { id: 'cl16', name: 'Mehdi Alaoui', phone: '+33612345616', cardNumber: 'CARD-00016', status: 'expired', joinedAt: '2025-03-19T09:00:00.000Z' },
  { id: 'cl17', name: 'Julie Faure', phone: '+33612345617', cardNumber: 'CARD-00017', status: 'expiring', joinedAt: '2025-12-10T09:00:00.000Z' },
  { id: 'cl18', name: 'Rayan Boumediene', phone: '+33612345618', email: 'rayan.boumediene@example.com', cardNumber: 'CARD-00018', status: 'active', joinedAt: '2025-09-02T09:00:00.000Z' },
]
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/clients/types.ts lib/clients/mock-clients.ts
git commit -m "feat: add client type and mocked client directory"
```

---

### Task 2: ClientsProvider

**Files:**
- Create: `components/providers/clients-provider.tsx`

**Interfaces:**
- Consumes: `Client` from `lib/clients/types.ts` (Task 1), `mockClients` from `lib/clients/mock-clients.ts` (Task 1)
- Produces: `export function ClientsProvider({ children }: { children: ReactNode })`, `export function useClients(): { clients: Client[]; addClient(input: { name: string; phone: string; email?: string }): Client; updateClient(id: string, input: Partial<Pick<Client, 'name' | 'phone' | 'email'>>): void; deleteClient(id: string): void; getClient(id: string): Client | undefined }`

- [ ] **Step 1: Create the provider and hook**

```typescript
// components/providers/clients-provider.tsx
'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { mockClients } from '@/lib/clients/mock-clients'
import type { Client } from '@/lib/clients/types'

type NewClientInput = {
  name: string
  phone: string
  email?: string
}

type UpdateClientInput = Partial<Pick<Client, 'name' | 'phone' | 'email'>>

type ClientsContextValue = {
  clients: Client[]
  addClient(input: NewClientInput): Client
  updateClient(id: string, input: UpdateClientInput): void
  deleteClient(id: string): void
  getClient(id: string): Client | undefined
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

export function ClientsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>(() => [...mockClients])
  const sequenceRef = useRef(mockClients.length)

  const addClient = useCallback((input: NewClientInput) => {
    sequenceRef.current += 1
    const newClient: Client = {
      id: `cl${Date.now()}`,
      name: input.name,
      phone: input.phone,
      email: input.email,
      cardNumber: `CARD-${String(sequenceRef.current).padStart(5, '0')}`,
      status: 'none',
      joinedAt: new Date().toISOString(),
    }
    setClients((prev) => [...prev, newClient])
    return newClient
  }, [])

  const updateClient = useCallback((id: string, input: UpdateClientInput) => {
    setClients((prev) =>
      prev.map((client) => (client.id === id ? { ...client, ...input } : client)),
    )
  }, [])

  const deleteClient = useCallback((id: string) => {
    setClients((prev) => prev.filter((client) => client.id !== id))
  }, [])

  const getClient = useCallback(
    (id: string) => clients.find((client) => client.id === id),
    [clients],
  )

  return (
    <ClientsContext.Provider value={{ clients, addClient, updateClient, deleteClient, getClient }}>
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

Note: `id: \`cl${Date.now()}\`` is a simple, sufficiently-unique generator for an in-memory mock (no two clients are created in the same millisecond in practice within this app's manual-testing usage). `sequenceRef` (not `clients.length`) drives `cardNumber` numbering so deleting a client never causes a duplicate card number to be reissued.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/providers/clients-provider.tsx
git commit -m "feat: add ClientsProvider with in-memory CRUD state"
```

---

### Task 3: Dialog UI primitive

**Files:**
- Create: `components/ui/dialog.tsx`

**Interfaces:**
- Produces: `export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode })`, `export function DialogHeader({ children }: { children: ReactNode })`, `export function DialogTitle({ children }: { children: ReactNode })`, `export function DialogDescription({ children }: { children: ReactNode })`, `export function DialogFooter({ children }: { children: ReactNode })`

- [ ] **Step 1: Create the Dialog component family**

```typescript
// components/ui/dialog.tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      const panel = panelRef.current
      const focusable = panel?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover p-5 shadow-2xl"
            data-dialog-title-id={titleId}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 pb-4">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <h2 id={undefined} className="text-base font-semibold tracking-tight">
      {children}
    </h2>
  )
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={cn('flex justify-end gap-2 pt-4')}>{children}</div>
}
```

**Known simplification, apply now:** the `aria-labelledby={titleId}` wiring above is incomplete — `DialogTitle` doesn't receive or apply `titleId`, since `Dialog` and `DialogTitle` don't share props in this simple composition. Fix this before committing: pass the id down via a lightweight context instead of prop-drilling through every consumer.

Replace the file with this corrected version:

```typescript
// components/ui/dialog.tsx
'use client'

import { AnimatePresence, motion } from 'motion/react'
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const DialogTitleIdContext = createContext<string | undefined>(undefined)

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null
      const panel = panelRef.current
      const focusable = panel?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
          <DialogTitleIdContext.Provider value={titleId}>
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover p-5 shadow-2xl"
            >
              {children}
            </motion.div>
          </DialogTitleIdContext.Provider>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 pb-4">{children}</div>
}

export function DialogTitle({ children }: { children: ReactNode }) {
  const titleId = useContext(DialogTitleIdContext)
  return (
    <h2 id={titleId} className="text-base font-semibold tracking-tight">
      {children}
    </h2>
  )
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className={cn('flex justify-end gap-2 pt-4')}>{children}</div>
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "feat: add reusable Dialog component with focus management"
```

---

### Task 4: Table UI primitive

**Files:**
- Create: `components/ui/table.tsx`

**Interfaces:**
- Produces: `export function Table({ children }: { children: ReactNode })`, `export function TableHeader({ children }: { children: ReactNode })`, `export function TableBody({ children }: { children: ReactNode })`, `export function TableRow({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string })`, `export function TableHead({ children }: { children: ReactNode })`, `export function TableCell({ children, className }: { children: ReactNode; className?: string })`

- [ ] **Step 1: Create the Table component family**

```typescript
// components/ui/table.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function TableHeader({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border bg-muted/40">{children}</thead>
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>
}

export function TableRow({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        onClick && 'cursor-pointer transition-colors hover:bg-muted/50',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </th>
  )
}

export function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/table.tsx
git commit -m "feat: add reusable Table component"
```

---

### Task 5: Mount ClientsProvider in the staff layout

**Files:**
- Modify: `app/(staff)/layout.tsx`

**Interfaces:**
- Consumes: `ClientsProvider` from `@/components/providers/clients-provider` (Task 2)

- [ ] **Step 1: Wrap AppShell with ClientsProvider inside the guard**

Replace the full content of `app/(staff)/layout.tsx`:

```typescript
// app/(staff)/layout.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { ClientsProvider } from '@/components/providers/clients-provider'
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
      <AppShell>{children}</AppShell>
    </ClientsProvider>
  )
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffGuard>{children}</StaffGuard>
}
```

Only the `ClientsProvider` import and its wrapping around `<AppShell>{children}</AppShell>` changed — the guard logic itself is untouched from the previous sub-project's reviewed version.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(staff)/layout.tsx"
git commit -m "feat: mount ClientsProvider inside the staff route guard"
```

---

### Task 6: Client status badge helper

**Files:**
- Create: `components/clients/client-status-badge.tsx`

**Interfaces:**
- Consumes: `ClientStatus` from `@/lib/clients/types` (Task 1), `Badge` from `@/components/ui/badge` (existing)
- Produces: `export function ClientStatusBadge({ status }: { status: ClientStatus })`

- [ ] **Step 1: Create the badge mapping component**

```typescript
// components/clients/client-status-badge.tsx
import { Badge } from '@/components/ui/badge'
import type { ClientStatus } from '@/lib/clients/types'

const STATUS_CONFIG: Record<ClientStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  active: { label: 'Actif', variant: 'success' },
  expiring: { label: 'Expire bientôt', variant: 'warning' },
  expired: { label: 'Expiré', variant: 'destructive' },
  none: { label: 'Aucun abonnement', variant: 'muted' },
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/clients/client-status-badge.tsx
git commit -m "feat: add ClientStatusBadge mapping status to Badge variant"
```

---

### Task 7: ClientForm (shared create/edit form)

**Files:**
- Create: `components/clients/client-form.tsx`

**Interfaces:**
- Consumes: `Input`, `Label` from `@/components/ui/input` (existing); `Button` from `@/components/ui/button` (existing); `Client` from `@/lib/clients/types` (Task 1)
- Produces: `export function ClientForm({ initialValues, onSubmit, onCancel, submitLabel }: { initialValues?: Pick<Client, 'name' | 'phone' | 'email'>; onSubmit: (values: { name: string; phone: string; email?: string }) => void; onCancel: () => void; submitLabel: string })`

- [ ] **Step 1: Create the shared form component**

```typescript
// components/clients/client-form.tsx
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

export function ClientForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialValues?: Pick<Client, 'name' | 'phone' | 'email'>
  onSubmit: (values: ClientFormValues) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [phone, setPhone] = useState(initialValues?.phone ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [errors, setErrors] = useState<ClientFormErrors>({})

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate({ name, phone, email })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().length > 0 ? email.trim() : undefined,
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">Nom</Label>
        <Input
          id="client-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jeanne Dupont"
        />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone">Téléphone</Label>
        <Input
          id="client-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+33612345678"
        />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            {errors.phone}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-email">Email (optionnel)</Label>
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jeanne.dupont@example.com"
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email}
          </p>
        )}
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

Note: the submit/cancel buttons are rendered inside `ClientForm` itself (not via `DialogFooter`) since the form needs its own `<form onSubmit>` boundary — the buttons must be inside that boundary for the submit button's `type="submit"` to trigger validation correctly.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/clients/client-form.tsx
git commit -m "feat: add shared ClientForm for create and edit flows"
```

---

### Task 8: Delete confirmation dialog

**Files:**
- Create: `components/clients/delete-client-dialog.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog` (Task 3); `Button` from `@/components/ui/button` (existing)
- Produces: `export function DeleteClientDialog({ open, onOpenChange, clientName, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; clientName: string; onConfirm: () => void })`

- [ ] **Step 1: Create the confirmation dialog**

```typescript
// components/clients/delete-client-dialog.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DeleteClientDialog({
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
        <DialogTitle>Supprimer {clientName} ?</DialogTitle>
        <DialogDescription>Cette action est irréversible.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm}>
          Supprimer
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/clients/delete-client-dialog.tsx
git commit -m "feat: add delete confirmation dialog for clients"
```

---

### Task 9: Client list page (search, filter, create)

**Files:**
- Modify: `app/(staff)/clients/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useClients()` from `@/components/providers/clients-provider` (Task 2); `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog` (Task 3); `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table` (Task 4); `ClientForm` from `@/components/clients/client-form` (Task 7); `ClientStatusBadge` from `@/components/clients/client-status-badge` (Task 6); `Input` from `@/components/ui/input` (existing); `Button` from `@/components/ui/button` (existing); `Avatar` from `@/components/ui/avatar` (existing)

- [ ] **Step 1: Replace the stub page with the full list**

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
import { useClients } from '@/components/providers/clients-provider'
import type { ClientStatus } from '@/lib/clients/types'

const STATUS_FILTERS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'none', label: 'Aucun abonnement' },
]

export default function ClientsPage() {
  const router = useRouter()
  const { clients, addClient } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return clients.filter((client) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        client.name.toLowerCase().includes(normalizedQuery) ||
        client.phone.toLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [clients, query, statusFilter])

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

      {filtered.length === 0 ? (
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
            {filtered.map((client) => (
              <TableRow key={client.id} onClick={() => router.push(`/clients/${client.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name} />
                    <span className="font-medium">{client.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{client.phone}</TableCell>
                <TableCell>
                  <ClientStatusBadge status={client.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(client.joinedAt).toLocaleDateString('fr-FR')}
                </TableCell>
              </TableRow>
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(staff)/clients/page.tsx"
git commit -m "feat: replace clients stub with searchable, filterable list and create flow"
```

---

### Task 10: Client profile page (view, edit, delete, history/payments stubs)

**Files:**
- Create: `app/(staff)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `useClients()` from `@/components/providers/clients-provider` (Task 2); `ClientForm` from `@/components/clients/client-form` (Task 7); `ClientStatusBadge` from `@/components/clients/client-status-badge` (Task 6); `DeleteClientDialog` from `@/components/clients/delete-client-dialog` (Task 8); `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog` (Task 3); `EmptyState` from `@/components/ui/empty-state` (existing); `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card` (existing); `Avatar` from `@/components/ui/avatar` (existing); `Button` from `@/components/ui/button` (existing)

- [ ] **Step 1: Create the profile page**

```typescript
// app/(staff)/clients/[id]/page.tsx
'use client'

import { CalendarClock, CreditCard, Pencil, Receipt, Trash2, Users } from 'lucide-react'
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
import { useClients } from '@/components/providers/clients-provider'

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { getClient, updateClient, deleteClient } = useClients()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const client = getClient(params.id)

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

  const handleUpdate = (values: { name: string; phone: string; email?: string }) => {
    updateClient(client.id, values)
    setEditOpen(false)
  }

  const handleDelete = () => {
    deleteClient(client.id)
    router.push('/clients')
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
                <ClientStatusBadge status={client.status} />
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
              <Receipt className="size-4" />
              Paiements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="Bientôt disponible"
              description="L'historique des paiements sera disponible avec la gestion des abonnements."
            />
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
    </div>
  )
}
```

Note: `EmptyState`'s `min-h-[60vh]` sizing (from its existing implementation) will look oversized inside a `Card` here — this is a known visual rough edge, not a functional bug. Leave it as-is for this task; a future design pass can add a `compact` variant if needed. Do not modify `components/ui/empty-state.tsx` in this task — it's shared by other pages already reviewed and approved.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds. The dynamic route `/clients/[id]` appears in the route list (shown as `ƒ` for dynamic, not `○` for static, since it reads a URL param).

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/clients/[id]/page.tsx"
git commit -m "feat: add client profile page with edit, delete, and history/payments stubs"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds. Route list includes `/clients` (static) and `/clients/[id]` (dynamic), alongside all previously existing routes.

- [ ] **Step 3: Manual check — list, search, filter**

Run: `npm run dev` (background), log in as staff (`admin@atlas.fit` / `admin123`), then:

- Visit `/clients` → table renders with 18 mocked clients, status badges colored correctly (green=Actif, amber=Expire bientôt, red=Expiré, gray=Aucun abonnement).
- Type "Yasmine" in the search box → list filters to just that client.
- Clear search, click the "Expiré" filter chip → list shows only expired clients; combine with a search term → both filters apply together (AND).
- Clear all filters → full list returns.
- Type a search term matching nothing (e.g. "zzzzz") → "Aucun client trouvé." message shown, no crash.

- [ ] **Step 4: Manual check — create**

- Click "Ajouter un client" → Dialog opens, focus lands on the first field (Nom).
- Submit with empty Nom → inline error shown under Nom, Dialog stays open.
- Fill Nom + an invalid phone (e.g. "123") → inline error under Téléphone.
- Fill Nom + valid phone + invalid email (e.g. "not-an-email") → inline error under Email.
- Fill Nom + valid phone, leave Email blank → submits successfully, Dialog closes, new client appears in the list with status "Aucun abonnement" and a `CARD-000xx` card number.
- Press `Escape` while the Dialog is open → Dialog closes without submitting.

- [ ] **Step 5: Manual check — profile, edit, delete**

- Click a client row → navigates to `/clients/[id]`, shows name/phone/email/status/card number.
- Click "Modifier" → Dialog opens pre-filled with the client's current values; change the name, submit → Dialog closes, updated name shown on the profile page immediately.
- Navigate back to `/clients` → the list reflects the updated name.
- Return to the client's profile, click "Supprimer" → confirmation Dialog shows the client's name and "Cette action est irréversible."; click "Annuler" → Dialog closes, client still exists.
- Click "Supprimer" again, then confirm → redirected to `/clients`, the client no longer appears in the list.
- Navigate directly to a nonexistent client ID (e.g. `/clients/does-not-exist`) → "Client introuvable" screen shown with a working "Retour à la liste" link, no crash.
- On any client's profile page, confirm the "Historique des séances" and "Paiements" cards show their respective "Bientôt disponible" messages, not empty tables.

- [ ] **Step 6: Stop the dev server**

Stop the background dev server process once checks pass.

- [ ] **Step 7: Commit any fixes discovered during verification**

If Steps 1–5 required fixes, stage and commit them separately with a message describing the fix. If no fixes were needed, skip this step — do not create an empty commit.

---

## Self-Review Notes

- **Spec coverage:** Client type + mock data (Task 1), in-memory CRUD state (Task 2), Dialog and Table primitives (Tasks 3–4), provider mounted in the staff guard (Task 5), status badge (Task 6), shared create/edit form with validation (Task 7), delete confirmation (Task 8), searchable/filterable list with create flow (Task 9), profile page with edit/delete and reserved history/payments stubs (Task 10), and full manual verification of every flow and edge case from the spec's "Erreurs et cas limites" section (Task 11). All spec sections are covered. Out-of-scope items (real history/payments data, QR/card rendering, sorting, role-restricted delete, localStorage/API persistence, data-source merging) are correctly absent from every task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code. Task 3 includes an inline self-correction (the first Dialog draft had an unwired `aria-labelledby`) resolved with concrete replacement code in the same task, not deferred.
- **Type consistency:** `Client`/`ClientStatus` (Task 1) used identically in `ClientsProvider` (Task 2), `ClientStatusBadge` (Task 6), `ClientForm` (Task 7), and both pages (Tasks 9–10). `useClients()`'s returned shape (`clients`, `addClient`, `updateClient`, `deleteClient`, `getClient`) matches exactly how Tasks 9–10 call it. `ClientForm`'s `onSubmit` payload shape (`{ name, phone, email? }`) matches both `addClient`'s parameter type (Task 2) and how Tasks 9–10 pass their `handleCreate`/`handleUpdate` callbacks. `DeleteClientDialog`'s props match exactly how Task 10 invokes it.
