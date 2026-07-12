import type { Permission, Role } from './permissions'

export type { Permission, Role } from './permissions'

export type StaffSession = {
  kind: 'staff'
  id: string
  name: string
  email: string
  role: Role
  permissions: Permission[]
  expiresAt: number
}

export type ClientSession = {
  kind: 'client'
  id: string
  name: string
  phone: string
  expiresAt: number
}

export type Session = StaffSession | ClientSession

export type StaffCredentials = {
  email: string
  password: string
}

export type AuthErrorCode = 'invalid-credentials' | 'unknown-account' | 'invalid-otp'

export type AuthError = {
  code: AuthErrorCode
  message: string
}
