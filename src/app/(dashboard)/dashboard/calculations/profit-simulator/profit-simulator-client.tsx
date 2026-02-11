'use client'

import { useState, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils/format'
import { simulateProfit } from '@/lib/actions/calculation-intelligence'
import type { ProfitSimulationResult } from '@/types/calculation-intelligence.types'

export function ProfitSimulatorClient() {
  const [materialCost, setMaterialCost] = useState(50000)
  const [hourlyRate, setHourlyRate] = useState(495)
  const [totalHours, setTotalHours] = useState(40)
  const [overheadPct, setOverheadPct] = useState(12)
  const [riskPct, setRiskPct] = useState(3)
  const [marginPct, setMarginPct] = useState(25)
  const [discountPct, setDiscountPct] = useState(0)

  const [result, setResult] = useState<ProfitSimulationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const runSimulation = useCallback(async () => {
    setIsLoading(true)
    const res = await simulateProfit({
      cost_price: materialCost + (hourlyRate * totalHours),
      hourly_rate: hourlyRate,
      total_hours: totalHours,
      material_cost: materialCost,
      overhead_percentage: overheadPct,
      risk_percentage: riskPct,
      margin_percentage: marginPct,
      discount_percentage: discountPct,
      vat_percentage: 25,
    })
    if (res.success && res.data) {
      setResult(res.data)
    }
    setIsLoading(false)
  }, [materialCost, hourlyRate, totalHours, overheadPct, riskPct, marginPct, discountPct])

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold mb-4">Projektdata</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Materialeomkostning (kr)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={materialCost}
              onChange={(e) => setMaterialCost(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Timepris (kr/t)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Timer total</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={totalHours}
              onChange={(e) => setTotalHours(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Overhead (%)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={overheadPct}
              onChange={(e) => setOverheadPct(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Risiko (%)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={riskPct}
              onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Margin (%)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={marginPct}
              onChange={(e) => setMarginPct(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Rabat (%)</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm"
              value={discountPct}
              onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-end">
            <button
              className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              onClick={runSimulation}
              disabled={isLoading}
            >
              {isLoading ? 'Beregner...' : 'Simuler'}
            </button>
          </div>
        </div>

        {/* Quick summary */}
        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Arbejdsløn:</span>
            <span className="ml-2 font-medium">{formatCurrency(hourlyRate * totalHours)}</span>
          </div>
          <div>
            <span className="text-gray-500">Kostpris:</span>
            <span className="ml-2 font-medium">{formatCurrency(materialCost + (hourlyRate * totalHours))}</span>
          </div>
          <div>
            <span className="text-gray-500">Arbejdsdage (8t):</span>
            <span className="ml-2 font-medium">{Math.ceil(totalHours / 8)}</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard label="Materialekost" value={formatCurrency(result.material_cost)} />
            <SummaryCard label="Arbejdsløn" value={formatCurrency(result.labor_cost)} />
            <SummaryCard label="Kostpris" value={formatCurrency(result.cost_price)} highlight />
            <SummaryCard label="Overhead" value={formatCurrency(result.overhead_amount)} />
            <SummaryCard label="Salgsbasis" value={formatCurrency(result.sales_basis)} />
          </div>

          {/* Scenario Table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="font-semibold text-sm">Profit-scenarier</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="text-left px-4 py-2 font-medium">Scenarie</th>
                    <th className="text-right px-4 py-2 font-medium">Margin</th>
                    <th className="text-right px-4 py-2 font-medium">Rabat</th>
                    <th className="text-right px-4 py-2 font-medium">Nettopris</th>
                    <th className="text-right px-4 py-2 font-medium">Inkl. moms</th>
                    <th className="text-right px-4 py-2 font-medium">DB kr</th>
                    <th className="text-right px-4 py-2 font-medium">DB%</th>
                    <th className="text-right px-4 py-2 font-medium">DB/time</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map((scenario, idx) => {
                    const isStandard = scenario.name === 'Standard margin'
                    const dbColor = scenario.db_percentage < 0 ? 'text-red-600'
                      : scenario.db_percentage < 10 ? 'text-red-500'
                      : scenario.db_percentage < 20 ? 'text-amber-600'
                      : 'text-green-600'

                    return (
                      <tr
                        key={idx}
                        className={`border-b last:border-0 ${isStandard ? 'bg-blue-50 font-medium' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-2.5">{scenario.name}</td>
                        <td className="px-4 py-2.5 text-right">{scenario.margin_percentage}%</td>
                        <td className="px-4 py-2.5 text-right">
                          {scenario.discount_percentage > 0 ? `${scenario.discount_percentage}%` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(scenario.net_price)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(scenario.final_amount)}</td>
                        <td className={`px-4 py-2.5 text-right ${dbColor}`}>
                          {formatCurrency(scenario.db_amount)}
                        </td>
                        <td className={`px-4 py-2.5 text-right ${dbColor} font-semibold`}>
                          {scenario.db_percentage.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(scenario.db_per_hour)}/t</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual profit bar */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-sm mb-4">Visuel sammenligning</h3>
            <div className="space-y-3">
              {result.scenarios.map((scenario, idx) => {
                const maxAmount = Math.max(...result.scenarios.map((s) => s.final_amount))
                const barWidth = maxAmount > 0 ? (scenario.final_amount / maxAmount) * 100 : 0
                const dbColor = scenario.db_percentage < 10 ? 'bg-red-500'
                  : scenario.db_percentage < 20 ? 'bg-amber-500'
                  : 'bg-green-500'

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-36 text-xs text-gray-600 text-right truncate">{scenario.name}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${dbColor} transition-all`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="w-24 text-xs text-right font-medium">{formatCurrency(scenario.final_amount)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${highlight ? 'text-blue-700' : ''}`}>{value}</div>
    </div>
  )
}

