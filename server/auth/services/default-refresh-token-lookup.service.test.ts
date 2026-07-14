import { describe, expect, it } from 'vitest'
import type { RefreshTokenRecord, RefreshTokenRepository } from '../repositories/refresh-token.repository'
import type { TokenService } from './token.service'
import { DefaultRefreshTokenLookupService } from './default-refresh-token-lookup.service'

const RECORD: RefreshTokenRecord = {
  id: 'rt1',
  tokenHash: 'hashed-raw-token',
  staffAccountId: 's1',
  clientAccountId: null,
  expiresAt: new Date(Date.now() + 1000),
  revokedAt: null,
}

function fakeRefreshTokenRepository(record: RefreshTokenRecord | null) {
  const lookedUpHashes: string[] = []
  const repository: RefreshTokenRepository = {
    create: async () => {},
    findValidByHash: async (tokenHash) => {
      lookedUpHashes.push(tokenHash)
      return record
    },
    revoke: async () => true,
  }
  return { repository, lookedUpHashes }
}

function fakeTokenService(): TokenService {
  return {
    issueAccessToken: () => 'access-token',
    issueRefreshToken: () => 'refresh-token',
    verifyAccessToken: () => {
      throw new Error('not used by this service')
    },
    hashRefreshToken: (token) => `hashed-${token}`,
  }
}

describe('DefaultRefreshTokenLookupService.findValid', () => {
  it('hashes the raw token before looking it up', async () => {
    const refreshTokens = fakeRefreshTokenRepository(RECORD)
    const service = new DefaultRefreshTokenLookupService(refreshTokens.repository, fakeTokenService())

    await service.findValid('raw-token')

    expect(refreshTokens.lookedUpHashes).toEqual(['hashed-raw-token'])
  })

  it('returns the record found by the repository', async () => {
    const refreshTokens = fakeRefreshTokenRepository(RECORD)
    const service = new DefaultRefreshTokenLookupService(refreshTokens.repository, fakeTokenService())

    const result = await service.findValid('raw-token')

    expect(result).toEqual(RECORD)
  })

  it('returns null when the repository finds no valid token', async () => {
    const refreshTokens = fakeRefreshTokenRepository(null)
    const service = new DefaultRefreshTokenLookupService(refreshTokens.repository, fakeTokenService())

    const result = await service.findValid('unknown-or-expired-token')

    expect(result).toBeNull()
  })
})
