'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { clsx } from 'clsx'

interface SliderProps {
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}

export function Slider({
  value: controlledValue,
  defaultValue = [0],
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
}: SliderProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const trackRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const value = controlledValue ?? internalValue
  const currentValue = value[0] ?? min

  const handleValueChange = useCallback(
    (newValue: number[]) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue)
      }
      onValueChange?.(newValue)
    },
    [controlledValue, onValueChange]
  )

  const calculateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return currentValue

      const rect = trackRef.current.getBoundingClientRect()
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const rawValue = min + percentage * (max - min)
      const steppedValue = Math.round(rawValue / step) * step
      return Math.max(min, Math.min(max, steppedValue))
    },
    [currentValue, min, max, step]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      isDragging.current = true
      const newValue = calculateValue(e.clientX)
      handleValueChange([newValue])
    },
    [disabled, calculateValue, handleValueChange]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || disabled) return
      const newValue = calculateValue(e.clientX)
      handleValueChange([newValue])
    },
    [disabled, calculateValue, handleValueChange]
  )

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Touch support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return
      isDragging.current = true
      const touch = e.touches[0]
      const newValue = calculateValue(touch.clientX)
      handleValueChange([newValue])
    },
    [disabled, calculateValue, handleValueChange]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging.current || disabled) return
      const touch = e.touches[0]
      const newValue = calculateValue(touch.clientX)
      handleValueChange([newValue])
    },
    [disabled, calculateValue, handleValueChange]
  )

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  const percentage = ((currentValue - min) / (max - min)) * 100

  return (
    <div
      ref={trackRef}
      className={clsx(
        'relative flex w-full touch-none select-none items-center',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Track */}
      <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200">
        {/* Range (filled portion) */}
        <div
          className="absolute h-full bg-blue-500 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Thumb */}
      <div
        className={clsx(
          'absolute block h-5 w-5 rounded-full border-2 border-blue-500 bg-white ring-offset-white',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          'hover:bg-blue-50',
          !disabled && 'cursor-grab active:cursor-grabbing'
        )}
        style={{
          left: `calc(${percentage}% - 10px)`,
        }}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        tabIndex={disabled ? -1 : 0}
      />
    </div>
  )
}
