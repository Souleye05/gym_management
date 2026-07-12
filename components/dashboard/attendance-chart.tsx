'use client'

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { attendanceSeries } from '@/lib/mock-data'

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{payload[0].value}</span> séances
      </p>
    </div>
  )
}

export function AttendanceChart() {
  const max = Math.max(...attendanceSeries.map((d) => d.sessions))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fréquentation hebdomadaire</CardTitle>
        <CardDescription>Séances par jour · cette semaine</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceSeries} margin={{ left: 0, right: 0, top: 4 }}>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--color-muted-foreground)' }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }} />
              <Bar dataKey="sessions" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {attendanceSeries.map((entry) => (
                  <Cell
                    key={entry.day}
                    fill={
                      entry.sessions === max
                        ? 'var(--color-chart-2)'
                        : 'var(--color-chart-1)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
