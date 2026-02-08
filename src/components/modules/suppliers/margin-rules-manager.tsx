'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Info,
  Percent,
  AlertCircle,
  Save,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getSupplierMarginRules,
  createMarginRule,
  updateMarginRule,
  deleteMarginRule,
  toggleMarginRule,
  getMarginRuleSummary,
} from '@/lib/actions/margin-rules'
import type { SupplierMarginRule, MarginRuleType, CreateMarginRuleData } from '@/types/suppliers.types'

const MARGIN_RULE_TYPE_LABELS: Record<MarginRuleType, string> = {
  supplier: 'Leverandør (standard)',
  category: 'Kategori',
  subcategory: 'Underkategori',
  product: 'Produkt',
  customer: 'Kunde',
}

const MARGIN_RULE_TYPE_DESCRIPTIONS: Record<MarginRuleType, string> = {
  supplier: 'Gælder for alle produkter fra leverandøren',
  category: 'Gælder for alle produkter i en kategori',
  subcategory: 'Gælder for alle produkter i en underkategori',
  product: 'Gælder kun for ét specifikt produkt',
  customer: 'Gælder for alle produkter til en specifik kunde',
}

interface MarginRulesManagerProps {
  supplierId: string
  supplierName: string
}

const RULE_TYPE_COLORS: Record<MarginRuleType, string> = {
  supplier: 'bg-blue-50 text-blue-700 border-blue-200',
  category: 'bg-green-50 text-green-700 border-green-200',
  subcategory: 'bg-purple-50 text-purple-700 border-purple-200',
  product: 'bg-orange-50 text-orange-700 border-orange-200',
  customer: 'bg-pink-50 text-pink-700 border-pink-200',
}

const RULE_TYPE_ORDER: MarginRuleType[] = ['supplier', 'category', 'subcategory', 'product', 'customer']

