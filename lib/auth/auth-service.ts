// lib/auth/auth-service.ts
import { httpClient } from '@/lib/api/http-client'
import { err, ok, type Result } from './result'
import type { AuthError, ClientSession, Session, StaffCredentials, StaffSession } from './types'
import type { Role } from './permissions'
import { ROLE_PERMISSIONS } from './permissions'

type BackendRole = 'ADMIN' | 'AGENT'

type StaffUserDto = { id: string; name: string; email: string; role: BackendRole }
type ClientUserDto = { id: string; name: string; phone: string }

const ROLE_FROM_BACKEND: Record<BackendRole, Role> = { ADMIN: 'admin', AGENT: 'agent' }

function toStaffSession(user: StaffUserDto): StaffSession {
  const role = ROLE_FROM_BACKEND[user.role]
  if (!role) {
    throw new Error(`Rôle staff inconnu reçu du serveur : ${user.role}`)
  }
  return {
    kind: 'staff',
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    permissions: ROLE_PERMISSIONS[role],
  }
}

function toClientSession(user: ClientUserDto): ClientSession {
  return { kind: 'client', id: user.id, name: user.name, phone: user.phone }
}

export type RefreshOutcome = 'refreshed' | 'rejected' | 'network-error'

export type AuthService = {
  loginStaff(credentials: StaffCredentials): Promise<Result<StaffSession, AuthError>>
  requestClientOtp(phone: string): Promise<Result<void, AuthError>>
  verifyClientOtp(phone: string, code: string): Promise<Result<ClientSession, AuthError>>
  logout(session: Session): Promise<boolean>
  getSession(): Promise<Session | null>
  refreshSession(): Promise<RefreshOutcome>
}

export function createAuthService(): AuthService {
  return {
    async loginStaff(credentials) {
      const result = await httpClient.post<{ user: StaffUserDto }>('/api/auth/staff/login', credentials)
      if (!result.ok) return err(result.error)
      return ok(toStaffSession(result.value.user))
    },

    async requestClientOtp(phone) {
      const result = await httpClient.post<null>('/api/auth/client/request-otp', { phone })
      if (!result.ok) return err(result.error)
      return ok(undefined)
    },

    async verifyClientOtp(phone, code) {
      const result = await httpClient.post<{ user: ClientUserDto }>('/api/auth/client/verify-otp', { phone, code })
      if (!result.ok) return err(result.error)
      return ok(toClientSession(result.value.user))
    },

    async logout(session) {
      const path = session.kind === 'staff' ? '/api/auth/staff/logout' : '/api/auth/client/logout'
      const result = await httpClient.post<null>(path)
      return result.ok
    },

    async getSession() {
      const staffResult = await httpClient.get<{ user: StaffUserDto }>('/api/auth/staff/me')
      if (staffResult.ok) return toStaffSession(staffResult.value.user)

      const clientResult = await httpClient.get<{ user: ClientUserDto }>('/api/auth/client/me')
      if (clientResult.ok) return toClientSession(clientResult.value.user)

      // Access token may simply be expired (e.g. middleware let the request through because it
      // only checks for access_token's presence, not validity). Attempt a silent refresh — backed
      // by the httpOnly refresh_token cookie, invisible to this code — before giving up.
      const refreshResult = await httpClient.post<null>('/api/auth/refresh')
      if (!refreshResult.ok) return null

      const retryStaffResult = await httpClient.get<{ user: StaffUserDto }>('/api/auth/staff/me')
      if (retryStaffResult.ok) return toStaffSession(retryStaffResult.value.user)

      const retryClientResult = await httpClient.get<{ user: ClientUserDto }>('/api/auth/client/me')
      if (retryClientResult.ok) return toClientSession(retryClientResult.value.user)

      return null
    },

    async refreshSession() {
      const result = await httpClient.post<null>('/api/auth/refresh')
      if (result.ok) return 'refreshed'
      return result.error.status === 0 ? 'network-error' : 'rejected'
    },
  }
}
