'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { ClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

export function ClientSearch({
  clientRepository,
  onSelect,
}: {
  clientRepository: ClientRepository
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => clientRepository.search(query), [clientRepository, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="pl-9"
          autoFocus
        />
      </div>
      {query.trim().length > 0 && (
        <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun client trouvé.</p>
          ) : (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => onSelect(client)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
              >
                <Avatar name={client.name} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{client.name}</span>
                  <span className="text-xs text-muted-foreground">{client.phone}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
