// lib/auth/auth-service.ts
import { err, ok, type Result } from './result'
import { ROLE_PERMISSIONS } from './permissions'
import type { AuthError, ClientSession, Session, StaffCredentials, StaffSession } from './types'
import { findStaffAccount } from './mock-staff-directory'
import { findClientAccount } from './mock-client-directory'
import type { SessionRepository } from './session-repository'

const STAFF_SESSION_DURATION_MS = 30 * 60 * 1000
const CLIENT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000
const MOCK_OTP_CODE = '123456'

export type AuthService = {
  loginStaff(credentials: StaffCredentials): Promise<Result<StaffSession, AuthError>>
  requestClientOtp(phone: string): Promise<Result<void, AuthError>>
  verifyClientOtp(phone: string, code: string): Promise<Result<ClientSession, AuthError>>
  logout(): Promise<void>
  getSession(): Promise<Session | null>
  refreshSession(): Promise<void>
}

export function createAuthService(repository: SessionRepository): AuthService {
  return {
    async loginStaff(credentials) {
      const account = findStaffAccount(credentials.email, credentials.password)
      if (!account) {
        return err({ code: 'invalid-credentials', message: 'Identifiants invalides.' })
      }
      const session: StaffSession = {
        kind: 'staff',
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        permissions: ROLE_PERMISSIONS[account.role],
        expiresAt: Date.now() + STAFF_SESSION_DURATION_MS,
      }
      await repository.set(session)
      return ok(session)
    },

    async requestClientOtp(phone) {
      const account = findClientAccount(phone)
      if (!account) {
        return err({ code: 'unknown-account', message: 'Compte introuvable.' })
      }
      return ok(undefined)
    },

    async verifyClientOtp(phone, code) {
      const account = findClientAccount(phone)
      if (!account) {
        return err({ code: 'unknown-account', message: 'Compte introuvable.' })
      }
      if (code !== MOCK_OTP_CODE) {
        return err({ code: 'invalid-otp', message: 'Code incorrect.' })
      }
      const session: ClientSession = {
        kind: 'client',
        id: account.id,
        name: account.name,
        phone: account.phone,
        expiresAt: Date.now() + CLIENT_SESSION_DURATION_MS,
      }
      await repository.set(session)
      return ok(session)
    },

    async logout() {
      await repository.clear()
    },

    async getSession() {
      const session = await repository.get()
      if (!session) return null
      if (session.expiresAt <= Date.now()) {
        await repository.clear()
        return null
      }
      return session
    },

    async refreshSession() {
      const session = await repository.get()
      if (!session) return
      if (session.expiresAt <= Date.now()) return
      const duration = session.kind === 'staff' ? STAFF_SESSION_DURATION_MS : CLIENT_SESSION_DURATION_MS
      await repository.set({ ...session, expiresAt: Date.now() + duration })
    },
  }
}
