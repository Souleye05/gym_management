import { beforeEach, describe, expect, it } from 'vitest'
import { ok, err } from '../../shared/result'
import type { StaffAccountRecord, StaffAccountRepository } from '../repositories/staff-account.repository'
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'
import type { LoginAttemptRepository, RecordLoginAttemptInput } from '../repositories/login-attempt.repository'
import type { LoginLogRepository, RecordLoginLogInput } from '../repositories/login-log.repository'
import type { PasswordService } from './password.service'
import type { TokenService } from './token.service'
import type { RateLimitService } from './rate-limit.service'
import { DefaultStaffAuthService } from './default-staff-auth.service'

const ACCOUNT: StaffAccountRecord = {
  id: 's1',
  email: 'admin@atlas.fit',
  passwordHash: 'hashed-admin123',
  name: 'Admin Studio',
  role: 'ADMIN',
  isActive: true,
}

function fakeStaffAccountRepository(account: StaffAccountRecord | null = ACCOUNT): StaffAccountRepository {
  return {
    findByEmail: async (email) => (account && account.email === email ? account : null),
    findById: async (id) => (account && account.id === id ? account : null),
    findActiveById: async (id) => (account && account.id === id && account.isActive ? account : null),
  }
}

function fakeRefreshTokenRepository(existing: RefreshTokenRecord | null = null) {
  const created: CreateRefreshTokenInput[] = []
  const revoked: string[] = []
  const repository: RefreshTokenRepository = {
    create: async (input) => {
      created.push(input)
    },
    findValidByHash: async () => existing,
    revoke: async (tokenHash) => {
      revoked.push(tokenHash)
      return true
    },
  }
  return { repository, created, revoked }
}

function fakeLoginAttemptRepository() {
  const records: RecordLoginAttemptInput[] = []
  const repository: LoginAttemptRepository = {
    record: async (input) => {
      records.push(input)
    },
    countRecentFailures: async () => 0,
    countRecent: async () => 0,
  }
  return { repository, records }
}

function fakeLoginLogRepository() {
  const records: RecordLoginLogInput[] = []
  const repository: LoginLogRepository = {
    record: async (input) => {
      records.push(input)
    },
  }
  return { repository, records }
}

function fakePasswordService(verifies: boolean): PasswordService {
  return {
    hash: async (plain) => `hashed-${plain}`,
    verify: async () => verifies,
  }
}

function fakeTokenService(): TokenService {
  return {
    issueAccessToken: (payload) => `access-${payload.sub}`,
    issueRefreshToken: () => 'refresh-raw-token',
    verifyAccessToken: (token) => {
      if (token === 'access-s1') return ok({ sub: 's1', kind: 'staff', role: 'ADMIN' })
      if (token === 'access-client-token') return ok({ sub: 'c1', kind: 'client' })
      return err({ code: 'session-expired', message: 'Session expirée.' })
    },
    hashRefreshToken: (token) => `hashed-${token}`,
  }
}

function allowingRateLimit(): RateLimitService {
  return { assertNotLocked: async () => ok(undefined) }
}

function lockedRateLimit(): RateLimitService {
  return { assertNotLocked: async () => err({ code: 'too-many-attempts', message: 'Trop de tentatives, réessayez plus tard.' }) }
}

