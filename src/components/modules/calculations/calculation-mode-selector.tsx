'use client'

import { Calculator, Sun, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CALCULATION_MODES,
  CALCULATION_MODE_LABELS,
  type CalculationMode,
} from '@/types/calculations.types'

interface CalculationModeSelectorProps {
  value: CalculationMode
  onChange: (mode: CalculationMode) => void
  disabled?: boolean
}

const MODE_ICONS: Record<CalculationMode, React.ComponentType<{ className?: string }>> = {
  standard: Calculator,
  solar: Sun,
  electrician: Zap,
}

const MODE_DESCRIPTIONS: Record<CalculationMode, string> = {
  standard: 'Almindelig kalkulation med materialer og arbejdslon',
  solar: 'Solcelleanlæg med ROI og besparelsesberegning',
  electrician: 'El-arbejde med timebaseret afregning',
}

export default function CalculationModeSelector({
  value,
  onChange,
  disabled = false,
}: CalculationModeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CALCULATION_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode]
        const isSelected = value === mode

        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
              isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Icon className={cn('w-6 h-6', isSelected ? 'text-blue-500' : 'text-gray-400')} />
            <span className="font-medium text-sm">{CALCULATION_MODE_LABELS[mode]}</span>
            <span className="text-xs text-gray-500 text-center line-clamp-2">
              {MODE_DESCRIPTIONS[mode]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
