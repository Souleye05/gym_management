'use client'

import { Avatar } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { topMembers } from '@/lib/mock-data'

export function TopMembers() {
  const max = Math.max(...topMembers.map((m) => m.sessions))

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Membres les plus assidus</CardTitle>
        <CardDescription>Ce mois-ci · nombre de séances</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {topMembers.map((member, index) => (
          <div key={member.id} className="flex items-center gap-3">
            <span className="w-4 text-sm font-semibold text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <Avatar name={member.name} className="size-8" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{member.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {member.sessions} séances
                </span>
              </div>
              <Progress
                value={(member.sessions / max) * 100}
                className="h-1.5"
                indicatorClassName={index === 0 ? 'bg-gradient-brand' : 'bg-primary/70'}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
