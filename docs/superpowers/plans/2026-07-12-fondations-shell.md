# Fondations & Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the existing but unmounted admin shell (sidebar/topbar/bottom-nav/command-palette) and dashboard widgets into a real, working `/` route, and establish the `(staff)` route group with role-filtered navigation and stub pages so no nav link is dead.

**Architecture:** A new `app/(staff)/layout.tsx` wraps all staff routes in `AppShell` and a `UserProvider` (mocked current user). `app/page.tsx` is replaced by `app/(staff)/page.tsx`, which renders the dashboard by assembling the already-written widgets from `components/dashboard/*`. Six new stub pages under `app/(staff)/*` render a shared `EmptyState` component. `nav-config.ts` gains a `roles` field consumed by `AppSidebar` and `BottomNav` to filter visible items.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, `motion` (Motion One/Framer Motion), Recharts, Lucide React. No test runner is configured in this repo (no jest/vitest/playwright in `package.json`) — verification in this plan uses `tsc --noEmit`, `next lint`, `next build`, and manual checks against the running dev server instead of automated tests.

## Global Constraints

- Route group `(staff)` must not appear in the URL — dashboard stays reachable at `/`.
- No real authentication in this plan — `currentUser` is a hardcoded mock, no login/logout logic.
- Only **Paramètres** is hidden from the `agent` role; every other nav item is visible to both `admin` and `agent`.
- Do not modify the internal logic of existing dashboard widgets (`components/dashboard/*`) — only import and mount them.
- Do not extend `lib/mock-data.ts` in this plan — the dashboard widgets already have all the mock data they need.
- All new UI text is in French, matching the existing codebase (`Cahier des Charges`, existing component labels).
- Follow existing code conventions: `'use client'` directive where hooks/interactivity are used, `cn()` from `@/lib/utils` for conditional classes, named exports (not default) for components other than page/layout files, which Next.js requires as default exports.

---

## File Structure

```
lib/
  current-user.ts                       NEW — mock user + Role type
components/
  providers/
    user-provider.tsx                   NEW — React context exposing currentUser
  ui/
    empty-state.tsx                     NEW — reusable empty-state block
  shell/
    nav-config.ts                       MODIFY — add `roles` field to NavItem
    app-sidebar.tsx                     MODIFY — filter nav by role, read from context
    bottom-nav.tsx                      MODIFY — filter nav by role, read from context
app/
  page.tsx                              DELETE — replaced by app/(staff)/page.tsx
  (staff)/
    layout.tsx                          NEW — mounts UserProvider + AppShell
    page.tsx                            NEW — Dashboard, assembles existing widgets
    clients/page.tsx                    NEW — stub
    abonnements/page.tsx                NEW — stub
    seances/page.tsx                    NEW — stub
    scan/page.tsx                       NEW — stub
    statistiques/page.tsx               NEW — stub
    parametres/page.tsx                 NEW — stub
```

---

### Task 1: Mock current user + role type

**Files:**
- Create: `lib/current-user.ts`

**Interfaces:**
- Produces: `export type Role = 'admin' | 'agent'`, `export type CurrentUser = { id: string; name: string; role: Role; email: string; avatarUrl?: string }`, `export const currentUser: CurrentUser`

- [ ] **Step 1: Create the mock user file**

```typescript
export type Role = 'admin' | 'agent'

export type CurrentUser = {
  id: string
  name: string
  role: Role
  email: string
}

export const currentUser: CurrentUser = {
  id: 'u1',
  name: 'Admin Studio',
  role: 'admin',
  email: 'admin@atlas.fit',
}
```

- [ ] **Step 2: Verify the file compiles in isolation**

Run: `npx tsc --noEmit lib/current-user.ts --esModuleInterop --skipLibCheck`
Expected: no output (success). If it complains about missing lib/module settings, instead run the whole-project check in Task 9 later — this is just a fast sanity check.

- [ ] **Step 3: Commit**

```bash
git add lib/current-user.ts
git commit -m "feat: add mocked current user with role"
```

---

### Task 2: UserProvider context

**Files:**
- Create: `components/providers/user-provider.tsx`

**Interfaces:**
- Consumes: `CurrentUser` type and `currentUser` value from `lib/current-user.ts` (Task 1)
- Produces: `export function UserProvider({ children }: { children: ReactNode })`, `export function useCurrentUser(): CurrentUser`

- [ ] **Step 1: Create the context and hook**

