'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface DialogContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = createContext<DialogContextType | undefined>(undefined)

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

interface DialogContentProps {
  children: ReactNode
  className?: string
}

export function DialogContent({ children, className }: DialogContentProps) {
  const context = useContext(DialogContext)
  if (!context) throw new Error('DialogContent must be used within Dialog')

  if (!context.open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => context.onOpenChange(false)}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={clsx(
            'relative bg-white rounded-lg shadow-lg w-full max-h-[90vh] overflow-y-auto',
            'animate-in fade-in-0 zoom-in-95',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => context.onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
          {children}
        </div>
      </div>
    </div>
  )
}

interface DialogHeaderProps {
  children: ReactNode
  className?: string
}

export function DialogHeader({ children, className }: DialogHeaderProps) {
  return (
    <div className={clsx('flex flex-col space-y-1.5 p-6 pb-0', className)}>
      {children}
    </div>
  )
}

interface DialogTitleProps {
  children: ReactNode
  className?: string
}

export function DialogTitle({ children, className }: DialogTitleProps) {
  return (
    <h2 className={clsx('text-lg font-semibold', className)}>
      {children}
    </h2>
  )
}

interface DialogDescriptionProps {
  children: ReactNode
  className?: string
}

export function DialogDescription({ children, className }: DialogDescriptionProps) {
  return (
    <p className={clsx('text-sm text-gray-500', className)}>
      {children}
    </p>
  )
}

interface DialogTriggerProps {
  asChild?: boolean
  children: ReactNode
}

export function DialogTrigger({ asChild, children }: DialogTriggerProps) {
  const context = useContext(DialogContext)

  // When used outside of Dialog context (controlled externally), just render children
  if (!context) {
    return <>{children}</>
  }

  if (asChild && children && typeof children === 'object' && 'props' in children) {
    const child = children as React.ReactElement<{ onClick?: () => void }>
    return (
      <>
        {(() => {
          const props = {
            ...child.props,
            onClick: () => context.onOpenChange(true),
          }
          return { ...child, props }
        })()}
      </>
    )
  }

  return (
    <button onClick={() => context.onOpenChange(true)}>
      {children}
    </button>
  )
}
