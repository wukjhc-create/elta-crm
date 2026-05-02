'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils/format'
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Banknote,
  Package,
  FileText,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ArrowRight,
  Zap,
  Building2,
  Ruler,
  Plug,
  Users,
  X,
  Search,
} from 'lucide-react'
import {
  analyzeProjectDescription,
  quickAnalyzeProject,
  createOfferFromAnalysis,
  listAnalyses,
} from '@/lib/actions/auto-project'
import { getCustomers } from '@/lib/actions/customers'
import type { AnalyzeProjectOutput, RiskFactor } from '@/types/auto-project.types'

interface Customer {
  id: string
  name: string
  email: string | null
}

export function AIProjectClient() {
  const router = useRouter()
  const toast = useToast()
  const [description, setDescription] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<(AnalyzeProjectOutput & { id: string; warnings: string[] }) | null>(null)
  const [quickResult, setQuickResult] = useState<{
    buildingType: string
    sizeM2: number | null
    totalPoints: number
    estimatedHours: number
    estimatedPrice: number
    complexityScore: number
    riskScore: number
  } | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    interpretation: true,
    calculation: true,
    risks: true,
    offer: false,
  })
  const [creatingOffer, setCreatingOffer] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [recentAnalyses, setRecentAnalyses] = useState<{ id: string; description: string; total_price: number; created_at: string }[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  // Load recent analyses on mount
  useEffect(() => {
    async function loadHistory() {
      const res = await listAnalyses({ limit: 10 })
      if (res.success && res.data) setRecentAnalyses(res.data)
      setLoadingHistory(false)
    }
    loadHistory()
  }, [])

  // Quick analyze as user types (debounced)
  const handleDescriptionChange = useCallback(async (value: string) => {
    setDescription(value)

    if (value.length > 20) {
      const quickRes = await quickAnalyzeProject(value)
      if (quickRes.success && quickRes.data) {
        setQuickResult(quickRes.data)
      }
    } else {
      setQuickResult(null)
    }
  }, [])

  // Full analysis
  const handleAnalyze = async () => {
    if (!description.trim()) {
      toast.error('Fejl', 'Indtast en projektbeskrivelse')
      return
    }

    setAnalyzing(true)
    setResult(null)

    const res = await analyzeProjectDescription({
      description,
      options: {
        hourly_rate: 450,
        margin_percentage: 25,
        risk_buffer_percentage: 5,
      },
    })

    if (res.success && res.data) {
      setResult(res.data)
      toast.success('Analyse fuldført', `Estimeret pris: ${formatCurrency(res.data.calculation.price.total_price)}`)
    } else {
      toast.error('Analyse fejlede', res.error)
    }

    setAnalyzing(false)
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const copyOfferText = () => {
    if (result?.offer_text.full_offer_text) {
      navigator.clipboard.writeText(result.offer_text.full_offer_text)
      toast.success('Kopieret', 'Tilbudstekst kopieret til udklipsholder')
    }
  }

  const handleCreateOffer = async () => {
    if (!result) return
    setShowCustomerModal(true)
    loadCustomers()
  }

  const loadCustomers = async () => {
    setLoadingCustomers(true)
    const res = await getCustomers({ pageSize: 100 })
    if (res.success && res.data) {
      setCustomers(res.data.data.map((c) => ({
        id: c.id,
        name: c.company_name || c.contact_person,
        email: c.email,
      })))
    }
    setLoadingCustomers(false)
  }

  const handleSelectCustomer = async (customerId: string) => {
    if (!result) return

    setCreatingOffer(true)
    const res = await createOfferFromAnalysis(result.id, customerId)

    if (res.success && res.data) {
      toast.success('Tilbud oprettet', 'Du bliver sendt til tilbuddet')
      setShowCustomerModal(false)
      router.push(`/dashboard/offers/${res.data.offer_id}`)
    } else {
      toast.error('Kunne ikke oprette tilbud', res.error)
    }
    setCreatingOffer(false)
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-500" />
          AI Projektanalyse
        </h1>
        <p className="text-gray-500 mt-1">
          Beskriv projektet og få automatisk kalkulation, risikovurdering og tilbudstekst
        </p>
      </div>

      {/* Input Section */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <label className="block text-sm font-medium mb-2">Projektbeskrivelse</label>
        <textarea
          className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          placeholder="Eksempel: Renovering af 140m2 hus. Nye spots i køkken, 20 stikkontakter, ny tavle, udendørs belysning..."
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
        />

        {/* Quick Preview */}
        {quickResult && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg">
            <div className="text-sm font-medium text-purple-800 mb-2">Hurtig estimat</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-500" />
                <span>{getBuildingTypeName(quickResult.buildingType)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-purple-500" />
                <span>{quickResult.totalPoints} elpunkter</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" />
                <span>~{Math.round(quickResult.estimatedHours)} timer</span>
              </div>
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-purple-500" />
                <span className="font-semibold">{formatCurrency(quickResult.estimatedPrice)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={handleAnalyze} disabled={analyzing || !description.trim()} size="lg">
            {analyzing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Analyserer...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Analyser projekt
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <div className="font-medium text-yellow-800">Bemærkninger</div>
                  <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                    {result.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={<Banknote className="w-5 h-5" />}
              label="Total pris"
              value={formatCurrency(result.calculation.price.total_price)}
              sublabel="ekskl. moms"
              color="green"
            />
            <SummaryCard
              icon={<Clock className="w-5 h-5" />}
              label="Estimeret tid"
              value={`${Math.round(result.calculation.time.total_hours)} timer`}
              sublabel={`${Math.ceil(result.calculation.time.total_hours / 7.5)} arbejdsdage`}
              color="blue"
            />
            <SummaryCard
              icon={<Package className="w-5 h-5" />}
              label="Komponenter"
              value={`${result.calculation.components.reduce((s, c) => s + c.quantity, 0)} stk`}
              sublabel={`${result.calculation.components.length} typer`}
              color="purple"
            />
            <SummaryCard
              icon={<AlertTriangle className="w-5 h-5" />}
              label="Risikoniveau"
              value={getRiskLabel(result.interpretation.risk_score)}
              sublabel={`${result.risks.length} fundne risici`}
              color={result.interpretation.risk_score >= 4 ? 'red' : result.interpretation.risk_score >= 3 ? 'yellow' : 'green'}
            />
          </div>

          {/* Interpretation Section */}
          <CollapsibleSection
            title="Projektfortolkning"
            expanded={expandedSections.interpretation}
            onToggle={() => toggleSection('interpretation')}
            badge={<Badge variant="secondary">{result.interpretation.ai_confidence > 0.7 ? 'Høj sikkerhed' : 'Moderat sikkerhed'}</Badge>}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">Bygningsinformation</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Type</dt>
                    <dd className="font-medium">{getBuildingTypeName(result.interpretation.building_type)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Størrelse</dt>
                    <dd className="font-medium">{result.interpretation.building_size_m2 || 'Ukendt'} m²</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Alder</dt>
                    <dd className="font-medium">{result.interpretation.building_age_years ? `~${result.interpretation.building_age_years} år` : 'Ukendt'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Kompleksitet</dt>
                    <dd className="font-medium">{getComplexityLabel(result.interpretation.complexity_score)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium mb-3">Elpunkter</h4>
                <dl className="space-y-2 text-sm">
                  {Object.entries(result.interpretation.electrical_points).map(([key, value]) => (
                    value ? (
                      <div key={key} className="flex justify-between">
                        <dt className="text-gray-500">{getPointTypeName(key)}</dt>
                        <dd className="font-medium">{value} stk</dd>
                      </div>
                    ) : null
                  ))}
                </dl>
              </div>
            </div>

            {result.interpretation.complexity_factors.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium mb-2">Kompleksitetsfaktorer</h4>
                <div className="flex flex-wrap gap-2">
                  {result.interpretation.complexity_factors.map((f, i) => (
                    <Badge key={i} variant="secondary">
                      {f.name} (×{f.multiplier})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Calculation Section */}
          <CollapsibleSection
            title="Kalkulation"
            expanded={expandedSections.calculation}
            onToggle={() => toggleSection('calculation')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Price Breakdown */}
              <div>
                <h4 className="font-medium mb-3">Prisopbygning</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Materialer</dt>
                    <dd>{formatCurrency(result.calculation.price.material_cost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Arbejdsløn ({result.calculation.time.total_hours.toFixed(1)}t × {result.calculation.price.hourly_rate} kr)</dt>
                    <dd>{formatCurrency(result.calculation.price.labor_cost)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <dt className="text-gray-500">Subtotal</dt>
                    <dd>{formatCurrency(result.calculation.price.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Margin ({result.calculation.price.margin_percentage}%)</dt>
                    <dd>{formatCurrency(result.calculation.price.margin_amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Risikobuffer ({result.calculation.price.risk_buffer_percentage}%)</dt>
                    <dd>{formatCurrency(result.calculation.price.risk_buffer_amount)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <dt>Total</dt>
                    <dd className="text-green-600">{formatCurrency(result.calculation.price.total_price)}</dd>
                  </div>
                </dl>
              </div>

              {/* Time Breakdown */}
              <div>
                <h4 className="font-medium mb-3">Tidsberegning</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Basis tid</dt>
                    <dd>{result.calculation.time.base_hours.toFixed(1)} timer</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Kompleksitetsfaktor</dt>
                    <dd>×{result.calculation.time.complexity_multiplier}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Størrelsesfaktor</dt>
                    <dd>×{result.calculation.time.size_multiplier}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Tilgængelighedsfaktor</dt>
                    <dd>×{result.calculation.time.accessibility_multiplier}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <dt>Total tid</dt>
                    <dd>{result.calculation.time.total_hours.toFixed(1)} timer</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Components Table */}
            <div className="mt-6">
              <h4 className="font-medium mb-3">Komponenter</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3">Komponent</th>
                      <th className="text-right p-3">Antal</th>
                      <th className="text-right p-3">Enhedspris</th>
                      <th className="text-right p-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.calculation.components.map((comp, i) => (
                      <tr key={i}>
                        <td className="p-3">{comp.name}</td>
                        <td className="p-3 text-right">{comp.quantity} {comp.unit}</td>
                        <td className="p-3 text-right">{formatCurrency(comp.unit_price)}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(comp.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CollapsibleSection>

          {/* Risks Section */}
          <CollapsibleSection
            title="Risikovurdering"
            expanded={expandedSections.risks}
            onToggle={() => toggleSection('risks')}
            badge={
              <Badge
                variant="secondary"
                className={
                  result.interpretation.risk_score >= 4
                    ? 'bg-red-100 text-red-800'
                    : result.interpretation.risk_score >= 3
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
                }
              >
                {getRiskLabel(result.interpretation.risk_score)}
              </Badge>
            }
          >
            {result.risks.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span>Ingen væsentlige risici identificeret</span>
              </div>
            ) : (
              <div className="space-y-3">
                {result.risks.map((risk, i) => (
                  <RiskCard key={i} risk={risk} />
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Offer Text Section */}
          <CollapsibleSection
            title="Tilbudstekst"
            expanded={expandedSections.offer}
            onToggle={() => toggleSection('offer')}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyOfferText}>
                  <Copy className="w-4 h-4 mr-1" />
                  Kopier
                </Button>
              </div>
            }
          >
            <pre className="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap font-mono overflow-x-auto">
              {result.offer_text.full_offer_text}
            </pre>
          </CollapsibleSection>

          {/* Actions */}
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Næste skridt</h3>
                <p className="text-sm text-gray-500">Opret et rigtigt tilbud baseret på denne analyse</p>
              </div>
              <Button onClick={handleCreateOffer} disabled={creatingOffer}>
                {creatingOffer ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="w-4 h-4 mr-2" />
                )}
                Opret tilbud
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Example Descriptions */}
      {!result && (
        <div className="bg-gray-50 border rounded-lg p-6">
          <h3 className="font-medium mb-3">Eksempler på projektbeskrivelser</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {EXAMPLE_DESCRIPTIONS.map((example, i) => (
              <button
                key={i}
                onClick={() => handleDescriptionChange(example.text)}
                className="text-left p-4 bg-white border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-sm mb-1">{example.title}</div>
                <div className="text-sm text-gray-500 line-clamp-2">{example.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Analyses History */}
      <div className="bg-white border rounded-lg p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-500" />
          Seneste analyser
        </h2>
        {loadingHistory ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        ) : recentAnalyses.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            Ingen tidligere analyser endnu
          </p>
        ) : (
          <div className="space-y-2">
            {recentAnalyses.map((analysis) => (
              <div
                key={analysis.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{analysis.description}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(analysis.created_at).toLocaleDateString('da-DK', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className="text-sm font-medium text-gray-900 shrink-0">
                  {formatCurrency(analysis.total_price)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-500" />
                <h2 className="font-semibold">Vælg kunde</h2>
              </div>
              <button onClick={() => setShowCustomerModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Søg efter kunde..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {loadingCustomers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {customerSearch ? 'Ingen kunder fundet' : 'Ingen kunder'}
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer.id)}
                      disabled={creatingOffer}
                      className="w-full text-left p-3 border rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all disabled:opacity-50"
                    >
                      <div className="font-medium">{customer.name}</div>
                      {customer.email && (
                        <div className="text-sm text-gray-500">{customer.email}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCustomerModal(false)}>
                Annuller
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Sub-components
// =====================================================

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel: string
  color: 'green' | 'blue' | 'purple' | 'red' | 'yellow'
}) {
  const colors = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className={`w-10 h-10 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-gray-400">{sublabel}</div>
    </div>
  )
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  badge,
  actions,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  badge?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border rounded-lg">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{title}</h3>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>
      {expanded && <div className="p-4 pt-0 border-t">{children}</div>}
    </div>
  )
}

function RiskCard({ risk }: { risk: RiskFactor }) {
  const severityColors = {
    low: 'border-green-200 bg-green-50',
    medium: 'border-yellow-200 bg-yellow-50',
    high: 'border-orange-200 bg-orange-50',
    critical: 'border-red-200 bg-red-50',
  }

  const severityIcons = {
    low: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    medium: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    high: <AlertTriangle className="w-4 h-4 text-orange-500" />,
    critical: <AlertTriangle className="w-4 h-4 text-red-500" />,
  }

  return (
    <div className={`border rounded-lg p-4 ${severityColors[risk.severity]}`}>
      <div className="flex items-start gap-3">
        {severityIcons[risk.severity]}
        <div className="flex-1">
          <div className="font-medium">{risk.title}</div>
          <div className="text-sm text-gray-600 mt-1">{risk.description}</div>
          {risk.recommendation && (
            <div className="text-sm text-gray-500 mt-2 italic">
              Anbefaling: {risk.recommendation}
            </div>
          )}
        </div>
        <Badge variant="secondary" className="text-xs">
          {risk.severity === 'low' && 'Lav'}
          {risk.severity === 'medium' && 'Moderat'}
          {risk.severity === 'high' && 'Høj'}
          {risk.severity === 'critical' && 'Kritisk'}
        </Badge>
      </div>
    </div>
  )
}

// =====================================================
// Helpers
// =====================================================

function getBuildingTypeName(type: string): string {
  const names: Record<string, string> = {
    house: 'Villa/Parcelhus',
    apartment: 'Lejlighed',
    commercial: 'Erhverv',
    industrial: 'Industri',
    unknown: 'Ukendt',
  }
  return names[type] || type
}

function getPointTypeName(key: string): string {
  const names: Record<string, string> = {
    outlets: 'Stikkontakter',
    double_outlets: 'Dobbelt stik',
    switches: 'Afbrydere',
    multi_switches: 'Korrespondance',
    dimmers: 'Dæmpere',
    spots: 'Spots',
    ceiling_lights: 'Loftlamper',
    outdoor_lights: 'Udendørs',
    power_16a: '16A kraft',
    power_32a: '32A kraft',
    ev_charger: 'Elbillader',
    data_outlets: 'Dataudtag',
    tv_outlets: 'TV/Antenne',
  }
  return names[key] || key
}

function getComplexityLabel(score: number): string {
  const labels = ['', 'Simpelt', 'Let', 'Normalt', 'Komplekst', 'Meget komplekst']
  return labels[score] || 'Ukendt'
}

function getRiskLabel(score: number): string {
  const labels = ['', 'Lavt', 'Normalt', 'Moderat', 'Forhøjet', 'Højt']
  return labels[score] || 'Ukendt'
}

const EXAMPLE_DESCRIPTIONS = [
  {
    title: 'Renovering af parcelhus',
    text: 'Renovering af 140m2 parcelhus fra 1972. Nye spots i køkken (8 stk), 20 nye stikkontakter, udskiftning af eltavle, og 4 udendørs lamper.',
  },
  {
    title: 'Nybygget lejlighed',
    text: 'Ny lejlighed på 85m2. 12 stikkontakter, 6 afbrydere, 10 LED spots, 3 loftlamper, dataudtag i stue og kontor.',
  },
  {
    title: 'Elbillader installation',
    text: 'Installation af elbillader i garage. Carport med betonvægge. Afstand fra tavle ca. 15 meter.',
  },
  {
    title: 'Køkkenrenovering',
    text: 'Komplet el i nyt køkken. 6 spots, 4 dobbelte stikkontakter, udtag til emhætte, ovn og kogeplade.',
  },
]