```typescript
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { currentUser, type CurrentUser } from '@/lib/current-user'

const UserContext = createContext<CurrentUser>(currentUser)

export function UserProvider({ children }: { children: ReactNode }) {
  return <UserContext.Provider value={currentUser}>{children}</UserContext.Provider>
}

export function useCurrentUser(): CurrentUser {
  return useContext(UserContext)
}
```

- [ ] **Step 2: Commit**

```bash
git add components/providers/user-provider.tsx
git commit -m "feat: add UserProvider context for mocked role-aware UI"
```

---

### Task 3: Add `roles` to nav config

**Files:**
- Modify: `components/shell/nav-config.ts`

**Interfaces:**
- Consumes: `Role` type from `lib/current-user.ts` (Task 1)
- Produces: `NavItem.roles: Role[]` field, used by Task 4 and Task 5

- [ ] **Step 1: Update nav-config.ts to add roles per item**

Replace the full file content:

```typescript
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  QrCode,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/current-user'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  roles: Role[]
}

const ALL_ROLES: Role[] = ['admin', 'agent']

export const primaryNav: NavItem[] = [
  { label: 'Tableau de bord', href: '/', icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Clients', href: '/clients', icon: Users, badge: '486', roles: ALL_ROLES },
  { label: 'Abonnements', href: '/abonnements', icon: CreditCard, badge: '27', roles: ALL_ROLES },
  { label: 'Séances', href: '/seances', icon: CalendarDays, roles: ALL_ROLES },
  { label: 'Scan QR', href: '/scan', icon: QrCode, roles: ALL_ROLES },
  { label: 'Statistiques', href: '/statistiques', icon: BarChart3, roles: ALL_ROLES },
]

export const secondaryNav: NavItem[] = [
  { label: 'Paramètres', href: '/parametres', icon: Settings, roles: ['admin'] },
]

/* Condensed set for the mobile bottom navigation */
export const bottomNav: NavItem[] = [
  { label: 'Accueil', href: '/', icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Clients', href: '/clients', icon: Users, roles: ALL_ROLES },
  { label: 'Scan', href: '/scan', icon: QrCode, roles: ALL_ROLES },
  { label: 'Séances', href: '/seances', icon: CalendarDays, roles: ALL_ROLES },
  { label: 'Stats', href: '/statistiques', icon: BarChart3, roles: ALL_ROLES },
]
```

- [ ] **Step 2: Commit**

```bash
git add components/shell/nav-config.ts
git commit -m "feat: add role field to nav items for role-based filtering"
```

---

### Task 4: Filter AppSidebar by role

**Files:**
- Modify: `components/shell/app-sidebar.tsx`

**Interfaces:**
- Consumes: `useCurrentUser()` from `components/providers/user-provider.tsx` (Task 2), `NavItem.roles` from `nav-config.ts` (Task 3)

- [ ] **Step 1: Import the hook and filter both nav lists, and show the real user in the footer**

Modify the top of the file (imports) — replace:

```typescript
'use client'

import { Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { primaryNav, secondaryNav } from './nav-config'
```

with:

```typescript
'use client'

import { Dumbbell } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useCurrentUser } from '@/components/providers/user-provider'
import { cn } from '@/lib/utils'
import { primaryNav, secondaryNav } from './nav-config'
```

Replace the body of `AppSidebar` (from `const pathname = usePathname()` through the closing `</aside>`):

```typescript
export function AppSidebar() {
  const pathname = usePathname()
  const user = useCurrentUser()
  const visiblePrimary = primaryNav.filter((item) => item.roles.includes(user.role))
  const visibleSecondary = secondaryNav.filter((item) => item.roles.includes(user.role))

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground shadow-sm">
          <Dumbbell className="size-5" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Atlas</span>
          <span className="text-xs text-muted-foreground">Studio Fitness</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Général
        </p>
        {visiblePrimary.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}

        {visibleSecondary.length > 0 && (
          <>
            <p className="px-3 pt-5 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Système
            </p>
            {visibleSecondary.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} className="bg-primary/10 text-primary" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

Leave the `NavLink` helper function below unchanged.

- [ ] **Step 2: Commit**

```bash
git add components/shell/app-sidebar.tsx
git commit -m "feat: filter sidebar nav by current user role"
```

---

### Task 5: Filter BottomNav by role

**Files:**
- Modify: `components/shell/bottom-nav.tsx`

**Interfaces:**
- Consumes: `useCurrentUser()` from `components/providers/user-provider.tsx` (Task 2)

- [ ] **Step 1: Filter bottomNav and adjust the grid column count dynamically**

Replace the full file content:

```typescript
'use client'

