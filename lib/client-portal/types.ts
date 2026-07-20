import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

export type MyProfile = {
  client: {
    name: string
    phone: string
    cardNumber: string
  }
  subscription: Subscription | null
  subscriptionStatus: ClientStatus
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}
