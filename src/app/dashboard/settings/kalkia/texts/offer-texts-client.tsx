'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Search,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  Tag,
  Layers,
  Home,
  Globe,
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
import {
  createOfferTextTemplate,
  updateOfferTextTemplate,
  deleteOfferTextTemplate,
} from '@/lib/actions/component-intelligence'
import type { OfferTextTemplate, ScopeType, TextType, OfferTextConditions } from '@/types/component-intelligence.types'
import { useToast } from '@/components/ui/toast'

interface OfferTextFormData {
  text_type: TextType
  scope_type: ScopeType
  scope_id: string | null
  title: string
  content: string
  priority: number
  conditions: OfferTextConditions | null
  is_active: boolean
}

interface OfferTextsClientProps {
  initialTemplates: OfferTextTemplate[]
}

const textTypeOptions: { value: TextType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'description', label: 'Beskrivelse', icon: FileText, color: 'bg-blue-100 text-blue-600' },
  { value: 'obs_point', label: 'OBS-punkt', icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-600' },
  { value: 'warranty_note', label: 'Garantinote', icon: CheckCircle2, color: 'bg-green-100 text-green-600' },
  { value: 'technical_note', label: 'Teknisk note', icon: Info, color: 'bg-purple-100 text-purple-600' },
]

const scopeTypeOptions: { value: ScopeType; label: string; icon: React.ElementType }[] = [
  { value: 'component', label: 'Komponent', icon: Tag },
  { value: 'category', label: 'Kategori', icon: Layers },
  { value: 'room_type', label: 'Rumtype', icon: Home },
  { value: 'global', label: 'Global', icon: Globe },
]

