import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Avatar({
  name,
  className,
  ...props
}: ComponentProps<'div'> & { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div
      data-slot="avatar"
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground select-none',
        className,
      )}
      {...props}
    >
      {initials}
    </div>
  )
}

export { Avatar }
