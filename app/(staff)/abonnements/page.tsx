// app/(staff)/abonnements/page.tsx
'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SubscriptionStatusBadge } from '@/components/subscriptions/subscription-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { useClients } from '@/components/providers/clients-provider'
import { useSubscriptions } from '@/components/providers/subscriptions-provider'
import { PLANS } from '@/lib/subscriptions/plans'
import type { Client } from '@/lib/clients/types'
import type { SubscriptionStatus } from '@/lib/subscriptions/types'

const STATUS_FILTERS: { value: SubscriptionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'suspended', label: 'Suspendu' },
]

function planLabel(planId: string): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId
}

function SubscriptionRow({
  client,
  statusFilter,
  onClick,
}: {
  client: Client
  statusFilter: SubscriptionStatus | 'all'
  onClick: () => void
}) {
  const { getCurrentSubscription } = useSubscriptions()
  const status = useClientStatus(client.id)
  const subscription = getCurrentSubscription(client.id)

  if (!subscription) return null
  if (status === 'none') return null // unreachable given the subscription check above; satisfies the type checker
  if (statusFilter !== 'all' && status !== statusFilter) return null

  return (
    <TableRow onClick={onClick}>
      <TableCell className="font-medium">{client.name}</TableCell>
      <TableCell className="text-muted-foreground">{planLabel(subscription.planId)}</TableCell>
      <TableCell>
        <SubscriptionStatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(subscription.endDate).toLocaleDateString('fr-FR')}
      </TableCell>
    </TableRow>
  )
}

export default function AbonnementsPage() {
  const router = useRouter()
  const { clients } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | 'all'>('all')

  const queryFiltered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) return clients
    return clients.filter((client) => client.name.toLowerCase().includes(normalizedQuery))
  }, [clients, query])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Abonnements</h1>
        <p className="text-sm text-muted-foreground">Vue d'ensemble des abonnements clients.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom de client…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={
                statusFilter === filter.value
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Formule</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Expire le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queryFiltered.map((client) => (
            <SubscriptionRow
              key={client.id}
              client={client}
              statusFilter={statusFilter}
              onClick={() => router.push(`/clients/${client.id}`)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
