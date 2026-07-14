import type { LoginKind } from '../domain/enums'

export type RefreshTokenOwnerKind = LoginKind

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
  /**
   * Atomically revokes the token iff it isn't already revoked. Returns false if it was already
   * revoked (or never existed) — callers doing rotation must treat that as "lost the race" and
   * not issue a replacement token, since some other caller already claimed this one.
   */
  revoke(tokenHash: string): Promise<boolean>
}
