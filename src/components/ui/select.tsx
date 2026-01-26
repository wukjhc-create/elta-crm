'use client'

import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { clsx } from 'clsx'

interface SelectContextType {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
}

const SelectContext = createContext<SelectContextType | undefined>(undefined)

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  children: ReactNode
}

export function Select({ value: controlledValue, defaultValue = '', onValueChange, name, children }: SelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)

  const value = controlledValue ?? internalValue

  const handleValueChange = (newValue: string) => {
    if (controlledValue === undefined) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen }}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

interface SelectTriggerProps {
  children: ReactNode
  className?: string
}

export function SelectTrigger({ children, className }: SelectTriggerProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectTrigger must be used within Select')

  const { open, setOpen } = context
  const ref = useRef<HTMLButtonElement>(null)

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
    <button
      ref={ref}
      type="button"
      onClick={() => setOpen(!open)}
      className={clsx(
        'flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
}

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectValue must be used within Select')

  // The actual label will be set by the selected item
  return <span className={context.value ? '' : 'text-gray-400'}>{placeholder}</span>
}

interface SelectContentProps {
  children: ReactNode
}

export function SelectContent({ children }: SelectContentProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')

  if (!context.open) return null

  return (
    <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
      {children}
    </div>
  )
}

interface SelectItemProps {
  value: string
  children: ReactNode
}

export function SelectItem({ value, children }: SelectItemProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectItem must be used within Select')

  const isSelected = context.value === value

  return (
    <button
      type="button"
      onClick={() => {
        context.onValueChange(value)
        context.setOpen(false)
      }}
      className={clsx(
        'relative flex w-full cursor-pointer select-none items-center py-2 px-3 text-sm',
        'hover:bg-gray-100',
        isSelected && 'bg-gray-50'
      )}
    >
      <span className="flex-1 text-left">{children}</span>
      {isSelected && <Check className="h-4 w-4 text-primary" />}
    </button>
  )
}
