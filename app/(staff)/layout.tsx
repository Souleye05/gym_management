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
