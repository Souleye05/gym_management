// server/memberships/services/default-staff-session.service.ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { err, ok, type Result } from '../../shared/result'
import type { ClientService } from '../../clients/services/client.service'
import type { SettingsService } from '../../settings/services/settings.service'
import { checkSessionEligibility } from '../domain/check-session-eligibility'
import type { Session } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'
import type { SessionRepository } from '../repositories/session.repository'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { RecordSubscriberSessionInput, RecordVisitorSessionInput, StaffSessionService } from './staff-session.service'

const SOURCE = 'StaffSessionService'
const CLIENT_NOT_FOUND: MembershipDomainError = { code: 'client-not-found', message: 'Client introuvable.' }

const INELIGIBLE_MESSAGES: Record<'none' | 'expired' | 'suspended', string> = {
  none: "Ce client n'a pas d'abonnement valide.",
  expired: 'L\'abonnement de ce client est expiré.',
  suspended: 'L\'abonnement de ce client est suspendu.',
}

export class DefaultStaffSessionService implements StaffSessionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly clientService: ClientService,
    private readonly settingsService: SettingsService,
  ) {}

  async recordSubscriberSession(input: RecordSubscriberSessionInput): Promise<Result<Session, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const clientResult = await this.clientService.getClient(input.clientId)
      if (!clientResult.ok) return err(CLIENT_NOT_FOUND)

      const subscriptions = await this.subscriptionRepository.findAllByClientId(input.clientId)
      const eligibility = checkSessionEligibility(subscriptions, new Date())
      if (!eligibility.allowed) {
        return err({ code: 'session-ineligible', message: INELIGIBLE_MESSAGES[eligibility.reason], reason: eligibility.reason })
      }

      const settings = await this.settingsService.getSettings()
      const session = await this.sessionRepository.create({
        type: 'SUBSCRIBER',
        clientId: input.clientId,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(session)
    })
  }

  async recordVisitorSession(input: RecordVisitorSessionInput): Promise<Result<Session, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const settings = await this.settingsService.getSettings()
      const session = await this.sessionRepository.create({
        type: 'VISITOR',
        visitorName: input.visitorName,
        visitorPhone: input.visitorPhone,
        amountPaid: settings.sessionPrice,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(session)
    })
  }
}
