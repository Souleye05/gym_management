'use client'

import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { AsyncClientRepository } from '@/lib/clients/repository'
import type { Client } from '@/lib/clients/types'

export function ClientSearch({
  clientRepository,
  onSelect,
}: {
  clientRepository: AsyncClientRepository
  onSelect: (client: Client) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setIsSearching(false)
      setSearchError(false)
      return
    }
    const requestId = ++requestIdRef.current
    setIsSearching(true)
    setSearchError(false)
    clientRepository
      .search(trimmed)
      .then((clients) => {
        if (requestIdRef.current !== requestId) return // a newer search superseded this one
        setResults(clients)
        setIsSearching(false)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return // a newer search superseded this one
        setIsSearching(false)
        setSearchError(true)
      })
  }, [clientRepository, query])

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
          {isSearching ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Recherche…</p>
          ) : searchError ? (
            <p role="alert" className="py-4 text-center text-sm text-muted-foreground">
              Erreur de recherche.
            </p>
          ) : results.length === 0 ? (
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
