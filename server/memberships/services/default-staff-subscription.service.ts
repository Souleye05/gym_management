// server/memberships/services/default-staff-subscription.service.ts
import { guardAgainstLeakingInternals } from '../../shared/guard-against-leaking-internals'
import { err, ok, type Result } from '../../shared/result'
import type { ClientService } from '../../clients/services/client.service'
import type { Subscription } from '../domain/entities'
import type { MembershipDomainError } from '../domain/errors'
import { PLAN_CATALOG } from '../domain/plan-catalog'
import type { SubscriptionRepository } from '../repositories/subscription.repository'
import type { CreateOrRenewSubscriptionInput, StaffSubscriptionService } from './staff-subscription.service'

const SOURCE = 'StaffSubscriptionService'
const CLIENT_NOT_FOUND: MembershipDomainError = { code: 'client-not-found', message: 'Client introuvable.' }
const SUBSCRIPTION_NOT_FOUND: MembershipDomainError = { code: 'subscription-not-found', message: 'Abonnement introuvable.' }

export class DefaultStaffSubscriptionService implements StaffSubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly clientService: ClientService,
  ) {}

  async createOrRenewSubscription(
    input: CreateOrRenewSubscriptionInput,
  ): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const clientResult = await this.clientService.getClient(input.clientId)
      if (!clientResult.ok) return err(CLIENT_NOT_FOUND)

      const subscriptions = await this.subscriptionRepository.findAllByClientId(input.clientId)
      const latest = subscriptions[0] ?? null

      const now = new Date()
      const startDate = latest && latest.endDate > now ? latest.endDate : now
      const plan = PLAN_CATALOG[input.planId]
      const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)

      const subscription = await this.subscriptionRepository.create({
        clientId: input.clientId,
        planId: input.planId,
        startDate,
        endDate,
        amountPaid: plan.price,
        paymentMethod: input.paymentMethod,
        createdByStaffId: input.createdByStaffId,
      })

      return ok(subscription)
    })
  }

  async suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.subscriptionRepository.findById(id)
      if (!existing) return err(SUBSCRIPTION_NOT_FOUND)
      return ok(await this.subscriptionRepository.setSuspended(id, true))
    })
  }

  async reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>> {
    return guardAgainstLeakingInternals(SOURCE, async () => {
      const existing = await this.subscriptionRepository.findById(id)
      if (!existing) return err(SUBSCRIPTION_NOT_FOUND)
      return ok(await this.subscriptionRepository.setSuspended(id, false))
    })
  }
}
