import type { Role } from './permissions'

export type StaffAccount = {
  id: string
  name: string
  email: string
  password: string
  role: Role
}

export const staffDirectory: StaffAccount[] = [
  {
    id: 's1',
    name: 'Admin Studio',
    email: 'admin@atlas.fit',
    password: 'admin123',
    role: 'admin',
  },
  {
    id: 's2',
    name: 'Agent Caisse',
    email: 'agent@atlas.fit',
    password: 'agent123',
    role: 'agent',
  },
]

export function findStaffAccount(email: string, password: string): StaffAccount | null {
  return (
    staffDirectory.find(
      (account) => account.email.toLowerCase() === email.toLowerCase() && account.password === password,
    ) ?? null
  )
}
