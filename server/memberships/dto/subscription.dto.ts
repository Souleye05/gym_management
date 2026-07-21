import { z } from 'zod'
import { PLAN_IDS, type PaymentMethod } from '../domain/entities'

const API_PLAN_IDS = ['monthly', 'quarterly', 'biannual', 'annual'] as const
const API_PAYMENT_METHODS = ['cash', 'card', 'mobile_money'] as const

const API_TO_PLAN_ID: Record<(typeof API_PLAN_IDS)[number], (typeof PLAN_IDS)[number]> = {
  monthly: 'MONTHLY',
  quarterly: 'QUARTERLY',
  biannual: 'BIANNUAL',
  annual: 'ANNUAL',
}

const API_TO_PAYMENT_METHOD: Record<(typeof API_PAYMENT_METHODS)[number], PaymentMethod> = {
  cash: 'CASH',
  card: 'CARD',
  mobile_money: 'MOBILE_MONEY',
}

export const CreateOrRenewSubscriptionSchema = z
  .object({
    clientId: z.string().trim().min(1, { message: 'clientId est requis' }),
    planId: z.enum(API_PLAN_IDS, { message: 'planId invalide' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({
    clientId: input.clientId,
    planId: API_TO_PLAN_ID[input.planId],
    paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod],
  }))

export type CreateOrRenewSubscriptionDto = z.infer<typeof CreateOrRenewSubscriptionSchema>
