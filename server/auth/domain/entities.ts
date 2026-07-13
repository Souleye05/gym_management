import type { Role } from './enums'

export type StaffUser = {
  id: string
  name: string
  email: string
  role: Role
}

export type ClientUser = {
  id: string
  name: string
  phone: string
}
