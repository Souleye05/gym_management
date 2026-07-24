import { PLAN_CATALOG } from '../../memberships/domain/plan-catalog'
import type { PlanId, SessionType } from '../../memberships/domain/entities'
import type { ActivityItem } from './entities'

export type ActivityFeedSources = {
  subscriptionEvents: { id: string; clientId: string; clientName: string; planId: PlanId; amountPaid: number; createdAt: Date; isFirstForClient: boolean }[]
  sessionEvents: { id: string; clientId: string | null; name: string; type: SessionType; checkedInAt: Date }[]
  signupEvents: { id: string; clientId: string; name: string; createdAt: Date }[]
  expirationEvents: { id: string; clientId: string; clientName: string; endDate: Date }[]
}

/** Merges the 4 activity sources into one feed, sorted by occurrence time descending, truncated to `limit`. */
export function mergeActivityFeed(sources: ActivityFeedSources, limit: number): ActivityItem[] {
  const items: ActivityItem[] = [
    ...sources.subscriptionEvents.map((event) => ({
      id: event.id,
      type: event.isFirstForClient ? ('payment' as const) : ('renewal' as const),
      clientId: event.clientId,
      name: event.clientName,
      detail: `${PLAN_CATALOG[event.planId].label} · ${event.amountPaid} €`,
      occurredAt: event.createdAt,
    })),
    ...sources.sessionEvents.map((event) => ({
      id: event.id,
      type: 'session' as const,
      clientId: event.clientId,
      name: event.name,
      detail: event.type === 'SUBSCRIBER' ? 'Séance validée' : 'Séance visiteur',
      occurredAt: event.checkedInAt,
    })),
    ...sources.signupEvents.map((event) => ({
      id: event.id,
      type: 'signup' as const,
      clientId: event.clientId,
      name: event.name,
      detail: 'Nouveau membre',
      occurredAt: event.createdAt,
    })),
    ...sources.expirationEvents.map((event) => ({
      id: event.id,
      type: 'expired' as const,
      clientId: event.clientId,
      name: event.clientName,
      detail: 'À relancer',
      occurredAt: event.endDate,
    })),
  ]

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  return items.slice(0, limit)
}
