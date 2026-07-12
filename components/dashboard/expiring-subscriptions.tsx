'use client'

import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { expiringMembers } from '@/lib/mock-data'

export function ExpiringSubscriptions() {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" />
          <CardTitle className="text-base">Abonnements à relancer</CardTitle>
        </div>
        <Button variant="ghost" size="sm">
          Tout voir
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col">
        {expiringMembers.map((member) => (
          <button
            key={member.id}
            type="button"
            className="-mx-2 flex items-center gap-3 rounded-lg border-b border-border px-2 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
          >
            <Avatar name={member.name} className="size-9" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{member.name}</span>
              <span className="text-xs text-muted-foreground">
                {member.plan} · vu {member.lastVisit}
              </span>
            </div>
            {member.status === 'expired' ? (
              <Badge variant="destructive">Expiré</Badge>
            ) : (
              <Badge variant="warning">
                {member.daysLeft} j
              </Badge>
            )}
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
