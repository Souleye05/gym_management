// lib/sessions/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionBase = {
  id: string
  amountPaid: number // copied from settings.sessionPrice at creation time, never modified after
  paymentMethod: PaymentMethod
  checkedInAt: string // ISO datetime string
}

export type SubscriberSession = SessionBase & {
  type: 'subscriber'
  clientId: string
}

export type VisitorSession = SessionBase & {
  type: 'visitor'
  fullName: string
  phoneNumber: string
}

export type Session = SubscriberSession | VisitorSession
