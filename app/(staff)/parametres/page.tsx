import { Settings } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

export default function ParametresPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Paramètres"
      description="La configuration des tarifs, des employés et des permissions arrive bientôt."
    />
  )
}