export function OfferTextsClient({ initialTemplates }: OfferTextsClientProps) {
  const toast = useToast()
  const [templates, setTemplates] = useState<OfferTextTemplate[]>(initialTemplates)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<TextType | 'all'>('all')
  const [filterScope, setFilterScope] = useState<ScopeType | 'all'>('all')

  const [formData, setFormData] = useState<Partial<OfferTextFormData>>({
    text_type: 'description',
    scope_type: 'global',
    scope_id: null,
    title: '',
    content: '',
    priority: 0,
    conditions: null,
    is_active: true,
  })

  const resetForm = () => {
    setFormData({
      text_type: 'description',
      scope_type: 'global',
      scope_id: null,
      title: '',
      content: '',
      priority: 0,
      conditions: null,
      is_active: true,
    })
    setShowCreateForm(false)
    setEditingId(null)
  }

  const handleCreate = async () => {
    if (!formData.title || !formData.content) {
      toast?.error('Titel og indhold er påkrævet')
      return
    }

    setSaving(true)
    const apiInput = {
      scope_type: formData.scope_type || 'global',
      scope_id: formData.scope_id || undefined,
      template_key: formData.text_type || 'description',
      title: formData.title,
      content: formData.content || '',
      priority: formData.priority || 0,
      conditions: formData.conditions || undefined,
    }
    const result = await createOfferTextTemplate(apiInput)
    setSaving(false)

    if (result.success && result.data) {
      setTemplates([...templates, result.data])
      resetForm()
      toast?.success('Tekstskabelon oprettet')
    } else {
      toast?.error(result.error || 'Kunne ikke oprette tekstskabelon')
    }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    const apiInput = {
      id,
      scope_type: formData.scope_type,
      scope_id: formData.scope_id || undefined,
      template_key: formData.text_type,
      title: formData.title,
      content: formData.content,
      priority: formData.priority,
      conditions: formData.conditions || undefined,
    }
    const result = await updateOfferTextTemplate(apiInput)
    setSaving(false)

    if (result.success && result.data) {
      setTemplates(templates.map((t) => (t.id === id ? result.data! : t)))
      resetForm()
      toast?.success('Tekstskabelon opdateret')
    } else {
      toast?.error(result.error || 'Kunne ikke opdatere tekstskabelon')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på du vil slette denne tekstskabelon?')) return

    const result = await deleteOfferTextTemplate(id)
    if (result.success) {
      setTemplates(templates.filter((t) => t.id !== id))
      toast?.success('Tekstskabelon slettet')
    } else {
      toast?.error(result.error || 'Kunne ikke slette tekstskabelon')
    }
  }

  const startEdit = (template: OfferTextTemplate) => {
    setEditingId(template.id)
    setFormData({
      text_type: template.template_key,
      scope_type: template.scope_type,
      scope_id: template.scope_id,
      title: template.title || '',
      content: template.content,
      priority: template.priority,
      conditions: template.conditions,
      is_active: template.is_active,
    })
    setShowCreateForm(false)
  }

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      searchQuery === '' ||
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || t.template_key === filterType
    const matchesScope = filterScope === 'all' || t.scope_type === filterScope
    return matchesSearch && matchesType && matchesScope
  })

  const getTypeConfig = (type: TextType) =>
    textTypeOptions.find((t) => t.value === type) || textTypeOptions[0]

  const getScopeConfig = (scope: ScopeType) =>
    scopeTypeOptions.find((s) => s.value === scope) || scopeTypeOptions[0]

  const TemplateForm = ({ isNew }: { isNew: boolean }) => (
    <Card className="border-2 border-dashed border-cyan-300 bg-cyan-50">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Type</label>
            <Select
              value={formData.text_type || 'description'}
              onValueChange={(value) => setFormData({ ...formData, text_type: value as TextType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {textTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Omfang</label>
            <Select
              value={formData.scope_type || 'global'}
              onValueChange={(value) => setFormData({ ...formData, scope_type: value as ScopeType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Reference (valgfri)</label>
            <Input
              value={formData.scope_id || ''}
              onChange={(e) => setFormData({ ...formData, scope_id: e.target.value || null })}
              placeholder="STIK-1-NY, BATHROOM, etc."
              disabled={formData.scope_type === 'global'}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Prioritet</label>
            <Input
              type="number"
              value={formData.priority || 0}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Titel *</label>
          <Input
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Stikkontakt installation"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Indhold *</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 min-h-[100px]"
            value={formData.content || ''}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            placeholder="Montering af stikkontakt inkl. ledningsføring fra nærmeste dåse..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Du kan bruge variabler: {'{component_name}'}, {'{quantity}'}, {'{room_type}'}, {'{total_time}'}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Betingelser (JSON, valgfri)</label>
          <Input
            value={formData.conditions ? JSON.stringify(formData.conditions) : ''}
            onChange={(e) => {
              try {
                const parsed = e.target.value ? JSON.parse(e.target.value) : null
                setFormData({ ...formData, conditions: parsed })
              } catch {
                // Invalid JSON, keep current
              }
            }}
            placeholder='{"min_quantity": 5, "room_type": "BATHROOM"}'
          />
          <p className="text-xs text-gray-500 mt-1">
            Avanceret: JSON-betingelser for hvornår teksten vises
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active !== false}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">Aktiv</span>
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
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Gemmer...' : isNew ? 'Opret skabelon' : 'Gem ændringer'}
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
            <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tilbudstekster</h1>
              <p className="text-sm text-gray-500">
                Automatiske beskrivelser og OBS-punkter til tilbud
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
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny tekstskabelon
          </Button>
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-cyan-600 mt-0.5" />
            <div>
              <p className="font-medium text-cyan-900">Automatiske tilbudstekster</p>
              <p className="text-sm text-cyan-700 mt-1">
                Tekstskabeloner genererer automatisk beskrivelser, OBS-punkter og garantinoter
                baseret på de valgte komponenter i en kalkulation. Brug variabler for dynamisk indhold.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Søg i titel eller indhold..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as TextType | 'all')}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle typer</SelectItem>
                {textTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterScope}
              onValueChange={(v) => setFilterScope(v as ScopeType | 'all')}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Omfang" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle omfang</SelectItem>
                {scopeTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {textTypeOptions.map((opt) => {
          const count = templates.filter((t) => t.template_key === opt.value).length
          return (
            <Card key={opt.value}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${opt.color} flex items-center justify-center`}>
                    <opt.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-sm text-gray-500">{opt.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create Form */}
      {showCreateForm && <TemplateForm isNew={true} />}

      {/* Templates List */}
      <div className="space-y-3">
        {filteredTemplates.map((template) => {
          const isEditing = editingId === template.id
          const typeConfig = getTypeConfig(template.template_key)
          const scopeConfig = getScopeConfig(template.scope_type)

          if (isEditing) {
            return <TemplateForm key={template.id} isNew={false} />
          }

          return (
            <Card
              key={template.id}
              className={`transition-shadow ${!template.is_active ? 'opacity-60' : 'hover:shadow-md'}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-10 h-10 rounded-lg ${typeConfig.color} flex items-center justify-center`}>
                      <typeConfig.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{template.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {typeConfig.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-gray-50">
                          <scopeConfig.icon className="w-3 h-3 mr-1" />
                          {scopeConfig.label}
                          {template.scope_id && `: ${template.scope_id}`}
                        </Badge>
                        {template.priority > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Prioritet: {template.priority}
                          </Badge>
                        )}
                        {!template.is_active && (
                          <Badge variant="secondary" className="text-xs">
                            Inaktiv
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{template.content}</p>
                      {template.conditions && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                            Betingelser: {JSON.stringify(template.conditions)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(template)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filteredTemplates.length === 0 && !showCreateForm && (
          <Card className="py-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>
              {searchQuery || filterType !== 'all' || filterScope !== 'all'
                ? 'Ingen skabeloner matcher filtrene'
                : 'Ingen tekstskabeloner oprettet'}
            </p>
            <p className="text-sm mt-2">
              Opret skabeloner for automatisk at generere tilbudstekster
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
