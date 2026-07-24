import type { PlanId } from '../../memberships/domain/entities'

export type KpiValue = {
  value: number
  deltaPercent: number
  trend: 'up' | 'down'
}

export type ActivityType = 'payment' | 'renewal' | 'session' | 'signup' | 'expired'

export type ActivityItem = {
  id: string
  type: ActivityType
  clientId: string | null
  name: string
  detail: string
  occurredAt: Date
}

export type ExpiringSubscriptionStatus = 'expiring' | 'expired'

export type ExpiringSubscription = {
  clientId: string
  name: string
  planId: PlanId
  status: ExpiringSubscriptionStatus
  daysLeft: number
  lastVisitAt: Date | null
}

export type TopMember = {
  clientId: string
  name: string
  planId: PlanId
  sessionsCount: number
}

export type DashboardStatistics = {
  kpis: {
    revenue: KpiValue
    activeClients: KpiValue
    sessionsToday: KpiValue
    expiredSubscriptions: KpiValue
  }
  revenueSeries: { month: string; revenue: number }[]
  attendanceSeries: { day: string; sessions: number }[]
  planDistribution: { planId: PlanId; count: number }[]
  recentActivity: ActivityItem[]
  expiringSubscriptions: ExpiringSubscription[]
  topMembers: TopMember[]
}
