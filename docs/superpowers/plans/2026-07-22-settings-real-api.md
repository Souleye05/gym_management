# Settings Real API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `SettingsProvider`'s mocked, in-memory `AppSettings` with the real, already-shipped `GET`/`PATCH /api/settings`, and replace `/parametres`'s placeholder with a real screen: read-only session price for all staff, an edit form for ADMIN only.

**Architecture:** `SettingsProvider` moves from `useState` to React Query (`useQuery` for reading, `useMutation` for updating), mirroring the pattern already proven by `ClientsProvider`/`MyProfileProvider`. A new `lib/settings/fetch-settings.ts` mirrors `lib/clients/fetch-clients.ts`'s envelope-unwrapping pattern. `lib/auth/permissions.ts` gets a one-name rename (`settings:manage` → `settings:update`) so the frontend's permission check matches the backend's actual permission name.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), `@tanstack/react-query` (already a dependency). No test framework in this repo — verify with `tsc --noEmit` and manual verification via the dev server.

## Global Constraints

- **The backend contract does not change** — this plan touches ONLY frontend files (`lib/`, `components/`, `app/`). `GET /api/settings` and `PATCH /api/settings` are already shipped and stable.
- **Response shape**: both `GET` and `PATCH /api/settings` return `200 { settings: { sessionPrice: number } }` wrapped in the standard `{ success, data, message, errors }` envelope. `PATCH`'s body is `{ sessionPrice: number }`; the backend validates it as a positive integer via Zod and returns a `400` with a French validation message on failure — surfaced to the form exactly like other server-validation errors in this app (e.g. `client-form.tsx`'s `serverError` pattern).
- **`SettingsContextValue` drops its synthetic always-present default** — `settings` becomes `AppSettings | undefined`, with `isLoading`/`isError` exposed so every consumer (this plan's `/parametres`, and the next sub-project's `SessionsProvider`) handles the loading/error states explicitly, matching `ClientsProvider`'s discipline. This is a breaking change to `SettingsContextValue`'s shape — the only current consumer beyond the provider itself is nothing yet (grep confirms zero non-provider files call `useSettings()` today), so there is no other call site to update in this plan.
- **`lib/auth/permissions.ts`'s `'settings:manage'` permission is renamed to `'settings:update'`**, matching the backend's actual permission name exactly (`server/shared/authorization/permissions.ts`). This is the ONLY change to the frontend's permission system in this plan — the client-side role-to-permissions derivation itself, and the other 6 permissions, are unchanged and out of scope.
- **`/parametres`'s edit form is gated on `useCurrentUser().permissions.includes('settings:update')`** — rendered only for users who have it (ADMIN today), never rendered (not just disabled) for users who don't, so the UI never implies an action is possible when the backend would reject it with 403.
- **`lib/settings/mock-settings.ts` is deleted** once `SettingsProvider` no longer imports it — confirmed via grep: `settings-provider.tsx` is its only importer today.
- Every file this plan modifies currently exists and is shipped on `main` — read each file's current content before editing (code blocks below are accurate as of plan-writing time; re-verify, since a separate backend-focused agent may land concurrent commits in this shared repo).
- French UI copy throughout, consistent with the rest of the app.
- This project's `tsc`/`next`/`npx` binary resolution has been unreliable in past sessions. If `npx tsc --noEmit` behaves suspiciously, fall back to `node "node_modules/.pnpm/typescript@<version>/node_modules/typescript/bin/tsc" --noEmit` (check the exact version via `ls node_modules/.pnpm | grep typescript` first).

---

## File Structure

```
lib/settings/fetch-settings.ts              — CREATE: fetchSettings, updateSettingsRequest
lib/settings/mock-settings.ts               — DELETE (Task 2, once nothing imports it)
lib/auth/permissions.ts                     — MODIFY: rename settings:manage -> settings:update
components/providers/settings-provider.tsx  — MODIFY: React Query rewrite
app/(staff)/parametres/page.tsx             — MODIFY: real read-only display + ADMIN-only edit form
```

---

## Task 1: Fetch layer and permission rename

**Files:**
- Create: `lib/settings/fetch-settings.ts`
- Modify: `lib/auth/permissions.ts`

