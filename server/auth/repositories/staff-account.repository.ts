import type { Role } from '../domain/enums'

export type StaffAccountRecord = {
  id: string
  email: string
  passwordHash: string
  name: string
  role: Role
  isActive: boolean
}

export interface StaffAccountRepository {
  findByEmail(email: string): Promise<StaffAccountRecord | null>
  findById(id: string): Promise<StaffAccountRecord | null>
}
