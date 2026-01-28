'use client'

import { Building2, Clock, Trash2, AlertTriangle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { KalkiaBuildingProfile } from '@/types/kalkia.types'

interface BuildingProfileSelectorProps {
  profiles: KalkiaBuildingProfile[]
  value: string | null
  onChange: (profileId: string | null) => void
  showMultipliers?: boolean
  className?: string
}

export function BuildingProfileSelector({
  profiles,
  value,
  onChange,
  showMultipliers = true,
  className,
}: BuildingProfileSelectorProps) {
  const activeProfiles = profiles.filter((p) => p.is_active)
  const selectedProfile = value ? profiles.find((p) => p.id === value) : null

  const formatMultiplier = (val: number) => {
    if (val === 1) return '1.0x'
    return `${val.toFixed(2)}x`
  }

  const getMultiplierColor = (val: number) => {
    if (val < 1) return 'text-green-600'
    if (val > 1.2) return 'text-red-600'
    if (val > 1) return 'text-yellow-600'
    return 'text-gray-600'
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Select
        value={value || 'none'}
        onValueChange={(v) => onChange(v === 'none' ? null : v)}
      >
        <SelectTrigger>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <SelectValue placeholder="Vaelg bygningsprofil (valgfrit)" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <div className="flex items-center gap-2">
              <span>Ingen profil</span>
              <span className="text-xs text-gray-500">(standard faktorer)</span>
            </div>
          </SelectItem>
          {activeProfiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {profile.code}
                  </Badge>
                </div>
                {showMultipliers && profile.time_multiplier !== 1 && (
                  <span
                    className={cn(
                      'text-xs ml-4',
                      getMultiplierColor(profile.time_multiplier)
                    )}
                  >
                    {formatMultiplier(profile.time_multiplier)}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Show selected profile multipliers */}
      {showMultipliers && selectedProfile && (
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500">Tid:</span>
            <span className={getMultiplierColor(selectedProfile.time_multiplier)}>
              {formatMultiplier(selectedProfile.time_multiplier)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500">Svaerhed:</span>
            <span className={getMultiplierColor(selectedProfile.difficulty_multiplier)}>
              {formatMultiplier(selectedProfile.difficulty_multiplier)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Trash2 className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500">Spild:</span>
            <span className={getMultiplierColor(selectedProfile.material_waste_multiplier)}>
              {formatMultiplier(selectedProfile.material_waste_multiplier)}
            </span>
          </div>
          {selectedProfile.typical_wall_type && (
            <Badge variant="secondary" className="text-xs">
              {selectedProfile.typical_wall_type}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
