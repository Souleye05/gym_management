import type { Role } from '../../auth/domain/enums'

export type Permission = 'client:list' | 'client:read' | 'client:create' | 'client:update' | 'client:deactivate'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate'],
  AGENT: ['client:list', 'client:read', 'client:create', 'client:update'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
