import type { Session, Subscription } from '../domain/entities'

export type ClientHistory = {
  currentSubscription: Subscription | null
  subscriptions: Subscription[]
  recentSessions: Session[]
}

export interface ClientHistoryService {
  getHistory(clientId: string): Promise<ClientHistory>
}
