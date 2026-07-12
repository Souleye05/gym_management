import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Progress({
  value = 0,
  className,
  indicatorClassName,
  ...props
}: ComponentProps<'div'> & { value?: number; indicatorClassName?: string }) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-500 ease-out',
          indicatorClassName,
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export { Progress }
