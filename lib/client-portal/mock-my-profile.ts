import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'
import type { MyProfile } from './types'

function daysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function hoursFromNow(hours: number): string {
  const date = new Date()
  date.setUTCHours(date.getUTCHours() + hours)
  return date.toISOString()
}

const currentSubscription: Subscription = {
  id: 'my-sub-current',
  clientId: 'my-client',
  planId: 'quarterly',
  startDate: daysFromNow(-45),
  endDate: daysFromNow(45),
  suspended: false,
  amountPaid: 105,
  paymentMethod: 'card',
  createdAt: daysFromNow(-45),
}

const pastSubscription: Subscription = {
  id: 'my-sub-past',
  clientId: 'my-client',
  planId: 'monthly',
  startDate: daysFromNow(-90),
  endDate: daysFromNow(-46),
  suspended: false,
  amountPaid: 40,
  paymentMethod: 'cash',
  createdAt: daysFromNow(-90),
}

const sessionHistory: SubscriberSession[] = [
  { type: 'subscriber', id: 'my-sess-1', clientId: 'my-client', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-20) },
  { type: 'subscriber', id: 'my-sess-2', clientId: 'my-client', amountPaid: 8, paymentMethod: 'card', checkedInAt: hoursFromNow(-90) },
  { type: 'subscriber', id: 'my-sess-3', clientId: 'my-client', amountPaid: 8, paymentMethod: 'cash', checkedInAt: hoursFromNow(-200) },
]

export const mockMyProfile: MyProfile = {
  client: {
    name: 'Camille Bernard',
    phone: '+33698712345',
    cardNumber: 'CARD-00099',
  },
  subscription: currentSubscription,
  subscriptionStatus: computeSubscriptionStatus(currentSubscription),
  subscriptionHistory: [currentSubscription, pastSubscription],
  sessionHistory,
}
