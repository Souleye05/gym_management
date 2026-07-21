import { z } from 'zod'
import type { PaymentMethod } from '../domain/entities'

const API_PAYMENT_METHODS = ['cash', 'card', 'mobile_money'] as const

const API_TO_PAYMENT_METHOD: Record<(typeof API_PAYMENT_METHODS)[number], PaymentMethod> = {
  cash: 'CASH',
  card: 'CARD',
  mobile_money: 'MOBILE_MONEY',
}

export const RecordSubscriberSessionSchema = z
  .object({
    clientId: z.string().trim().min(1, { message: 'clientId est requis' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({ clientId: input.clientId, paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod] }))

export type RecordSubscriberSessionDto = z.infer<typeof RecordSubscriberSessionSchema>

const PHONE_PATTERN = /^\+\d{8,15}$/

export const RecordVisitorSessionSchema = z
  .object({
    fullName: z.string().trim().min(1, { message: 'Le nom est requis' }),
    phoneNumber: z.string().regex(PHONE_PATTERN, { message: 'Numéro de téléphone invalide' }),
    paymentMethod: z.enum(API_PAYMENT_METHODS, { message: 'paymentMethod invalide' }),
  })
  .transform((input) => ({
    visitorName: input.fullName,
    visitorPhone: input.phoneNumber,
    paymentMethod: API_TO_PAYMENT_METHOD[input.paymentMethod],
  }))

export type RecordVisitorSessionDto = z.infer<typeof RecordVisitorSessionSchema>
