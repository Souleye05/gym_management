'use client'

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { planDistribution } from '@/lib/mock-data'

export function PlanDistribution() {
  const total = planDistribution.reduce((acc, d) => acc + d.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Répartition des abonnements</CardTitle>
        <CardDescription>Par type de formule</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={planDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={3}
                stroke="none"
              >
                {planDistribution.map((entry) => (
                  <Cell key={entry.name} fill={`var(--color-${entry.key})`} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
            <span className="text-xs text-muted-foreground">membres</span>
          </div>
        </div>
        <ul className="flex w-full flex-col gap-2.5">
          {planDistribution.map((entry) => (
            <li key={entry.name} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-2.5 rounded-full"
                style={{ background: `var(--color-${entry.key})` }}
              />
              <span className="flex-1 text-muted-foreground">{entry.name}</span>
              <span className="font-medium tabular-nums">{entry.value}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {Math.round((entry.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
