'use client'

import { Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClientForm } from '@/components/clients/client-form'
import { ClientStatusBadge } from '@/components/clients/client-status-badge'
import { useClientStatus } from '@/components/clients/use-client-status'
import { useClients } from '@/components/providers/clients-provider'
import type { Client, ClientStatus } from '@/lib/clients/types'

const STATUS_FILTERS: { value: ClientStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'expiring', label: 'Expire bientôt' },
  { value: 'expired', label: 'Expiré' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'none', label: 'Aucun abonnement' },
]

function StatusFilteredRow({
  client,
  statusFilter,
  onClick,
}: {
  client: Client
  statusFilter: ClientStatus | 'all'
  onClick: () => void
}) {
  const status = useClientStatus(client.id)
  if (statusFilter !== 'all' && status !== statusFilter) return null
  return (
    <TableRow onClick={onClick}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={client.name} />
          <span className="font-medium">{client.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{client.phone}</TableCell>
      <TableCell>
        <ClientStatusBadge status={status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(client.joinedAt).toLocaleDateString('fr-FR')}
      </TableCell>
    </TableRow>
  )
}

export default function ClientsPage() {
  const router = useRouter()
  const { clients, isLoading, isError, refetch, addClient, clientRepository } = useClients()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>(undefined)

  const [searchResults, setSearchResults] = useState<Client[] | null>(null)
  const [searchError, setSearchError] = useState<string | undefined>(undefined)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      ++requestIdRef.current // invalidate any in-flight search so a stale response can't clobber the cleared state
      setSearchResults(null)
      setSearchError(undefined)
      return
    }
    const requestId = ++requestIdRef.current
    setSearchError(undefined)
    clientRepository
      .search(trimmed)
      .then((results) => {
        if (requestIdRef.current !== requestId) return
        setSearchResults(results)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setSearchError('Erreur de recherche.')
      })
  }, [clientRepository, query])

  const queryFiltered = searchResults ?? clients

  const handleCreate = (values: { name: string; phone: string; email?: string }) => {
    setCreateError(undefined)
    addClient(values, {
      onSuccess: () => setCreateOpen(false),
      onError: (message) => setCreateError(message),
    })
  }

  const handleOpenCreate = () => {
    setCreateError(undefined)
    setCreateOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Impossible de charger la liste des clients.</p>
        <Button variant="outline" onClick={refetch}>
          Réessayer
        </Button>
      </div>
    )
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
          onClick={handleOpenCreate}
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

      {searchError ? (
        <p role="alert" className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-destructive">
          {searchError}
        </p>
      ) : queryFiltered.length === 0 ? (
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
            {queryFiltered.map((client) => (
              <StatusFilteredRow
                key={client.id}
                client={client}
                statusFilter={statusFilter}
                onClick={() => router.push(`/clients/${client.id}`)}
              />
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
          serverError={createError}
        />
      </Dialog>
    </div>
  )
}