import { QrCode } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCurrentUser } from '@/components/providers/user-provider'
import { cn } from '@/lib/utils'
import { bottomNav } from './nav-config'

export function BottomNav() {
  const pathname = usePathname()
  const user = useCurrentUser()
  const items = bottomNav.filter((item) => item.roles.includes(user.role))

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div
        className="grid items-end"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = pathname === item.href
          const isScan = item.href === '/scan'
          const Icon = item.icon

          if (isScan) {
            return (
              <div key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-label="Scanner un QR code"
                  className="-mt-6 flex size-14 flex-col items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-lg shadow-primary/30"
                >
                  <QrCode className="size-6" />
                </Link>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

Note: `grid-cols-5` (hardcoded) is replaced with an inline `gridTemplateColumns` since the item count is now dynamic per role (5 for admin/agent today, since Paramètres was never in `bottomNav` — this keeps it correct if `bottomNav` gains role-restricted items later).

- [ ] **Step 2: Commit**

```bash
git add components/shell/bottom-nav.tsx
git commit -m "feat: filter bottom nav by current user role"
```

---

### Task 6: EmptyState component

**Files:**
- Create: `components/ui/empty-state.tsx`

**Interfaces:**
- Produces: `export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode })`

- [ ] **Step 1: Create the component**

```typescript
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ui/empty-state.tsx
git commit -m "feat: add reusable EmptyState component"
```

---

### Task 7: `(staff)` layout — mount AppShell + UserProvider

**Files:**
- Create: `app/(staff)/layout.tsx`

**Interfaces:**
- Consumes: `AppShell` from `components/shell/app-shell.tsx` (existing, unmodified), `UserProvider` from `components/providers/user-provider.tsx` (Task 2)

- [ ] **Step 1: Create the layout**

```typescript
import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { UserProvider } from '@/components/providers/user-provider'

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <AppShell>{children}</AppShell>
    </UserProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff)/layout.tsx"
git commit -m "feat: add staff layout mounting AppShell and UserProvider"
```

---

### Task 8: Dashboard page — assemble existing widgets

**Files:**
- Create: `app/(staff)/page.tsx`
- Delete: `app/page.tsx`

**Interfaces:**
- Consumes: `StatCards`, `RevenueChart`, `AttendanceChart`, `PlanDistribution`, `ExpiringSubscriptions`, `RecentActivity`, `TopMembers`, `QuickActions` — all zero-prop named exports from `components/dashboard/*` (existing, unmodified)

- [ ] **Step 1: Delete the v0 placeholder page**

```bash
rm "app/page.tsx"
```

- [ ] **Step 2: Create the dashboard page**

```typescript
import { AttendanceChart } from '@/components/dashboard/attendance-chart'
import { ExpiringSubscriptions } from '@/components/dashboard/expiring-subscriptions'
import { PlanDistribution } from '@/components/dashboard/plan-distribution'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { StatCards } from '@/components/dashboard/stat-cards'
import { TopMembers } from '@/components/dashboard/top-members'

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble de l'activité de la salle aujourd'hui.
        </p>
      </div>

      <StatCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <PlanDistribution />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart />
        </div>
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentActivity />
        <ExpiringSubscriptions />
      </div>

      <TopMembers />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(staff)/page.tsx"
git rm "app/page.tsx"
git commit -m "feat: assemble dashboard page from existing widgets on staff route"
```

---

### Task 9: Stub pages for Clients, Abonnements, Séances, Scan, Statistiques, Paramètres

**Files:**
- Create: `app/(staff)/clients/page.tsx`
- Create: `app/(staff)/abonnements/page.tsx`
- Create: `app/(staff)/seances/page.tsx`
- Create: `app/(staff)/scan/page.tsx`
- Create: `app/(staff)/statistiques/page.tsx`
- Create: `app/(staff)/parametres/page.tsx`

**Interfaces:**
- Consumes: `EmptyState` from `components/ui/empty-state.tsx` (Task 6)

- [ ] **Step 1: Create `app/(staff)/clients/page.tsx`**

```typescript
import { Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ClientsPage() {
  return (
    <EmptyState
      icon={Users}
      title="Gestion des clients"
      description="La liste des clients, la recherche et la création de fiches arrivent bientôt."
    />
  )
}
```

- [ ] **Step 2: Create `app/(staff)/abonnements/page.tsx`**

```typescript
import { CreditCard } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function AbonnementsPage() {
  return (
    <EmptyState
      icon={CreditCard}
      title="Gestion des abonnements"
      description="La création, le renouvellement et le suivi des abonnements arrivent bientôt."
    />
  )
}
```

- [ ] **Step 3: Create `app/(staff)/seances/page.tsx`**

```typescript
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function SeancesPage() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="Séances journalières"
      description="L'enregistrement et l'historique des séances arrivent bientôt."
    />
  )
}
```

- [ ] **Step 4: Create `app/(staff)/scan/page.tsx`**

```typescript
import { QrCode } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ScanPage() {
  return (
    <EmptyState
      icon={QrCode}
      title="Scan QR code"
      description="La vérification instantanée du statut client par scan arrive bientôt."
    />
  )
}
```

- [ ] **Step 5: Create `app/(staff)/statistiques/page.tsx`**

```typescript
import { BarChart3 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function StatistiquesPage() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Statistiques"
      description="Les graphiques détaillés de revenus, fréquentation et abonnements arrivent bientôt."
    />
  )
}
```

- [ ] **Step 6: Create `app/(staff)/parametres/page.tsx`**

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

- [ ] **Step 7: Commit**

```bash
git add "app/(staff)/clients/page.tsx" "app/(staff)/abonnements/page.tsx" "app/(staff)/seances/page.tsx" "app/(staff)/scan/page.tsx" "app/(staff)/statistiques/page.tsx" "app/(staff)/parametres/page.tsx"
git commit -m "feat: add stub pages for staff nav routes"
```

---

### Task 10: Verify the whole app builds, type-checks, and renders correctly

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. If errors appear referencing files outside this plan's scope, note them but only fix ones caused by this plan's changes.

- [ ] **Step 2: Lint the project**

Run: `npm run lint`
Expected: no errors (warnings acceptable if pre-existing and unrelated to this plan's files).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, output lists all 7 static routes: `/`, `/clients`, `/abonnements`, `/seances`, `/scan`, `/statistiques`, `/parametres`.

- [ ] **Step 4: Manual check on the dev server**

Run: `npm run dev` (in background / separate terminal)

Then check in a browser at `http://localhost:3000`:
- `/` renders the dashboard: 4 stat cards, revenue chart, plan distribution donut, attendance bar chart, quick actions, recent activity list, expiring subscriptions list, top members list — all populated with mock data, no console errors.
- Desktop width (≥1024px): left sidebar visible with "Général" (6 items) and "Système" (Paramètres) sections, current page highlighted.
- Mobile width (<1024px, e.g. 375px): sidebar hidden, bottom nav visible with 5 items (Accueil, Clients, Scan, Séances, Stats) and a raised QR scan button in the center.
- Clicking each sidebar/bottom-nav link navigates to its route and shows the `EmptyState` stub with the correct icon/title (Clients, Abonnements, Séances, Scan QR, Statistiques, Paramètres) — no 404s.
- `Cmd/Ctrl+K` opens the command palette; typing filters results; selecting a result navigates and closes the palette.
- Theme toggle (topbar) switches between light and dark mode without layout shift.
- Stop the dev server once checks pass.

- [ ] **Step 5: Commit any fixes discovered during verification**

If Steps 1–4 required fixes, stage and commit them separately with a message describing the fix, e.g.:

```bash
git add <fixed files>
git commit -m "fix: resolve type error in staff dashboard assembly"
```

If no fixes were needed, skip this step — do not create an empty commit.

---

## Self-Review Notes

- **Spec coverage:** Route structure (Task 7–9), role-mocked user (Task 1–2), nav filtering (Task 3–5), dashboard assembly (Task 8), stub pages with EmptyState (Task 6, 9), verification of no dead links and role behavior (Task 10) — all spec sections are covered. Out-of-scope items (auth, client zone, mock-data extension) are correctly not present in any task.
- **Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `Role` type defined once in `lib/current-user.ts` (Task 1) and reused identically in `nav-config.ts` (Task 3) and `user-provider.tsx` (Task 2). `NavItem.roles: Role[]` name matches its usage in `app-sidebar.tsx` and `bottom-nav.tsx` (`item.roles.includes(user.role)`) in Tasks 4–5. `useCurrentUser()` return type (`CurrentUser`) matches `user.role`/`user.name`/`user.email` field access in both consumers.
