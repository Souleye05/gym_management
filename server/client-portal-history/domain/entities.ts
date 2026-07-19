export type PlanId = 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL'
export type SessionType = 'SUBSCRIBER' | 'VISITOR'
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY'

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
