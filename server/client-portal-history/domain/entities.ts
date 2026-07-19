// Each union is derived from its runtime array so the type can never drift from the values an
// infrastructure-layer validator checks a raw database row against (see infrastructure/validate-enum.ts).
export const PLAN_IDS = ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const SESSION_TYPES = ['SUBSCRIBER', 'VISITOR'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE_MONEY'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type Subscription = {
  id: string
  clientId: string
  planId: PlanId
  startDate: Date
  endDate: Date
  suspended: boolean
  amountPaid: number
  paymentMethod: PaymentMethod
  createdAt: Date
}

export type Session = {
  id: string
  type: SessionType
  clientId: string | null
  visitorName: string | null
  visitorPhone: string | null
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: Date
}
