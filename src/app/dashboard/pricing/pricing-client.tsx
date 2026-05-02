'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { AlertTriangle, TrendingUp, TrendingDown, ArrowUpDown, FileText, Package, RefreshCw, Activity } from 'lucide-react'
import {
  getPriceChangeAlerts,
  getAffectedOffers,
  getSupplierPriceStats,
  getPriceAlertSummary,
  getPriceTrends,
} from '@/lib/actions/price-analytics'
import type {
  PriceChangeAlert,
  AffectedOffer,
  SupplierPriceStats,
  PriceTrend,
} from '@/lib/actions/price-analytics'
import { formatDate as formatDateUtil } from '@/lib/utils'

type Tab = 'alerts' | 'affected' | 'suppliers' | 'trends'

export function PricingDashboardClient() {
  const [activeTab, setActiveTab] = useState<Tab>('alerts')
  const [alerts, setAlerts] = useState<PriceChangeAlert[]>([])
  const [affectedOffers, setAffectedOffers] = useState<AffectedOffer[]>([])
  const [supplierStats, setSupplierStats] = useState<SupplierPriceStats[]>([])
  const [trends, setTrends] = useState<PriceTrend[]>([])
  const [trendsSupplierId, setTrendsSupplierId] = useState<string>('')
  const [isLoadingTrends, setIsLoadingTrends] = useState(false)
  const [summary, setSummary] = useState<{
    totalAlerts: number
    priceIncreases: number
    priceDecreases: number
    affectedOffers: number
    criticalAlerts: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [threshold, setThreshold] = useState(5)
  const [daysBack, setDaysBack] = useState(7)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const [alertsRes, summaryRes] = await Promise.all([
      getPriceChangeAlerts({ threshold, daysBack, limit: 50 }),
      getPriceAlertSummary(),
    ])

    if (alertsRes.success && alertsRes.data) setAlerts(alertsRes.data)
    if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data)
    setIsLoading(false)
  }, [threshold, daysBack])

  useEffect(() => {
    loadData()
  }, [loadData])

  const loadTrends = useCallback(async (supplierId: string) => {
    if (!supplierId) return
    setIsLoadingTrends(true)
    const res = await getPriceTrends(supplierId, { limit: 50 })
    if (res.success && res.data) setTrends(res.data)
    setIsLoadingTrends(false)
  }, [])

  const loadTabData = useCallback(async (tab: Tab) => {
    if (tab === 'affected' && affectedOffers.length === 0) {
      const res = await getAffectedOffers(undefined, { daysBack })
      if (res.success && res.data) setAffectedOffers(res.data)
    }
    if (tab === 'suppliers' && supplierStats.length === 0) {
      const res = await getSupplierPriceStats()
      if (res.success && res.data) setSupplierStats(res.data)
    }
    if (tab === 'trends' && supplierStats.length === 0) {
      const res = await getSupplierPriceStats()
      if (res.success && res.data) setSupplierStats(res.data)
    }
  }, [affectedOffers.length, supplierStats.length, daysBack])

  useEffect(() => {
    loadTabData(activeTab)
  }, [activeTab, loadTabData])

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Kritiske advarsler"
            value={summary.criticalAlerts}
            icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            bgColor="bg-red-50 border-red-200"
            valueColor="text-red-700"
          />
          <SummaryCard
            label="Prisændringer total"
            value={summary.totalAlerts}
            icon={<ArrowUpDown className="h-5 w-5 text-amber-600" />}
            bgColor="bg-amber-50 border-amber-200"
            valueColor="text-amber-700"
          />
          <SummaryCard
            label="Prisstigninger"
            value={summary.priceIncreases}
            icon={<TrendingUp className="h-5 w-5 text-red-500" />}
            bgColor="bg-red-50/50 border-red-100"
            valueColor="text-red-600"
          />
          <SummaryCard
            label="Påvirkede tilbud"
            value={summary.affectedOffers}
            icon={<FileText className="h-5 w-5 text-blue-600" />}
            bgColor="bg-blue-50 border-blue-200"
            valueColor="text-blue-700"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Tærskel:</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          >
            <option value={2}>2%+</option>
            <option value={5}>5%+</option>
            <option value={10}>10%+</option>
            <option value={20}>20%+</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Periode:</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
          >
            <option value={1}>Sidste 24 timer</option>
            <option value={7}>Sidste 7 dage</option>
            <option value={14}>Sidste 14 dage</option>
            <option value={30}>Sidste 30 dage</option>
          </select>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Opdater
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px">
          {[
            { key: 'alerts' as Tab, label: 'Prisadvarsler', count: alerts.length },
            { key: 'affected' as Tab, label: 'Påvirkede tilbud', count: affectedOffers.length },
            { key: 'suppliers' as Tab, label: 'Leverandørstatistik', count: supplierStats.length },
            { key: 'trends' as Tab, label: 'Pristendenser', count: trends.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'alerts' && <AlertsTab alerts={alerts} isLoading={isLoading} />}
        {activeTab === 'affected' && <AffectedOffersTab offers={affectedOffers} />}
        {activeTab === 'suppliers' && <SuppliersTab stats={supplierStats} />}
        {activeTab === 'trends' && (
          <TrendsTab
            trends={trends}
            isLoading={isLoadingTrends}
            suppliers={supplierStats}
            selectedSupplierId={trendsSupplierId}
            onSupplierChange={(id) => {
              setTrendsSupplierId(id)
              loadTrends(id)
            }}
          />
        )}
      </div>
    </div>
  )
}

