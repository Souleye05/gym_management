import { describe, expect, it } from 'vitest'
import { hasPermission, type Permission } from './permissions'

const ALL_PERMISSIONS: Permission[] = ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate']

describe('hasPermission', () => {
  it('grants ADMIN every client permission', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission('ADMIN', permission)).toBe(true)
    }
  })

  it('grants AGENT every permission except client:deactivate', () => {
    expect(hasPermission('AGENT', 'client:list')).toBe(true)
    expect(hasPermission('AGENT', 'client:read')).toBe(true)
    expect(hasPermission('AGENT', 'client:create')).toBe(true)
    expect(hasPermission('AGENT', 'client:update')).toBe(true)
    expect(hasPermission('AGENT', 'client:deactivate')).toBe(false)
  })
})
