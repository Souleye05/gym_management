import { Users } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ClientsPage() {
  return (
    <EmptyState
      icon={Users}
      title="Gestion des clients"
      description="La liste des clients, la recherche et la création de fiches arrivent bientôt."
    />
  )
}
