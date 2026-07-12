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
