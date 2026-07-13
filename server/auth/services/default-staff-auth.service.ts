import { err, ok, type Result } from '../../shared/result'
import type { RequestContext } from '../../shared/request-context'
import type { StaffLoginDto } from '../dto/staff-login.dto'
import type { AuthDomainError } from '../domain/errors'
import type { StaffUser } from '../domain/entities'
import type { AuthTokens } from '../domain/tokens'
import type { StaffAccountRepository } from '../repositories/staff-account.repository'
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository'
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository'
import type { LoginLogRepository } from '../repositories/login-log.repository'
import type { PasswordService } from './password.service'
import type { TokenService } from './token.service'
import type { RateLimitService } from './rate-limit.service'
import type { StaffAuthService } from './staff-auth.service'

const REFRESH_TOKEN_DURATION_MS = 30 * 24 * 60 * 60 * 1000

const INVALID_CREDENTIALS: AuthDomainError = {
  code: 'invalid-credentials',
  message: 'Identifiants invalides.',
}

export class DefaultStaffAuthService implements StaffAuthService {
  constructor(
    private readonly staffAccountRepository: StaffAccountRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly loginAttemptRepository: LoginAttemptRepository,
    private readonly loginLogRepository: LoginLogRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async login(
    input: StaffLoginDto,
    context: RequestContext,
  ): Promise<Result<{ user: StaffUser; tokens: AuthTokens }, AuthDomainError>> {
    const notLocked = await this.rateLimitService.assertNotLocked(input.email)
    if (!notLocked.ok) return err(notLocked.error)

    const account = await this.staffAccountRepository.findByEmail(input.email)
    if (!account || !account.isActive) {
      await this.recordFailure(input.email, context, account?.id)
      return err(INVALID_CREDENTIALS)
    }

    const passwordValid = await this.passwordService.verify(input.password, account.passwordHash)
    if (!passwordValid) {
      await this.recordFailure(input.email, context, account.id)
      return err(INVALID_CREDENTIALS)
    }

    await this.loginAttemptRepository.record({
      identifier: input.email,
      succeeded: true,
      staffAccountId: account.id,
      ipAddress: context.ipAddress,
    })
    await this.loginLogRepository.record({
      kind: 'staff',
      succeeded: true,
      staffAccountId: account.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })

    const user: StaffUser = { id: account.id, name: account.name, email: account.email, role: account.role }
    const tokens = await this.issueTokens(account.id, user.role, context)

    return ok({ user, tokens })
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken)
    await this.refreshTokenRepository.revoke(tokenHash)
  }

  async getMe(accessToken: string): Promise<Result<StaffUser, AuthDomainError>> {
    const payload = this.tokenService.verifyAccessToken(accessToken)
    if (!payload.ok) return err(payload.error)
    if (payload.value.kind !== 'staff') {
      return err({ code: 'session-expired', message: 'Session expirée.' })
    }

    const account = await this.staffAccountRepository.findById(payload.value.sub)
    if (!account || !account.isActive) {
      return err({ code: 'account-inactive', message: 'Compte désactivé.' })
    }

    return ok({ id: account.id, name: account.name, email: account.email, role: account.role })
  }

  async refresh(refreshToken: string): Promise<Result<AuthTokens, AuthDomainError>> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken)
    const stored = await this.refreshTokenRepository.findValidByHash(tokenHash)
    if (!stored || !stored.staffAccountId) {
      return err({ code: 'invalid-refresh-token', message: 'Session expirée.' })
    }

    const account = await this.staffAccountRepository.findById(stored.staffAccountId)
    if (!account || !account.isActive) {
      return err({ code: 'account-inactive', message: 'Compte désactivé.' })
    }

    const tokens = await this.issueTokens(account.id, account.role, {})
    await this.refreshTokenRepository.revoke(tokenHash)

    return ok(tokens)
  }

  private async recordFailure(email: string, context: RequestContext, staffAccountId?: string): Promise<void> {
    await this.loginAttemptRepository.record({
      identifier: email,
      succeeded: false,
      staffAccountId,
      ipAddress: context.ipAddress,
    })
    await this.loginLogRepository.record({
      kind: 'staff',
      succeeded: false,
      staffAccountId,
      reason: INVALID_CREDENTIALS.code,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
  }

  private async issueTokens(
    staffAccountId: string,
    role: StaffUser['role'],
    context: RequestContext,
  ): Promise<AuthTokens> {
    const accessToken = this.tokenService.issueAccessToken({ sub: staffAccountId, kind: 'staff', role })
    const refreshToken = this.tokenService.issueRefreshToken()

    await this.refreshTokenRepository.create({
      tokenHash: this.tokenService.hashRefreshToken(refreshToken),
      ownerId: staffAccountId,
      ownerKind: 'staff',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DURATION_MS),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    })

    return { accessToken, refreshToken }
  }
}
