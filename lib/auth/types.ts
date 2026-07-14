import type { Permission, Role } from './permissions'

export type { Permission, Role } from './permissions'

export type StaffSession = {
  kind: 'staff'
  id: string
  name: string
  email: string
  role: Role
  permissions: Permission[]
}

export type ClientSession = {
  kind: 'client'
  id: string
  name: string
  phone: string
}

export type Session = StaffSession | ClientSession

export type StaffCredentials = {
  email: string
  password: string
}

export type AuthError = {
  message: string
  status: number
}
