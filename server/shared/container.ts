import { prismaClient } from './prisma-client'
import { PrismaStaffAccountRepository } from '../auth/infrastructure/prisma-staff-account.repository'
import { PrismaClientAccountRepository } from '../auth/infrastructure/prisma-client-account.repository'
import { PrismaRefreshTokenRepository } from '../auth/infrastructure/prisma-refresh-token.repository'
import { PrismaOtpRepository } from '../auth/infrastructure/prisma-otp.repository'
import { PrismaLoginAttemptRepository } from '../auth/infrastructure/prisma-login-attempt.repository'
import { PrismaLoginLogRepository } from '../auth/infrastructure/prisma-login-log.repository'
import { Argon2PasswordService } from '../auth/infrastructure/argon2-password.service'
import { JwtTokenService } from '../auth/infrastructure/jwt-token.service'
import { Sha256OtpService } from '../auth/infrastructure/sha256-otp.service'
import { LoginRateLimitService } from '../auth/services/login-rate-limit.service'
import { OtpRateLimitService } from '../auth/services/otp-rate-limit.service'
import { DefaultStaffAuthService } from '../auth/services/default-staff-auth.service'
import { DefaultClientAuthService } from '../auth/services/default-client-auth.service'
import { DefaultRefreshTokenLookupService } from '../auth/services/default-refresh-token-lookup.service'
import type { StaffAuthService } from '../auth/services/staff-auth.service'
import type { ClientAuthService } from '../auth/services/client-auth.service'
import type { RefreshTokenLookupService } from '../auth/services/refresh-token-lookup.service'
import { PrismaClientRepository } from '../clients/infrastructure/prisma-client.repository'
import { DefaultClientService } from '../clients/services/default-client.service'
import type { ClientService } from '../clients/services/client.service'
import { PrismaSubscriptionRepository } from '../memberships/infrastructure/prisma-subscription.repository'
import { PrismaSessionRepository } from '../memberships/infrastructure/prisma-session.repository'
import { DefaultClientHistoryService } from '../memberships/services/default-client-history.service'
import type { ClientHistoryService } from '../memberships/services/client-history.service'
import { PrismaSettingsRepository } from '../settings/infrastructure/prisma-settings.repository'
import { DefaultSettingsService } from '../settings/services/default-settings.service'
import type { SettingsService } from '../settings/services/settings.service'
import { DefaultStaffSubscriptionService } from '../memberships/services/default-staff-subscription.service'
import type { StaffSubscriptionService } from '../memberships/services/staff-subscription.service'
import { DefaultStaffSessionService } from '../memberships/services/default-staff-session.service'
import type { StaffSessionService } from '../memberships/services/staff-session.service'

export type Container = {
  staffAuthService: StaffAuthService
  clientAuthService: ClientAuthService
  refreshTokenLookupService: RefreshTokenLookupService
  clientService: ClientService
  clientHistoryService: ClientHistoryService
  staffSubscriptionService: StaffSubscriptionService
  staffSessionService: StaffSessionService
  settingsService: SettingsService
}

function createContainer(): Container {
  const jwtSecret = process.env.AUTH_JWT_SECRET
  if (!jwtSecret) {
    throw new Error('AUTH_JWT_SECRET environment variable is not set')
  }

  const staffAccountRepository = new PrismaStaffAccountRepository(prismaClient)
  const clientAccountRepository = new PrismaClientAccountRepository(prismaClient)
  const refreshTokenRepository = new PrismaRefreshTokenRepository(prismaClient)
  const otpRepository = new PrismaOtpRepository(prismaClient)
  const loginAttemptRepository = new PrismaLoginAttemptRepository(prismaClient)
  const loginLogRepository = new PrismaLoginLogRepository(prismaClient)

  const passwordService = new Argon2PasswordService()
  const tokenService = new JwtTokenService(jwtSecret)
  const otpService = new Sha256OtpService()
  const rateLimitService = new LoginRateLimitService(loginAttemptRepository)
  const otpRateLimitService = new OtpRateLimitService(loginAttemptRepository)
  const refreshTokenLookupService = new DefaultRefreshTokenLookupService(refreshTokenRepository, tokenService)

  const staffAuthService = new DefaultStaffAuthService(
    staffAccountRepository,
    refreshTokenRepository,
    loginAttemptRepository,
    loginLogRepository,
    passwordService,
    tokenService,
    rateLimitService,
  )

  const clientAuthService = new DefaultClientAuthService(
    clientAccountRepository,
    refreshTokenRepository,
    otpRepository,
    loginAttemptRepository,
    loginLogRepository,
    otpService,
    tokenService,
    otpRateLimitService,
  )

  const clientRepository = new PrismaClientRepository(prismaClient)
  const clientService = new DefaultClientService(clientRepository)

  const subscriptionRepository = new PrismaSubscriptionRepository(prismaClient)
  const sessionRepository = new PrismaSessionRepository(prismaClient)
  const clientHistoryService = new DefaultClientHistoryService(subscriptionRepository, sessionRepository)

  const settingsRepository = new PrismaSettingsRepository(prismaClient)
  const settingsService = new DefaultSettingsService(settingsRepository)

  const staffSubscriptionService = new DefaultStaffSubscriptionService(subscriptionRepository, clientService)
  const staffSessionService = new DefaultStaffSessionService(subscriptionRepository, sessionRepository, clientService, settingsService)

  return { staffAuthService, clientAuthService, refreshTokenLookupService, clientService, clientHistoryService, staffSubscriptionService, staffSessionService, settingsService }
}

declare global {
  // eslint-disable-next-line no-var
  var __authContainer: Container | undefined
}

export function getContainer(): Container {
  if (!globalThis.__authContainer) {
    globalThis.__authContainer = createContainer()
  }
  return globalThis.__authContainer
}
