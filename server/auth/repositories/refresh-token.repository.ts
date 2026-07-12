import type { LoginKind } from '../domain/enums'

export type RefreshTokenOwnerKind = Extract<LoginKind, 'staff' | 'client'>

export type RefreshTokenRecord = {
  id: string
  tokenHash: string
  staffAccountId: string | null
  clientAccountId: string | null
  expiresAt: Date
  revokedAt: Date | null
}

export type CreateRefreshTokenInput = {
  tokenHash: string
  ownerId: string
  ownerKind: RefreshTokenOwnerKind
  expiresAt: Date
  userAgent?: string
  ipAddress?: string
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<void>
  /** Returns null if no matching token exists, or if it is revoked or past expiresAt. */
  findValidByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  revoke(tokenHash: string): Promise<void>
}
