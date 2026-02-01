'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Home,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Bed,
  Sofa,
  ChefHat,
  Bath,
  DoorOpen,
  Monitor,
  Car,
  Warehouse,
  Sun,
  Square,
  Zap,
  AlertTriangle,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRoomType, updateRoomType, deleteRoomType } from '@/lib/actions/component-intelligence'
import type { RoomType, RoomTypeCreate, RoomTypeUpdate } from '@/types/component-intelligence.types'
import { useToast } from '@/components/ui/toast'

interface RoomTypesClientProps {
  initialRoomTypes: RoomType[]
}

const roomIcons: Record<string, React.ElementType> = {
  Bed: Bed,
  Sofa: Sofa,
  ChefHat: ChefHat,
  Bath: Bath,
  DoorOpen: DoorOpen,
  Monitor: Monitor,
  Car: Car,
  Warehouse: Warehouse,
  Sun: Sun,
  Square: Square,
}

const roomColors: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-600 border-indigo-200',
  amber: 'bg-amber-100 text-amber-600 border-amber-200',
  orange: 'bg-orange-100 text-orange-600 border-orange-200',
  cyan: 'bg-cyan-100 text-cyan-600 border-cyan-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-100 text-blue-600 border-blue-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  zinc: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  stone: 'bg-stone-100 text-stone-600 border-stone-200',
  green: 'bg-green-100 text-green-600 border-green-200',
}

const iconOptions = Object.keys(roomIcons)
const colorOptions = Object.keys(roomColors)
const ipRatingOptions = ['IP20', 'IP44', 'IP65', 'IP67']

