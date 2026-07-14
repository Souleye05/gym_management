import { describe, expect, it } from 'vitest'
import { ok, err } from '../../shared/result'
import type { ClientAccountRecord, ClientAccountRepository } from '../repositories/client-account.repository'
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../repositories/refresh-token.repository'
import { REFRESH_TOKEN_TTL_SECONDS } from '../domain/session-durations'
import type { OtpRecord, OtpRepository } from '../repositories/otp.repository'
import type { LoginAttemptRepository, RecordLoginAttemptInput } from '../repositories/login-attempt.repository'
import type { LoginLogRepository, RecordLoginLogInput } from '../repositories/login-log.repository'
import type { OtpService } from './otp.service'
import type { TokenService } from './token.service'
import type { RateLimitService } from './rate-limit.service'
import { DefaultClientAuthService } from './default-client-auth.service'

const ACCOUNT: ClientAccountRecord = { id: 'c1', phone: '+33612345601', name: 'Yasmine Kaddour', isActive: true }

const VALID_OTP: OtpRecord = {
  id: 'otp1',
  clientAccountId: 'c1',
  codeHash: 'hash-of-123456',
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
  attempts: 0,
}

function fakeClientAccountRepository(account: ClientAccountRecord | null = ACCOUNT): ClientAccountRepository {
  return {
    findByPhone: async (phone) => (account && account.phone === phone ? account : null),
    findById: async (id) => (account && account.id === id ? account : null),
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

function fakeOtpRepository(otp: OtpRecord | null = VALID_OTP, consumeSucceeds = true) {
  const created: unknown[] = []
  const incrementedAttempts: string[] = []
  const consumed: string[] = []
  const repository: OtpRepository = {
    create: async (input) => {
      created.push(input)
    },
    findLatestValid: async () => otp,
    incrementAttempts: async (id) => {
      incrementedAttempts.push(id)
    },
    consume: async (id) => {
      consumed.push(id)
      return consumeSucceeds
    },
  }
  return { repository, created, incrementedAttempts, consumed }
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

function fakeOtpService(codeIsValid: boolean): OtpService {
  return {
    generate: () => ({ code: '123456', hash: 'hash-of-123456' }),
    verify: () => codeIsValid,
  }
}

function fakeTokenService(): TokenService {
  return {
    issueAccessToken: (payload) => `access-${payload.sub}`,
    issueRefreshToken: () => 'refresh-raw-token',
    verifyAccessToken: (token) => {
      if (token === 'access-c1') return ok({ sub: 'c1', kind: 'client' })
      if (token === 'access-staff-token') return ok({ sub: 's1', kind: 'staff', role: 'ADMIN' })
      return err({ code: 'session-expired', message: 'Session expirée.' })
    },
    hashRefreshToken: (token) => `hashed-${token}`,
  }
}

function allowingRateLimit(): RateLimitService {
  return { assertNotLocked: async () => ok(undefined) }
}

function lockedRateLimit(): RateLimitService {
  return {
    assertNotLocked: async () =>
      err({ code: 'too-many-attempts', message: 'Trop de tentatives, réessayez plus tard.' }),
  }
}

type Overrides = {
  clientAccountRepository?: ClientAccountRepository
  refreshTokenRepository?: RefreshTokenRepository
  otpRepository?: OtpRepository
  loginAttemptRepository?: LoginAttemptRepository
  loginLogRepository?: LoginLogRepository
  otpService?: OtpService
  tokenService?: TokenService
  otpRateLimitService?: RateLimitService
}

function buildService(overrides: Overrides = {}) {
  return new DefaultClientAuthService(
    overrides.clientAccountRepository ?? fakeClientAccountRepository(),
    overrides.refreshTokenRepository ?? fakeRefreshTokenRepository().repository,
    overrides.otpRepository ?? fakeOtpRepository().repository,
    overrides.loginAttemptRepository ?? fakeLoginAttemptRepository().repository,
    overrides.loginLogRepository ?? fakeLoginLogRepository().repository,
    overrides.otpService ?? fakeOtpService(true),
    overrides.tokenService ?? fakeTokenService(),
    overrides.otpRateLimitService ?? allowingRateLimit(),
  )
}

describe('DefaultClientAuthService.requestOtp', () => {
  it('creates an OTP for a known, active account', async () => {
    const otp = fakeOtpRepository(null)
    const service = buildService({ otpRepository: otp.repository })

    const result = await service.requestOtp({ phone: '+33612345601' }, {})

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(1)
  })

  it('succeeds generically for an unknown phone, without creating an OTP (anti-enumeration)', async () => {
    const otp = fakeOtpRepository(null)
    const service = buildService({ clientAccountRepository: fakeClientAccountRepository(null), otpRepository: otp.repository })

    const result = await service.requestOtp({ phone: '+33600000000' }, {})

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(0)
  })

  it('succeeds generically for an inactive account, without creating an OTP', async () => {
    const inactive: ClientAccountRecord = { ...ACCOUNT, isActive: false }
    const otp = fakeOtpRepository(null)
    const service = buildService({ clientAccountRepository: fakeClientAccountRepository(inactive), otpRepository: otp.repository })

    const result = await service.requestOtp({ phone: '+33612345601' }, {})

    expect(result.ok).toBe(true)
    expect(otp.created).toHaveLength(0)
  })

  it('records the attempt under kind OTP_REQUEST, keyed by phone, regardless of account existence', async () => {
    const attempts = fakeLoginAttemptRepository()
    const service = buildService({
      clientAccountRepository: fakeClientAccountRepository(null),
      loginAttemptRepository: attempts.repository,
    })

    await service.requestOtp({ phone: '+33600000000' }, { ipAddress: '203.0.113.1' })

    expect(attempts.records).toEqual([
      { kind: 'OTP_REQUEST', identifier: '+33600000000', succeeded: true, ipAddress: '203.0.113.1' },
    ])
  })

  it('rejects once the rate limit is reached, before creating an OTP', async () => {
    const otp = fakeOtpRepository(null)
    const service = buildService({ otpRepository: otp.repository, otpRateLimitService: lockedRateLimit() })

    const result = await service.requestOtp({ phone: '+33612345601' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-many-attempts')
    expect(otp.created).toHaveLength(0)
  })

  it('rejects an unknown phone the same way once rate-limited (no enumeration via the rate-limit gate)', async () => {
    const service = buildService({
      clientAccountRepository: fakeClientAccountRepository(null),
      otpRateLimitService: lockedRateLimit(),
    })

    const result = await service.requestOtp({ phone: '+33600000000' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-many-attempts')
  })
})

describe('DefaultClientAuthService.verifyOtp', () => {
  it('succeeds with a valid code and issues tokens', async () => {
    const otp = fakeOtpRepository()
    const refreshTokens = fakeRefreshTokenRepository()
    const loginLogs = fakeLoginLogRepository()
    const service = buildService({ refreshTokenRepository: refreshTokens.repository, otpRepository: otp.repository, loginLogRepository: loginLogs.repository })

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.user).toEqual({ id: 'c1', name: 'Yasmine Kaddour', phone: '+33612345601' })
    }
    expect(otp.consumed).toEqual(['otp1'])
    expect(refreshTokens.created).toHaveLength(1)
    const expectedExpiry = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    expect(refreshTokens.created[0].expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
    expect(loginLogs.records[0].succeeded).toBe(true)
  })

  it('rejects an unknown phone with the same generic error as a wrong code (anti-enumeration)', async () => {
    const service = buildService({ clientAccountRepository: fakeClientAccountRepository(null) })

    const result = await service.verifyOtp({ phone: '+33600000000', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
  })

  it('rejects when no valid OTP exists (expired or never requested) with the same generic error', async () => {
    const service = buildService({ otpRepository: fakeOtpRepository(null).repository })

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
  })

  it('produces an identical error for unknown account, expired OTP, and wrong code (no enumeration oracle)', async () => {
    const unknownAccountService = buildService({ clientAccountRepository: fakeClientAccountRepository(null) })
    const noOtpService = buildService({ otpRepository: fakeOtpRepository(null).repository })
    const wrongCodeService = buildService({ otpService: fakeOtpService(false) })

    const [unknownAccountResult, noOtpResult, wrongCodeResult] = await Promise.all([
      unknownAccountService.verifyOtp({ phone: '+33600000000', code: '123456' }, {}),
      noOtpService.verifyOtp({ phone: '+33612345601', code: '123456' }, {}),
      wrongCodeService.verifyOtp({ phone: '+33612345601', code: '123456' }, {}),
    ])

    expect(unknownAccountResult).toEqual(noOtpResult)
    expect(noOtpResult).toEqual(wrongCodeResult)
    if (!unknownAccountResult.ok) {
      expect(unknownAccountResult.error).toEqual({ code: 'invalid-otp', message: 'Code incorrect.' })
    }
  })

  it('rejects and increments attempts on a wrong code', async () => {
    const otp = fakeOtpRepository()
    const service = buildService({ otpRepository: otp.repository, otpService: fakeOtpService(false) })

    const result = await service.verifyOtp({ phone: '+33612345601', code: '000000' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
    expect(otp.incrementedAttempts).toEqual(['otp1'])
    expect(otp.consumed).toHaveLength(0)
  })

  it('rejects the loser of a concurrent consume race, without issuing tokens', async () => {
    const otp = fakeOtpRepository(VALID_OTP, false)
    const refreshTokens = fakeRefreshTokenRepository()
    const service = buildService({ refreshTokenRepository: refreshTokens.repository, otpRepository: otp.repository })

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-otp')
    expect(refreshTokens.created).toHaveLength(0)
  })

  it('rejects once the OTP has reached the max attempts, without checking the code', async () => {
    const maxedOut: OtpRecord = { ...VALID_OTP, attempts: 5 }
    const otp = fakeOtpRepository(maxedOut)
    const service = buildService({ otpRepository: otp.repository })

    const result = await service.verifyOtp({ phone: '+33612345601', code: '123456' }, {})

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-many-attempts')
    expect(otp.consumed).toHaveLength(0)
  })
})

describe('DefaultClientAuthService.getMe', () => {
  it('returns the user for a valid client access token', async () => {
    const service = buildService()

    const result = await service.getMe('access-c1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.phone).toBe('+33612345601')
  })

  it('rejects a staff access token used against the client service', async () => {
    const service = buildService()

    const result = await service.getMe('access-staff-token')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('session-expired')
  })
})

describe('DefaultClientAuthService.refresh', () => {
  const VALID_CLIENT_RECORD: RefreshTokenRecord = {
    id: 'rt1',
    tokenHash: 'hashed-refresh-raw-token',
    staffAccountId: null,
    clientAccountId: 'c1',
    expiresAt: new Date(Date.now() + 1000),
    revokedAt: null,
  }

  it('rotates the refresh token on success', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const service = buildService({ refreshTokenRepository: refreshTokens.repository })

    const result = await service.refresh(VALID_CLIENT_RECORD)

    expect(result.ok).toBe(true)
    expect(refreshTokens.revoked).toContain('hashed-refresh-raw-token')
    expect(refreshTokens.created).toHaveLength(1)
    const expectedExpiry = Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    expect(refreshTokens.created[0].expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
  })

  it('rejects without issuing a new token when it loses the revoke race (concurrent refresh)', async () => {
    const created: unknown[] = []
    const racingRefreshTokens: RefreshTokenRepository = {
      create: async (input) => {
        created.push(input)
      },
      findValidByHash: async () => VALID_CLIENT_RECORD,
      // Simulates another concurrent refresh() call having already revoked this token.
      revoke: async () => false,
    }
    const service = buildService({ refreshTokenRepository: racingRefreshTokens })

    const result = await service.refresh(VALID_CLIENT_RECORD)

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
      findValidByHash: async () => VALID_CLIENT_RECORD,
      revoke: async () => {
        throw new Error('transient database error')
      },
    }
    const service = buildService({ refreshTokenRepository: failingRefreshTokens })

    await expect(service.refresh(VALID_CLIENT_RECORD)).rejects.toThrow('transient database error')
    expect(created).toHaveLength(0)
  })

  it('rejects a refresh token record with no client account (e.g. owned by a staff member)', async () => {
    const staffOwned: RefreshTokenRecord = {
      id: 'rt2',
      tokenHash: 'hashed-refresh-raw-token',
      staffAccountId: 's1',
      clientAccountId: null,
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
    }
    const service = buildService()

    const result = await service.refresh(staffOwned)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-refresh-token')
  })

  it('rejects when the account is inactive', async () => {
    const inactive: ClientAccountRecord = { ...ACCOUNT, isActive: false }
    const service = buildService({ clientAccountRepository: fakeClientAccountRepository(inactive) })

    const result = await service.refresh(VALID_CLIENT_RECORD)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('account-inactive')
  })
})

describe('DefaultClientAuthService.logout', () => {
  it('revokes the refresh token', async () => {
    const refreshTokens = fakeRefreshTokenRepository()
    const service = buildService({ refreshTokenRepository: refreshTokens.repository })

    await service.logout('refresh-raw-token')

    expect(refreshTokens.revoked).toEqual(['hashed-refresh-raw-token'])
  })
})
