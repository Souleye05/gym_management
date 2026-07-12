import { AttendanceChart } from '@/components/dashboard/attendance-chart'
import { ExpiringSubscriptions } from '@/components/dashboard/expiring-subscriptions'
import { PlanDistribution } from '@/components/dashboard/plan-distribution'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { StatCards } from '@/components/dashboard/stat-cards'
import { TopMembers } from '@/components/dashboard/top-members'

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble de l'activité de la salle aujourd'hui.
        </p>
      </div>

      <StatCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <PlanDistribution />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceChart />
        </div>
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentActivity />
        <ExpiringSubscriptions />
      </div>

      <TopMembers />
    </div>
  )
}
