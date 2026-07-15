import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

export type HistoryRow = {
  key: string
  label: string
  date: string
  amount: string
}

export function HistoryList({
  icon: Icon,
  title,
  rows,
  emptyMessage,
}: {
  icon: LucideIcon
  title: string
  rows: HistoryRow[]
  emptyMessage: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{row.label}</span>
                <span>{row.date}</span>
                <span>{row.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
