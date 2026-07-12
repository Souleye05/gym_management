'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currency, revenueSeries } from '@/lib/mock-data'

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="size-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="capitalize">{entry.dataKey}</span>
          <span className="ml-auto font-medium text-foreground">
            {currency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  )
}

export function RevenueChart() {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Évolution des revenus</CardTitle>
          <CardDescription>9 derniers mois · objectif vs. réalisé</CardDescription>
        </div>
        <Badge variant="success">+12,4%</Badge>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueSeries} margin={{ left: -12, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v) => `${v / 1000}k`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
              <Area
                type="monotone"
                dataKey="objectif"
                stroke="var(--color-muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                fill="transparent"
              />
              <Area
                type="monotone"
                dataKey="revenus"
                stroke="var(--color-chart-1)"
                strokeWidth={2.5}
                fill="url(#fillRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
