import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}
