'use client'

import { Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientForm } from '@/components/clients/client-form'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClients } from '@/components/providers/clients-provider'
import type { ClientStatus } from '@/lib/clients/types'

const STATUS_FILTERS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'none', label: 'Aucun abonnement' },
]

export default function ClientsPage() {
  const router = useRouter()
  const { clients, addClient } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return clients.filter((client) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        client.name.toLowerCase().includes(normalizedQuery) ||
        client.phone.toLowerCase().includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [clients, query, statusFilter])

  const handleCreate = (values: { name: string; phone: string; email?: string }) => {
    addClient(values)
    setCreateOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} client{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}.
          </p>
        </div>
        <Button
          className="bg-gradient-brand text-primary-foreground sm:w-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          Ajouter un client
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom ou téléphone…"
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

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucun client trouvé.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Inscrit le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((client) => (
              <TableRow key={client.id} onClick={() => router.push(`/clients/${client.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name} />
                    <span className="font-medium">{client.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{client.phone}</TableCell>
                <TableCell>
                  <ClientStatusBadge status={client.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(client.joinedAt).toLocaleDateString('fr-FR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogHeader>
          <DialogTitle>Ajouter un client</DialogTitle>
          <DialogDescription>Créez une nouvelle fiche client.</DialogDescription>
        </DialogHeader>
        <ClientForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Créer"
        />
      </Dialog>
    </div>
  )
}
