'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Clock,
  AlertTriangle,
  Trash2,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { KalkiaBuildingProfile } from '@/types/kalkia.types'

interface BuildingProfilesClientProps {
  profiles: KalkiaBuildingProfile[]
}

export default function BuildingProfilesClient({ profiles }: BuildingProfilesClientProps) {
  const formatMultiplier = (value: number) => {
    if (value === 1) return '1.00x'
    return `${value.toFixed(3)}x`
  }

  const getMultiplierColor = (value: number) => {
    if (value < 1) return 'text-green-600'
    if (value > 1.2) return 'text-red-600'
    if (value > 1) return 'text-yellow-600'
    return 'text-gray-600'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings/kalkia">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tilbage
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Bygningsprofiler</h1>
              <p className="text-gray-600 mt-1">
                Konfigurer multiplikatorer for forskellige bygningstyper
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Om bygningsprofiler</p>
              <p className="text-sm text-green-700 mt-1">
                Bygningsprofiler justerer automatisk tid, svaerhedsgrad og spild baseret pa
                bygningstypen. Vaelg profil ved oprettelse af kalkulation for at fa mere
                praecise estimater.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profiles Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle profiler</CardTitle>
          <CardDescription>
            {profiles.length} bygningsprofiler konfigureret
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profil</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4" />
                    Tid
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Svaerhed
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Trash2 className="w-4 h-4" />
                    Spild
                  </div>
                </TableHead>
                <TableHead className="text-center">Overhead</TableHead>
                <TableHead>Vaegtype</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      {profile.description && (
                        <p className="text-xs text-gray-500">{profile.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{profile.code}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-mono ${getMultiplierColor(profile.time_multiplier)}`}>
                      {formatMultiplier(profile.time_multiplier)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-mono ${getMultiplierColor(profile.difficulty_multiplier)}`}>
                      {formatMultiplier(profile.difficulty_multiplier)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-mono ${getMultiplierColor(profile.material_waste_multiplier)}`}>
                      {formatMultiplier(profile.material_waste_multiplier)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`font-mono ${getMultiplierColor(profile.overhead_multiplier)}`}>
                      {formatMultiplier(profile.overhead_multiplier)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {profile.typical_wall_type ? (
                      <Badge variant="secondary">{profile.typical_wall_type}</Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.is_active ? 'default' : 'secondary'}>
                      {profile.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Forklaring af multiplikatorer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-700">Tidsmultiplikator</p>
              <p className="text-gray-500">
                Justerer den samlede arbejdstid. 1.4x betyder 40% laengere tid.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Svaerhedsmultiplikator</p>
              <p className="text-gray-500">
                Paavirker beregning af svaerhedsgraden for opgaver.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Spildmultiplikator</p>
              <p className="text-gray-500">
                Justerer materialespild. 1.15x betyder 15% ekstra spild.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-700">Overheadmultiplikator</p>
              <p className="text-gray-500">
                Justerer de faste omkostninger pr. projekt.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex gap-6">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-600"></span>
              <span className="text-sm text-gray-600">Under standard (&lt;1.0x)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-600"></span>
              <span className="text-sm text-gray-600">Standard (1.0x)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-600"></span>
              <span className="text-sm text-gray-600">Over standard (1.0-1.2x)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600"></span>
              <span className="text-sm text-gray-600">Hoj (&gt;1.2x)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
