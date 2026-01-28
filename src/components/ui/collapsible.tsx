'use client'

import * as React from 'react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CollapsibleContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CollapsibleContext = createContext<CollapsibleContextType | undefined>(undefined)

interface CollapsibleProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div className={className} data-state={open ? 'open' : 'closed'}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

function useCollapsible() {
  const context = useContext(CollapsibleContext)
  if (!context) {
    throw new Error('Collapsible components must be used within a Collapsible')
  }
  return context
}

interface CollapsibleTriggerProps {
  asChild?: boolean
  children: ReactNode
  className?: string
}

export function CollapsibleTrigger({
  asChild,
  children,
  className,
}: CollapsibleTriggerProps) {
  const { open, onOpenChange } = useCollapsible()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(!open),
    })
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onOpenChange(!open)}
      data-state={open ? 'open' : 'closed'}
    >
      {children}
    </button>
  )
}

interface CollapsibleContentProps {
  children: ReactNode
  className?: string
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const { open } = useCollapsible()

  if (!open) return null

  return (
    <div
      className={cn('overflow-hidden', className)}
      data-state={open ? 'open' : 'closed'}
    >
      {children}
    </div>
  )
}
