'use client'

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type HTMLAttributes,
} from 'react'
import { clsx } from 'clsx'

interface DropdownMenuContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownMenuContext = createContext<DropdownMenuContextType | undefined>(undefined)

interface DropdownMenuProps {
  children: ReactNode
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

interface DropdownMenuTriggerProps {
  children: ReactNode
  asChild?: boolean
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const context = useContext(DropdownMenuContext)
  if (!context) throw new Error('DropdownMenuTrigger must be used within DropdownMenu')

  const { open, setOpen } = context
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, setOpen])

  return (
    <div ref={ref} onClick={() => setOpen(!open)}>
      {children}
    </div>
  )
}

interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end' | 'center'
}

export function DropdownMenuContent({ children, className, align = 'end' }: DropdownMenuContentProps) {
  const context = useContext(DropdownMenuContext)
  if (!context) throw new Error('DropdownMenuContent must be used within DropdownMenu')

  if (!context.open) return null

  return (
    <div
      className={clsx(
        'absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-white p-1 shadow-md',
        'animate-in fade-in-0 zoom-in-95',
        {
          'right-0': align === 'end',
          'left-0': align === 'start',
          'left-1/2 -translate-x-1/2': align === 'center',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

interface DropdownMenuItemProps extends HTMLAttributes<HTMLDivElement> {
  disabled?: boolean
}

export function DropdownMenuItem({ children, className, disabled, onClick, ...props }: DropdownMenuItemProps) {
  const context = useContext(DropdownMenuContext)
  if (!context) throw new Error('DropdownMenuItem must be used within DropdownMenu')

  return (
    <div
      className={clsx(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
        'hover:bg-gray-100 focus:bg-gray-100',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        context.setOpen(false)
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-gray-200" />
}
