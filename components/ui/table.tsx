import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function TableHeader({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border bg-muted/40">{children}</thead>
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>
}

export function TableRow({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        onClick && 'cursor-pointer transition-colors hover:bg-muted/50',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </th>
  )
}

export function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3', className)}>{children}</td>
}