**Interfaces:**
- Consumes: `AppSettings` (`lib/settings/types.ts`, unchanged).
- Produces:
  ```typescript
  // lib/settings/fetch-settings.ts
  export async function fetchSettings(): Promise<AppSettings>
  export async function updateSettingsRequest(input: { sessionPrice: number }): Promise<AppSettings>

  // lib/auth/permissions.ts
  export type Permission =
    | 'dashboard:view' | 'clients:view' | 'subscriptions:manage' | 'sessions:manage'
    | 'scan:use' | 'statistics:view' | 'settings:update'   // was 'settings:manage'
  ```
  Consumed by Task 2 (`SettingsProvider`) and Task 3 (`/parametres`'s permission check).

- [ ] **Step 1: Write `lib/settings/fetch-settings.ts`**

```typescript
// lib/settings/fetch-settings.ts
import type { AppSettings } from './types'

type ApiEnvelope<T> =
  | { success: true; data: T; message: string; errors: null }
  | { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  let envelope: ApiEnvelope<T>
  try {
    envelope = await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }
  if (!envelope.success) {
    throw new Error(envelope.message || fallbackMessage)
  }
  return envelope.data
}

export async function fetchSettings(): Promise<AppSettings> {
  const response = await fetch('/api/settings')
  const data = await unwrap<{ settings: AppSettings }>(response, 'Impossible de charger les paramètres.')
  return data.settings
}

export async function updateSettingsRequest(input: { sessionPrice: number }): Promise<AppSettings> {
  const response = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await unwrap<{ settings: AppSettings }>(response, 'Impossible de mettre à jour les paramètres.')
  return data.settings
}
```

- [ ] **Step 2: Update `lib/auth/permissions.ts`**

Current content (verify this matches before editing):

```typescript
export type Role = 'admin' | 'agent'

export type Permission =
  | 'dashboard:view'
  | 'clients:view'
  | 'subscriptions:manage'
  | 'sessions:manage'
  | 'scan:use'
  | 'statistics:view'
  | 'settings:manage'

const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'clients:view',
  'subscriptions:manage',
  'sessions:manage',
  'scan:use',
  'statistics:view',
  'settings:manage',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  agent: ALL_PERMISSIONS.filter((p) => p !== 'settings:manage'),
}
```

New content (every occurrence of `settings:manage` becomes `settings:update`, nothing else changes):

```typescript
export type Role = 'admin' | 'agent'

export type Permission =
  | 'dashboard:view'
  | 'clients:view'
  | 'subscriptions:manage'
  | 'sessions:manage'
  | 'scan:use'
  | 'statistics:view'
  | 'settings:update'

const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'clients:view',
  'subscriptions:manage',
  'sessions:manage',
  'scan:use',
  'statistics:view',
  'settings:update',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  agent: ALL_PERMISSIONS.filter((p) => p !== 'settings:update'),
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors in `lib/settings/fetch-settings.ts` (new file, no consumers yet). The `permissions.ts` rename should also produce zero errors — grep confirms `'settings:manage'` is not referenced as a string literal anywhere else in the codebase (`grep -rn "settings:manage" .` should return nothing outside this file after the edit); if it does find another reference, treat that as a signal to re-examine before proceeding, since the brief's assumption of zero other call sites would be wrong.

- [ ] **Step 4: Commit**

```bash
git add lib/settings/fetch-settings.ts lib/auth/permissions.ts
git commit -m "feat: add Settings fetch layer, rename settings:manage to settings:update"
```

---

## Task 2: Rewrite `SettingsProvider`, delete mock

**Files:**
- Modify: `components/providers/settings-provider.tsx`
- Delete: `lib/settings/mock-settings.ts`

**Interfaces:**
- Consumes: `fetchSettings`, `updateSettingsRequest` (Task 1).
- Produces (BREAKING CHANGE to the provider's shape — the only consumer today is `/parametres`, updated in Task 3):
  ```typescript
  type SettingsContextValue = {
    settings: AppSettings | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
    updateSettings(input: { sessionPrice: number }, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
    isUpdating: boolean
  }
  ```

- [ ] **Step 1: Rewrite `components/providers/settings-provider.tsx`**

Current content (verify this matches before editing):

```typescript
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

New content:

```typescript
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { fetchSettings, updateSettingsRequest } from '@/lib/settings/fetch-settings'
import type { AppSettings } from '@/lib/settings/types'

const SETTINGS_QUERY_KEY = ['settings'] as const

type UpdateSettingsOpts = { onSuccess?: () => void; onError?: (message: string) => void }

type SettingsContextValue = {
  settings: AppSettings | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
  updateSettings(input: { sessionPrice: number }, opts?: UpdateSettingsOpts): void
  isUpdating: boolean
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: fetchSettings,
  })

  const mutation = useMutation({
    mutationFn: updateSettingsRequest,
  })

  const updateSettings = useCallback(
    (input: { sessionPrice: number }, opts?: UpdateSettingsOpts) => {
      mutation.mutate(input, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
          opts?.onSuccess?.()
        },
        onError: (error) => opts?.onError?.(errorMessage(error, 'Impossible de mettre à jour les paramètres.')),
      })
    },
    [mutation, queryClient],
  )

  return (
    <SettingsContext.Provider
      value={{
        settings: query.data,
        isLoading: query.isPending,
        isError: query.isError,
        refetch: () => query.refetch(),
        updateSettings,
        isUpdating: mutation.isPending,
      }}
    >
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

- [ ] **Step 2: Delete the now-dead mock file**

```bash
git rm lib/settings/mock-settings.ts
```

(Confirm with a grep before deleting: `grep -rn "mock-settings\|DEFAULT_SETTINGS" lib/ components/ app/` should show zero remaining matches after Step 1's edit lands — `settings-provider.tsx` was its only importer.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: errors remaining only in `app/(staff)/parametres/page.tsx` if it references the old `SettingsContextValue` shape (it currently doesn't call `useSettings()` at all, so this file likely shows zero errors even before Task 3 — confirm this is the case; if it does show an error, that's still expected and fixed in Task 3). Confirm `settings-provider.tsx` itself has zero errors, and confirm no file anywhere still imports `mock-settings`.

- [ ] **Step 4: Commit**

```bash
git add components/providers/settings-provider.tsx lib/settings/mock-settings.ts
git commit -m "feat: rewrite SettingsProvider on React Query against the real Settings API"
```

---

## Task 3: `/parametres` real screen

**Files:**
- Modify: `app/(staff)/parametres/page.tsx`

**Interfaces:**
- Consumes: `useSettings()` (Task 2); `useCurrentUser()` (`components/providers/user-provider.tsx`, unchanged) for `permissions.includes('settings:update')` (Task 1's renamed permission).

- [ ] **Step 1: Rewrite `app/(staff)/parametres/page.tsx`**

Current content (verify this matches before editing):

```typescript
import { Settings } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ParametresPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Paramètres"
      description="La configuration des tarifs, des employés et des permissions arrive bientôt."
    />
  )
}
```

New content:

```typescript
'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useSettings } from '@/components/providers/settings-provider'
import { useCurrentUser } from '@/components/providers/user-provider'

