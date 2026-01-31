'use client'

import { useState, useEffect } from 'react'
import {
  Settings2,
  Check,
  Star,
  Percent,
  Clock,
  DollarSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCalibrationPresets } from '@/lib/actions/quick-jobs'
import type { CalibrationPreset, CALIBRATION_CATEGORIES } from '@/types/quick-jobs.types'

interface CalibrationPresetPickerProps {
  value: string | null
  onChange: (preset: CalibrationPreset | null) => void
  className?: string
}

const categoryColors: Record<string, string> = {
  standard: 'bg-blue-100 text-blue-700',
  budget: 'bg-green-100 text-green-700',
  premium: 'bg-purple-100 text-purple-700',
  special: 'bg-orange-100 text-orange-700',
  'project-type': 'bg-gray-100 text-gray-700',
  custom: 'bg-slate-100 text-slate-700',
}

const categoryLabels: Record<string, string> = {
  standard: 'Standard',
  budget: 'Budget',
  premium: 'Premium',
  special: 'Special',
  'project-type': 'Projekttype',
  custom: 'Brugerdefineret',
}

export function CalibrationPresetPicker({
  value,
  onChange,
  className = '',
}: CalibrationPresetPickerProps) {
  const [presets, setPresets] = useState<CalibrationPreset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadPresets = async () => {
      setLoading(true)
      const result = await getCalibrationPresets()
      if (result.success && result.data) {
        setPresets(result.data)
        // Auto-select default if no value
        if (!value) {
          const defaultPreset = result.data.find((p) => p.is_default)
          if (defaultPreset) {
            onChange(defaultPreset)
          }
        }
      }
      setLoading(false)
    }
    loadPresets()
  }, [])

  const selectedPreset = presets.find((p) => p.id === value)

  const formatFactor = (key: string, val: number) => {
    if (key.includes('factor') || key.includes('multiplier')) {
      return `${val}x`
    }
    return `${val}%`
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Settings2 className="w-4 h-4 text-gray-400" />

      <Select
        value={value || ''}
        onValueChange={(v) => {
          const preset = presets.find((p) => p.id === v)
          onChange(preset || null)
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={loading ? 'Henter...' : 'Vælg kalibrering'} />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              <div className="flex items-center gap-2">
                {preset.is_default && (
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                )}
                <span>{preset.name}</span>
                <Badge
                  className={`text-xs ${categoryColors[preset.category] || categoryColors.custom}`}
                >
                  {categoryLabels[preset.category] || preset.category}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Show key settings from selected preset */}
      {selectedPreset && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {selectedPreset.hourly_rate && (
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              {selectedPreset.hourly_rate} kr/t
            </span>
          )}
          {selectedPreset.margin_percentage && (
            <span className="flex items-center gap-1">
              <Percent className="w-3 h-3" />
              {selectedPreset.margin_percentage}% avance
            </span>
          )}
          {selectedPreset.factor_overrides.indirect_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {selectedPreset.factor_overrides.indirect_time}% indirekte
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Compact version for inline use
export function CalibrationPresetBadge({
  preset,
}: {
  preset: CalibrationPreset | null
}) {
  if (!preset) return null

  return (
    <Badge
      variant="outline"
      className={`${categoryColors[preset.category] || categoryColors.custom}`}
    >
      <Settings2 className="w-3 h-3 mr-1" />
      {preset.name}
    </Badge>
  )
}
