import { type HTMLAttributes } from 'react'
import { clsx } from 'clsx'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-primary text-primary-foreground': variant === 'default',
          'bg-gray-100 text-gray-800': variant === 'secondary',
          'border border-gray-300 bg-transparent': variant === 'outline',
        },
        className
      )}
      {...props}
    />
  )
}
