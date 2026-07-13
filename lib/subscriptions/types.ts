export type PlanId = 'monthly' | 'quarterly' | 'biannual' | 'annual'

export type Plan = {
  id: PlanId
  label: string
  durationDays: number
  price: number
}

export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'suspended'

export type PaymentMethod = 'cash' | 'card' | 'mobile_money'

export type Subscription = {
  id: string
  clientId: string
  planId: PlanId
  startDate: string
  endDate: string
  suspended: boolean
  amountPaid: number
  paymentMethod: PaymentMethod
  createdAt: string
}
