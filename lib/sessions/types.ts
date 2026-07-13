import type { PaymentMethod } from '@/lib/subscriptions/types'

export type Session = {
  id: string
  clientId: string
  amountPaid: number
  paymentMethod: PaymentMethod
  checkedInAt: string // ISO datetime string
}
