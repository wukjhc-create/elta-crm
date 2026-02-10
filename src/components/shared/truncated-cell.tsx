'use client'

import { cn } from '@/lib/utils'

interface TruncatedCellProps {
  text: string | null | undefined
  maxWidth?: string
  className?: string
}

export function TruncatedCell({ text, maxWidth = 'max-w-[200px]', className }: TruncatedCellProps) {
  if (!text) return <span className="text-muted-foreground">-</span>

  return (
    <span
      title={text}
      className={cn('block truncate', maxWidth, className)}
    >
      {text}
    </span>
  )
}
