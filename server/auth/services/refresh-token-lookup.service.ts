import type { RefreshTokenRecord } from '../repositories/refresh-token.repository'

export interface RefreshTokenLookupService {
  /** Hashes the raw token and looks it up once. Returns null if not found, revoked, or expired. */
  findValid(refreshToken: string): Promise<RefreshTokenRecord | null>
}