export function MarginRulesManager({ supplierId, supplierName }: MarginRulesManagerProps) {
  const toast = useToast()
  const [rules, setRules] = useState<SupplierMarginRule[]>([])
  const [summary, setSummary] = useState<{
    totalRules: number
    activeRules: number
    defaultMargin: number | null
    rulesByType: Record<MarginRuleType, number>
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<SupplierMarginRule | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [rulesResult, summaryResult] = await Promise.all([
      getSupplierMarginRules(supplierId),
      getMarginRuleSummary(supplierId),
    ])

    if (rulesResult.success && rulesResult.data) setRules(rulesResult.data)
    if (summaryResult.success && summaryResult.data) setSummary(summaryResult.data)
    setIsLoading(false)
  }, [supplierId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (ruleId: string) => {
    const result = await toggleMarginRule(ruleId)
    if (result.success) {
      toast.success('Regel opdateret')
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleDelete = async (rule: SupplierMarginRule) => {
    if (!confirm(`Er du sikker på at du vil slette denne ${MARGIN_RULE_TYPE_LABELS[rule.rule_type]}-regel?`)) return

    const result = await deleteMarginRule(rule.id)
    if (result.success) {
      toast.success('Regel slettet')
      loadData()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleEdit = (rule: SupplierMarginRule) => {
    setEditingRule(rule)
    setShowForm(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingRule(null)
    loadData()
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-gray-200 rounded" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.totalRules}</div>
            <div className="text-sm text-gray-500">Regler i alt</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{summary.activeRules}</div>
            <div className="text-sm text-gray-500">Aktive regler</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">
              {summary.defaultMargin != null ? `${summary.defaultMargin}%` : '—'}
            </div>
            <div className="text-sm text-gray-500">Standard margin</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">
              {Object.values(summary.rulesByType).filter(v => v > 0).length}
            </div>
            <div className="text-sm text-gray-500">Regeltyper</div>
          </div>
        </div>
      )}

      {/* Priority Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Prioritetshierarki for marginregler</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
              <li>Produkt-specifikke regler (højest)</li>
              <li>Kunde-specifikke regler</li>
              <li>Underkategori-regler</li>
              <li>Kategori-regler</li>
              <li>Leverandør standard (lavest)</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Add Rule Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Marginregler for {supplierName}</h3>
        <Button onClick={() => { setEditingRule(null); setShowForm(true) }}>
          <Plus className="w-4 h-4 mr-2" />
          Tilføj regel
        </Button>
      </div>

      {/* Rules Form */}
      {showForm && (
        <MarginRuleForm
          supplierId={supplierId}
          editingRule={editingRule}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditingRule(null) }}
        />
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <Percent className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Ingen marginregler</h3>
          <p className="text-sm text-gray-500 mt-1">
            Tilføj regler for at styre avancer automatisk for {supplierName}-produkter
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {RULE_TYPE_ORDER.map(type => {
            const typeRules = rules.filter(r => r.rule_type === type)
            if (typeRules.length === 0) return null

            return (
              <div key={type} className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${RULE_TYPE_COLORS[type]}`}>
                      {MARGIN_RULE_TYPE_LABELS[type]}
                    </span>
                    <span className="text-xs text-gray-500">{MARGIN_RULE_TYPE_DESCRIPTIONS[type]}</span>
                  </div>
                  <span className="text-xs text-gray-400">{typeRules.length} {typeRules.length === 1 ? 'regel' : 'regler'}</span>
                </div>

                <div className="divide-y">
                  {typeRules.map(rule => (
                    <div
                      key={rule.id}
                      className={`px-4 py-3 flex items-center gap-4 ${!rule.is_active ? 'opacity-50' : ''}`}
                    >
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(rule.id)}
                        className="shrink-0"
                        title={rule.is_active ? 'Deaktiver' : 'Aktiver'}
                      >
                        {rule.is_active
                          ? <ToggleRight className="h-5 w-5 text-green-500" />
                          : <ToggleLeft className="h-5 w-5 text-gray-400" />
                        }
                      </button>

                      {/* Rule info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-900">
                            {rule.margin_percentage}% margin
                          </span>
                          {rule.fixed_markup > 0 && (
                            <span className="text-gray-500">+ {rule.fixed_markup} kr fast tillæg</span>
                          )}
                          {rule.round_to && (
                            <span className="text-gray-400">afrund til {rule.round_to}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {rule.category && <span>Kategori: {rule.category}</span>}
                          {rule.sub_category && <span>Underkat: {rule.sub_category}</span>}
                          {rule.min_margin_percentage != null && <span>Min: {rule.min_margin_percentage}%</span>}
                          {rule.max_margin_percentage != null && <span>Maks: {rule.max_margin_percentage}%</span>}
                          {rule.valid_from && <span>Fra: {new Date(rule.valid_from).toLocaleDateString('da-DK')}</span>}
                          {rule.valid_to && <span>Til: {new Date(rule.valid_to).toLocaleDateString('da-DK')}</span>}
                          {rule.notes && <span className="italic">{rule.notes}</span>}
                        </div>
                      </div>

                      {/* Priority badge */}
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                        Prioritet: {rule.priority}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          title="Rediger"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                          title="Slet"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =====================================================
// Margin Rule Form
// =====================================================

interface MarginRuleFormProps {
  supplierId: string
  editingRule: SupplierMarginRule | null
  onSuccess: () => void
  onCancel: () => void
}

function MarginRuleForm({ supplierId, editingRule, onSuccess, onCancel }: MarginRuleFormProps) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [ruleType, setRuleType] = useState<MarginRuleType>(editingRule?.rule_type || 'supplier')
  const [marginPercentage, setMarginPercentage] = useState(editingRule?.margin_percentage?.toString() || '')
  const [fixedMarkup, setFixedMarkup] = useState(editingRule?.fixed_markup?.toString() || '0')
  const [roundTo, setRoundTo] = useState(editingRule?.round_to?.toString() || '')
  const [minMargin, setMinMargin] = useState(editingRule?.min_margin_percentage?.toString() || '')
  const [maxMargin, setMaxMargin] = useState(editingRule?.max_margin_percentage?.toString() || '')
  const [category, setCategory] = useState(editingRule?.category || '')
  const [subCategory, setSubCategory] = useState(editingRule?.sub_category || '')
  const [priority, setPriority] = useState(editingRule?.priority?.toString() || '0')
  const [validFrom, setValidFrom] = useState(editingRule?.valid_from || '')
  const [validTo, setValidTo] = useState(editingRule?.valid_to || '')
  const [notes, setNotes] = useState(editingRule?.notes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!marginPercentage || isNaN(Number(marginPercentage))) {
      toast.error('Marginprocent er påkrævet')
      return
    }

    setIsSaving(true)

    if (editingRule) {
      // Update existing
      const result = await updateMarginRule(editingRule.id, {
        margin_percentage: Number(marginPercentage),
        fixed_markup: Number(fixedMarkup) || 0,
        round_to: roundTo ? Number(roundTo) : null,
        min_margin_percentage: minMargin ? Number(minMargin) : null,
        max_margin_percentage: maxMargin ? Number(maxMargin) : null,
        priority: Number(priority) || 0,
        valid_from: validFrom || null,
        valid_to: validTo || null,
        notes: notes || '',
      })

      if (result.success) {
        toast.success('Regel opdateret')
        onSuccess()
      } else {
        toast.error('Fejl', result.error)
      }
    } else {
      // Create new
      const data: CreateMarginRuleData = {
        supplier_id: supplierId,
        rule_type: ruleType,
        margin_percentage: Number(marginPercentage),
        fixed_markup: Number(fixedMarkup) || 0,
        round_to: roundTo ? Number(roundTo) : undefined,
        min_margin_percentage: minMargin ? Number(minMargin) : undefined,
        max_margin_percentage: maxMargin ? Number(maxMargin) : undefined,
        category: category || undefined,
        sub_category: subCategory || undefined,
        priority: Number(priority) || 0,
        valid_from: validFrom || undefined,
        valid_to: validTo || undefined,
        notes: notes || undefined,
      }

      const result = await createMarginRule(data)

      if (result.success) {
        toast.success('Regel oprettet')
        onSuccess()
      } else {
        toast.error('Fejl', result.error)
      }
    }

    setIsSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{editingRule ? 'Rediger marginregel' : 'Opret ny marginregel'}</h4>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Rule Type */}
        {!editingRule && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Regeltype</label>
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as MarginRuleType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {RULE_TYPE_ORDER.map(type => (
                <option key={type} value={type}>{MARGIN_RULE_TYPE_LABELS[type]}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">{MARGIN_RULE_TYPE_DESCRIPTIONS[ruleType]}</p>
          </div>
        )}

        {/* Margin Percentage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Marginprocent <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              value={marginPercentage}
              onChange={(e) => setMarginPercentage(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm pr-8"
              placeholder="f.eks. 25"
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
          </div>
        </div>

        {/* Fixed Markup */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fast tillæg (kr)</label>
          <input
            type="number"
            step="0.01"
            value={fixedMarkup}
            onChange={(e) => setFixedMarkup(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="0"
          />
        </div>

        {/* Round To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Afrund til</label>
          <input
            type="number"
            step="1"
            value={roundTo}
            onChange={(e) => setRoundTo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="f.eks. 5 eller 10"
          />
        </div>

        {/* Min Margin */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min. margin (%)</label>
          <input
            type="number"
            step="0.1"
            value={minMargin}
            onChange={(e) => setMinMargin(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Valgfri"
          />
        </div>

        {/* Max Margin */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Maks. margin (%)</label>
          <input
            type="number"
            step="0.1"
            value={maxMargin}
            onChange={(e) => setMaxMargin(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Valgfri"
          />
        </div>

        {/* Category (for category/subcategory rules) */}
        {(ruleType === 'category' || ruleType === 'subcategory') && !editingRule && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kategori <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="f.eks. Kabler"
              required
            />
          </div>
        )}

        {/* Sub Category (for subcategory rules) */}
        {ruleType === 'subcategory' && !editingRule && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Underkategori <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="f.eks. Installationskabler"
              required
            />
          </div>
        )}

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="0"
          />
          <p className="text-xs text-gray-500 mt-1">Højere = højere prioritet inden for samme type</p>
        </div>

        {/* Valid From */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gyldig fra</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Valid To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gyldig til</label>
          <input
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2 lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Noter</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Valgfri noter til reglen"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuller
        </Button>
        <Button type="submit" disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Gemmer...' : editingRule ? 'Opdater regel' : 'Opret regel'}
        </Button>
      </div>
    </form>
  )
}