// =====================================================
// Tab Components
// =====================================================

function AlertsTab({ alerts, isLoading }: { alerts: PriceChangeAlert[]; isLoading: boolean }) {
  if (isLoading) return <LoadingState />
  if (alerts.length === 0) return <EmptyState message="Ingen prisadvarsler i den valgte periode" />

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2.5 font-medium">Produkt</th>
              <th className="text-left px-4 py-2.5 font-medium">Leverandør</th>
              <th className="text-right px-4 py-2.5 font-medium">Gammel pris</th>
              <th className="text-right px-4 py-2.5 font-medium">Ny pris</th>
              <th className="text-right px-4 py-2.5 font-medium">Ændring</th>
              <th className="text-center px-4 py-2.5 font-medium">Påvirker</th>
              <th className="text-right px-4 py-2.5 font-medium">Dato</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => {
              const isIncrease = alert.change_direction === 'increase'
              const severity = Math.abs(alert.change_percentage) >= 10 ? 'critical'
                : Math.abs(alert.change_percentage) >= 5 ? 'warning' : 'info'

              return (
                <tr key={alert.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium truncate max-w-[200px]">{alert.product_name}</div>
                    <div className="text-xs text-gray-400">{alert.supplier_sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{alert.supplier_name}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(alert.old_price)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(alert.new_price)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      severity === 'critical' ? 'bg-red-100 text-red-700'
                        : severity === 'warning' ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs">
                      {alert.affects_offers > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <FileText className="h-3 w-3" />
                          {alert.affects_offers}
                        </span>
                      )}
                      {alert.affects_calculations > 0 && (
                        <span className="flex items-center gap-0.5 text-blue-600">
                          <Package className="h-3 w-3" />
                          {alert.affects_calculations}
                        </span>
                      )}
                      {alert.affects_offers === 0 && alert.affects_calculations === 0 && (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                    {formatDateUtil(alert.changed_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AffectedOffersTab({ offers }: { offers: AffectedOffer[] }) {
  if (offers.length === 0) return <EmptyState message="Ingen tilbud er påvirket af nylige prisændringer" />

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2.5 font-medium">Tilbud</th>
              <th className="text-left px-4 py-2.5 font-medium">Kunde</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-right px-4 py-2.5 font-medium">Beløb</th>
              <th className="text-center px-4 py-2.5 font-medium">Ber. linjer</th>
              <th className="text-right px-4 py-2.5 font-medium">Potentielt tab</th>
              <th className="text-right px-4 py-2.5 font-medium">Oprettet</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.offer_id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <a
                    href={`/dashboard/offers/${offer.offer_id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {offer.offer_number}
                  </a>
                  <div className="text-xs text-gray-400 truncate max-w-[180px]">{offer.offer_title}</div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{offer.customer_name}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={offer.status} />
                </td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(offer.total_amount)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {offer.affected_items}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`font-medium ${offer.potential_loss > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {offer.potential_loss > 0 ? '-' : '+'}{formatCurrency(Math.abs(offer.potential_loss))}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                  {formatDateUtil(offer.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SuppliersTab({ stats }: { stats: SupplierPriceStats[] }) {
  if (stats.length === 0) return <EmptyState message="Ingen leverandørstatistik tilgængelig" />

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {stats.map((stat) => (
        <div key={stat.supplier_id} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">{stat.supplier_name}</h3>
            {stat.last_sync_at && (
              <span className="text-xs text-gray-400">
                Synk: {formatDateUtil(stat.last_sync_at)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label="Produkter" value={stat.total_products} />
            <MiniStat label="Prisændringer" value={stat.products_with_price_changes} warn={stat.products_with_price_changes > 10} />
            <MiniStat label="Forældede" value={stat.stale_products} warn={stat.stale_products > 0} />
            <MiniStat label="Gns. stigning" value={`${stat.average_price_increase.toFixed(1)}%`} warn={stat.average_price_increase > 5} />
          </div>

          {/* Price change distribution bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Prisbevægelse</span>
              <span>
                <span className="text-red-500">+{stat.average_price_increase.toFixed(1)}%</span>
                {' / '}
                <span className="text-green-500">-{stat.average_price_decrease.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
              {stat.average_price_increase > 0 && (
                <div
                  className="bg-red-400 h-full"
                  style={{ width: `${Math.min(stat.average_price_increase * 5, 50)}%` }}
                />
              )}
              {stat.average_price_decrease > 0 && (
                <div
                  className="bg-green-400 h-full ml-auto"
                  style={{ width: `${Math.min(stat.average_price_decrease * 5, 50)}%` }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendsTab({
  trends,
  isLoading,
  suppliers,
  selectedSupplierId,
  onSupplierChange,
}: {
  trends: PriceTrend[]
  isLoading: boolean
  suppliers: SupplierPriceStats[]
  selectedSupplierId: string
  onSupplierChange: (id: string) => void
}) {
  const volatilityStyles = {
    stable: 'bg-green-100 text-green-700',
    moderate: 'bg-amber-100 text-amber-700',
    high: 'bg-red-100 text-red-700',
  }
  const volatilityLabels = {
    stable: 'Stabil',
    moderate: 'Moderat',
    high: 'Høj',
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
        <label className="text-sm text-gray-500">Leverandør:</label>
        <select
          className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
          value={selectedSupplierId}
          onChange={(e) => onSupplierChange(e.target.value)}
        >
          <option value="">Vælg leverandør...</option>
          {suppliers.map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
          ))}
        </select>
      </div>

      {!selectedSupplierId ? (
        <EmptyState message="Vælg en leverandør for at se pristendenser" />
      ) : isLoading ? (
        <LoadingState />
      ) : trends.length === 0 ? (
        <EmptyState message="Ingen pristendenser fundet for denne leverandør" />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium">Produkt</th>
                  <th className="text-right px-4 py-2.5 font-medium">Nuv. pris</th>
                  <th className="text-right px-4 py-2.5 font-medium">30 dage</th>
                  <th className="text-right px-4 py-2.5 font-medium">90 dage</th>
                  <th className="text-center px-4 py-2.5 font-medium">Volatilitet</th>
                  <th className="text-center px-4 py-2.5 font-medium">Ændringer</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((trend) => (
                  <tr key={trend.supplier_product_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium truncate max-w-[250px]">{trend.product_name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(trend.current_price)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {trend.trend_30_days !== null ? (
                        <span className={`inline-flex items-center gap-1 ${trend.trend_30_days > 0 ? 'text-red-600' : trend.trend_30_days < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {trend.trend_30_days > 0 ? <TrendingUp className="h-3 w-3" /> : trend.trend_30_days < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                          {trend.trend_30_days > 0 ? '+' : ''}{trend.trend_30_days}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {trend.trend_90_days !== null ? (
                        <span className={`inline-flex items-center gap-1 ${trend.trend_90_days > 0 ? 'text-red-600' : trend.trend_90_days < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {trend.trend_90_days > 0 ? <TrendingUp className="h-3 w-3" /> : trend.trend_90_days < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                          {trend.trend_90_days > 0 ? '+' : ''}{trend.trend_90_days}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${volatilityStyles[trend.volatility]}`}>
                        {volatilityLabels[trend.volatility]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{trend.change_count_30_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// Helper Components
// =====================================================

function SummaryCard({
  label, value, icon, bgColor, valueColor, isText,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  bgColor: string
  valueColor: string
  isText?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>
        {isText ? value : value}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-purple-100 text-purple-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-amber-100 text-amber-700',
  }
  const labels: Record<string, string> = {
    draft: 'Kladde',
    sent: 'Sendt',
    viewed: 'Set',
    accepted: 'Accepteret',
    rejected: 'Afvist',
    expired: 'Udløbet',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status] || status}
    </span>
  )
}

function MiniStat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${warn ? 'text-amber-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="bg-white rounded-lg border p-8 text-center">
      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
      <p className="text-sm text-gray-500 mt-2">Indlæser data...</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-lg border p-8 text-center">
      <Package className="h-8 w-8 mx-auto text-gray-300 mb-2" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}