describe('DefaultStaffAuthService.login', () => {
  it('succeeds with correct credentials and issues tokens', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const loginAttempts = fakeLoginAttemptRepository()
    const loginLogs = fakeLoginLogRepository()
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      refreshTokens.repository,
      loginAttempts.repository,
      loginLogs.repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.login({ email: 'admin@atlas.fit', password: 'admin123' }, {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.user).toEqual({ id: 's1', name: 'Admin Studio', email: 'admin@atlas.fit', role: 'ADMIN' })
      expect(result.value.tokens.accessToken).toBe('access-s1')
    }
    expect(loginAttempts.records).toEqual([
      { kind: 'LOGIN', identifier: 'admin@atlas.fit', succeeded: true, staffAccountId: 's1', ipAddress: undefined },
    ])
    expect(loginLogs.records).toHaveLength(1)
    expect(loginLogs.records[0].succeeded).toBe(true)
    expect(refreshTokens.created).toHaveLength(1)
    const expectedExpiry = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    expect(refreshTokens.created[0].expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
  })

  it('rejects when the account does not exist, without revealing that', async () => {
    const loginAttempts = fakeLoginAttemptRepository()
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(null),
      fakeRefreshTokenRepository().repository,
      loginAttempts.repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.login({ email: 'missing@atlas.fit', password: 'whatever' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-credentials')
    expect(loginAttempts.records[0].succeeded).toBe(false)
  })

  it('rejects an inactive account with the same generic error as wrong credentials', async () => {
    const inactive: StaffAccountRecord = { ...ACCOUNT, isActive: false }
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(inactive),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.login({ email: 'admin@atlas.fit', password: 'admin123' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-credentials')
  })

  it('rejects a wrong password', async () => {
    const loginAttempts = fakeLoginAttemptRepository()
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      loginAttempts.repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(false),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.login({ email: 'admin@atlas.fit', password: 'wrong' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-credentials')
    expect(loginAttempts.records[0].staffAccountId).toBe('s1')
  })

  it('rejects when rate-limited, without touching the account repository', async () => {
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      lockedRateLimit(),
    )

    const result = await service.login({ email: 'admin@atlas.fit', password: 'admin123' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-many-attempts')
  })
})

describe('DefaultStaffAuthService.getMe', () => {
  it('returns the user for a valid staff access token', async () => {
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.getMe('access-s1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.email).toBe('admin@atlas.fit')
  })

  it('rejects a client access token used against the staff service', async () => {
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.getMe('access-client-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('session-expired')
  })

  it('rejects an invalid access token', async () => {
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.getMe('garbage')

    expect(result.ok).toBe(false)
  })
})

describe('DefaultStaffAuthService.refresh', () => {
  const VALID_STAFF_RECORD: RefreshTokenRecord = {
    id: 'rt1',
    tokenHash: 'hashed-refresh-raw-token',
    staffAccountId: 's1',
    clientAccountId: null,
    expiresAt: new Date(Date.now() + 1000),
    revokedAt: null,
  }

  it('rotates the refresh token on success', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      refreshTokens.repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.refresh(VALID_STAFF_RECORD)

    expect(result.ok).toBe(true)
    expect(refreshTokens.revoked).toContain('hashed-refresh-raw-token')
    expect(refreshTokens.created).toHaveLength(1)
  })

  it('rejects without issuing a new token when it loses the revoke race (concurrent refresh)', async () => {
    const created: unknown[] = []
    const racingRefreshTokens: RefreshTokenRepository = {
      create: async (input) => {
        created.push(input)
      },
      findValidByHash: async () => VALID_STAFF_RECORD,
      // Simulates another concurrent refresh() call having already revoked this token.
      revoke: async () => false,
    }
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      racingRefreshTokens,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.refresh(VALID_STAFF_RECORD)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-refresh-token')
    expect(created).toHaveLength(0)
  })

  it('does not issue a new token if revoking the old one fails', async () => {
    const created: unknown[] = []
    const failingRefreshTokens: RefreshTokenRepository = {
      create: async (input) => {
        created.push(input)
      },
      findValidByHash: async () => VALID_STAFF_RECORD,
      revoke: async () => {
        throw new Error('transient database error')
      },
    }
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      failingRefreshTokens,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    await expect(service.refresh(VALID_STAFF_RECORD)).rejects.toThrow('transient database error')
    expect(created).toHaveLength(0)
  })

  it('rejects a refresh token record with no staff account (e.g. owned by a client)', async () => {
    const clientOwned: RefreshTokenRecord = {
      id: 'rt2',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: null,
      clientAccountId: 'c1',
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.refresh(clientOwned)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-refresh-token')
  })

  it('rejects when the account is inactive', async () => {
    const inactive: StaffAccountRecord = { ...ACCOUNT, isActive: false }
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(inactive),
      fakeRefreshTokenRepository().repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    const result = await service.refresh(VALID_STAFF_RECORD)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('account-inactive')
  })
})

describe('DefaultStaffAuthService.logout', () => {
  it('revokes the refresh token', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const service = new DefaultStaffAuthService(
      fakeStaffAccountRepository(),
      refreshTokens.repository,
      fakeLoginAttemptRepository().repository,
      fakeLoginLogRepository().repository,
      fakePasswordService(true),
      fakeTokenService(),
      allowingRateLimit(),
    )

    await service.logout('refresh-raw-token')

    expect(refreshTokens.revoked).toEqual(['hashed-refresh-raw-token'])
  })
})