export function RoomTypesClient({ initialRoomTypes }: RoomTypesClientProps) {
  const toast = useToast()
  const [roomTypes, setRoomTypes] = useState<RoomType[]>(initialRoomTypes)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState<Partial<RoomTypeCreate>>({
    code: '',
    name: '',
    description: '',
    icon: 'Square',
    color: 'gray',
    typical_size_m2: 15,
    min_size_m2: 5,
    max_size_m2: 50,
    typical_circuits: 1,
    ip_rating_required: 'IP20',
    requires_rcd: false,
    standard_components: {},
  })

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      icon: 'Square',
      color: 'gray',
      typical_size_m2: 15,
      min_size_m2: 5,
      max_size_m2: 50,
      typical_circuits: 1,
      ip_rating_required: 'IP20',
      requires_rcd: false,
      standard_components: {},
    })
    setShowCreateForm(false)
    setEditingId(null)
  }

  const handleCreate = async () => {
    if (!formData.code || !formData.name) {
      toast?.error('Kode og navn er påkrævet')
      return
    }

    setSaving(true)
    const result = await createRoomType(formData as RoomTypeCreate)
    setSaving(false)

    if (result.success && result.data) {
      setRoomTypes([...roomTypes, result.data])
      resetForm()
      toast?.success('Rumtype oprettet')
    } else {
      toast?.error(result.error || 'Kunne ikke oprette rumtype')
    }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    const result = await updateRoomType(id, formData as RoomTypeUpdate)
    setSaving(false)

    if (result.success && result.data) {
      setRoomTypes(roomTypes.map((rt) => (rt.id === id ? result.data! : rt)))
      resetForm()
      toast?.success('Rumtype opdateret')
    } else {
      toast?.error(result.error || 'Kunne ikke opdatere rumtype')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på du vil slette denne rumtype?')) return

    const result = await deleteRoomType(id)
    if (result.success) {
      setRoomTypes(roomTypes.filter((rt) => rt.id !== id))
      toast?.success('Rumtype slettet')
    } else {
      toast?.error(result.error || 'Kunne ikke slette rumtype')
    }
  }

  const startEdit = (roomType: RoomType) => {
    setEditingId(roomType.id)
    setFormData({
      code: roomType.code,
      name: roomType.name,
      description: roomType.description || '',
      icon: roomType.icon,
      color: roomType.color,
      typical_size_m2: roomType.typical_size_m2,
      min_size_m2: roomType.min_size_m2 || 5,
      max_size_m2: roomType.max_size_m2 || 50,
      typical_circuits: roomType.typical_circuits,
      ip_rating_required: roomType.ip_rating_required,
      requires_rcd: roomType.requires_rcd,
      standard_components: roomType.standard_components,
    })
    setShowCreateForm(false)
  }

  const RoomTypeForm = ({ isNew }: { isNew: boolean }) => (
    <Card className="border-2 border-dashed border-purple-300 bg-purple-50">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Kode</label>
            <Input
              value={formData.code || ''}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="BEDROOM"
              disabled={!isNew}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Navn</label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Soveværelse"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Ikon</label>
            <Select
              value={formData.icon || 'Square'}
              onValueChange={(value) => setFormData({ ...formData, icon: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((icon) => {
                  const Icon = roomIcons[icon]
                  return (
                    <SelectItem key={icon} value={icon}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {icon}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Farve</label>
            <Select
              value={formData.color || 'gray'}
              onValueChange={(value) => setFormData({ ...formData, color: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((color) => (
                  <SelectItem key={color} value={color}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded ${roomColors[color]}`} />
                      {color}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Beskrivelse</label>
          <Input
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Standard soveværelse i parcelhus"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Typisk m²</label>
            <Input
              type="number"
              value={formData.typical_size_m2 || 15}
              onChange={(e) => setFormData({ ...formData, typical_size_m2: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Min m²</label>
            <Input
              type="number"
              value={formData.min_size_m2 || 5}
              onChange={(e) => setFormData({ ...formData, min_size_m2: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Max m²</label>
            <Input
              type="number"
              value={formData.max_size_m2 || 50}
              onChange={(e) => setFormData({ ...formData, max_size_m2: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Kredsløb</label>
            <Input
              type="number"
              value={formData.typical_circuits || 1}
              onChange={(e) => setFormData({ ...formData, typical_circuits: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">IP-klasse</label>
            <Select
              value={formData.ip_rating_required || 'IP20'}
              onValueChange={(value) => setFormData({ ...formData, ip_rating_required: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ipRatingOptions.map((rating) => (
                  <SelectItem key={rating} value={rating}>
                    {rating}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requires_rcd || false}
              onChange={(e) => setFormData({ ...formData, requires_rcd: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">Kræver HPFI-relæ</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={resetForm} disabled={saving}>
            <X className="w-4 h-4 mr-2" />
            Annuller
          </Button>
          <Button
            onClick={() => (isNew ? handleCreate() : handleUpdate(editingId!))}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Gemmer...' : isNew ? 'Opret rumtype' : 'Gem ændringer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

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
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Home className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Rumtyper</h1>
              <p className="text-sm text-gray-500">
                Konfigurer standard komponentforslag for forskellige rumtyper
              </p>
            </div>
          </div>
        </div>

        {!showCreateForm && !editingId && (
          <Button
            onClick={() => {
              resetForm()
              setShowCreateForm(true)
            }}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny rumtype
          </Button>
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Settings2 className="w-5 h-5 text-indigo-600 mt-0.5" />
            <div>
              <p className="font-medium text-indigo-900">Intelligent rumberegning</p>
              <p className="text-sm text-indigo-700 mt-1">
                Rumtyper bruges til automatisk at foreslå komponenter baseret på rumstørrelse.
                Konfigurer standard komponenter med base-mængde og m²-skalering for hver rumtype.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {showCreateForm && <RoomTypeForm isNew={true} />}

      {/* Room Types List */}
      <div className="grid gap-4">
        {roomTypes.map((roomType) => {
          const Icon = roomIcons[roomType.icon] || Square
          const colorClasses = roomColors[roomType.color] || roomColors.gray
          const isEditing = editingId === roomType.id

          if (isEditing) {
            return <RoomTypeForm key={roomType.id} isNew={false} />
          }

          return (
            <Card key={roomType.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg ${colorClasses} flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{roomType.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {roomType.code}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {roomType.description || 'Ingen beskrivelse'}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>Typisk: {roomType.typical_size_m2} m²</span>
                        <span>•</span>
                        <span>{roomType.min_size_m2}-{roomType.max_size_m2} m²</span>
                        <span>•</span>
                        <span>{roomType.typical_circuits} kredsløb</span>
                        {roomType.ip_rating_required !== 'IP20' && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="bg-cyan-50 text-cyan-700 text-xs">
                              {roomType.ip_rating_required}
                            </Badge>
                          </>
                        )}
                        {roomType.requires_rcd && (
                          <>
                            <span>•</span>
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              HPFI
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {Object.keys(roomType.standard_components || {}).length} komponenter
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(roomType)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(roomType.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {roomTypes.length === 0 && !showCreateForm && (
          <Card className="py-12 text-center text-gray-500">
            <Home className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Ingen rumtyper konfigureret</p>
            <p className="text-sm mt-2">Opret rumtyper for at aktivere intelligent rumberegning</p>
          </Card>
        )}
      </div>
    </div>
  )
}
