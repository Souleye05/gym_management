import type { LoginKind, Role } from './enums'

export type AccessTokenPayload = {
  sub: string
  kind: LoginKind
  role?: Role
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}
