import { BarChart3 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function StatistiquesPage() {
  return (
    <EmptyState
      icon={BarChart3}
      title="Statistiques"
      description="Les graphiques détaillés de revenus, fréquentation et abonnements arrivent bientôt."
    />
  )
}