export default function ParametresPage() {
  const { settings, isLoading, isError, refetch, updateSettings, isUpdating } = useSettings()
  const { permissions } = useCurrentUser()
  const canEdit = permissions.includes('settings:update')

  const [sessionPriceInput, setSessionPriceInput] = useState('')
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (isError || !settings) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger les paramètres.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </div>
    )
  }

  const handleStartEdit = () => {
    setSessionPriceInput(String(settings.sessionPrice))
    setFormError(undefined)
    setEditing(true)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(sessionPriceInput)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setFormError('Le tarif doit être un nombre entier positif.')
      return
    }
    setFormError(undefined)
    updateSettings(
      { sessionPrice: parsed },
      {
        onSuccess: () => setEditing(false),
        onError: (message) => setFormError(message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Paramètres</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarif de séance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing ? (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="session-price">Tarif (€)</Label>
                <Input
                  id="session-price"
                  type="number"
                  min={1}
                  step={1}
                  value={sessionPriceInput}
                  onChange={(e) => setSessionPriceInput(e.target.value)}
                  autoFocus
                />
                {formError && (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={isUpdating}>
                  Annuler
                </Button>
                <Button type="submit" className="bg-gradient-brand text-primary-foreground" disabled={isUpdating}>
                  Enregistrer
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {settings.sessionPrice} € par séance
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={handleStartEdit}>
                  Modifier
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

Note `canEdit` gates ONLY the "Modifier" button that reveals the form — a non-ADMIN staff member never sees the form at all, matching the plan's constraint that the UI must never imply an action is possible when the backend would reject it.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: ZERO errors across the whole project. This is the last file in this plan with any outstanding compile error — confirm it's resolved.

- [ ] **Step 3: Manual verification**

Run the dev server (`superpowers:run`/`pnpm dev` against a running, seeded Postgres). Log in as `admin@atlas.fit`/`admin123` (ADMIN role): confirm `/parametres` shows the current session price with a "Modifier" button; click it, change the value, save, confirm the displayed price updates without a page reload; try an invalid value (e.g. `0` or a negative number) and confirm the backend's validation error is shown inline, form stays open. Log in as `agent@atlas.fit`/`agent123` (AGENT role): confirm `/parametres` shows the current session price with NO "Modifier" button anywhere.

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/parametres/page.tsx"
git commit -m "feat: replace /parametres placeholder with real session-price display and ADMIN-only edit form"
```

---

## Task 4: Final regression pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: zero errors across the whole project.

- [ ] **Step 2: Production build**

Run: `pnpm build` (or `npx next build`)
Expected: build succeeds, all routes generated.

- [ ] **Step 3: Constraint audit**

- Confirm `lib/settings/mock-settings.ts` no longer exists and has zero remaining references (`grep -rn "mock-settings\|DEFAULT_SETTINGS" .`).
- Confirm `grep -rn "settings:manage" .` shows zero matches anywhere in the repo.
- Confirm this plan touched ONLY frontend files (`git diff --name-only <baseline>..HEAD` should show no path under `server/`, `app/api/`, or `prisma/` — baseline = the commit before Task 1, check the ledger for the exact SHA).
- Confirm `app/(staff)/parametres/page.tsx` never renders the edit form unconditionally — `grep -n "canEdit" "app/(staff)/parametres/page.tsx"` should show it gating the "Modifier" button.

- [ ] **Step 4: Manual smoke test of adjacent, untouched features**

Verify `/clients`, `/abonnements` (still mocked, unaffected by this plan), `/seances` (still mocked), `/scan`, and the client portal (`/connexion` → `/accueil`) are entirely unaffected — this plan only touches `SettingsProvider` and `/parametres`.

- [ ] **Step 5: Commit** (only if Steps 1-4 required fixes; otherwise skip — no empty commit)

```bash
git add -A
git commit -m "fix: address regressions found in Settings real-API regression pass"
```
