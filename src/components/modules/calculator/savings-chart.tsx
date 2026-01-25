'use client'

import { useState } from 'react'
import { type YearlyProjection } from '@/types/calculator.types'
import { formatCurrency, formatNumber } from '@/lib/utils/calculator'

interface SavingsChartProps {
  projections: YearlyProjection[]
  totalPrice: number
}

export function SavingsChart({ projections, totalPrice }: SavingsChartProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)

  const maxSavings = projections[projections.length - 1].cumulativeSavings
  const maxValue = Math.max(maxSavings, totalPrice) * 1.1

  // Chart dimensions
  const width = 100 // percentage
  const height = 200
  const paddingLeft = 0
  const paddingBottom = 24

  // Find break-even point
  const breakEvenYear = projections.findIndex((p) => p.cumulativeSavings >= totalPrice)

  // Generate path for cumulative savings
  const generatePath = (data: YearlyProjection[], getValue: (p: YearlyProjection) => number) => {
    const points = data.map((p, i) => {
      const x = ((i + 1) / 25) * 100
      const y = height - paddingBottom - (getValue(p) / maxValue) * (height - paddingBottom)
      return `${x},${y}`
    })
    return `M0,${height - paddingBottom} L${points.join(' L')}`
  }

  // Generate area path
  const generateAreaPath = (data: YearlyProjection[], getValue: (p: YearlyProjection) => number) => {
    const points = data.map((p, i) => {
      const x = ((i + 1) / 25) * 100
      const y = height - paddingBottom - (getValue(p) / maxValue) * (height - paddingBottom)
      return `${x},${y}`
    })
    return `M0,${height - paddingBottom} L${points.join(' L')} L100,${height - paddingBottom} Z`
  }

  // Investment line Y position
  const investmentY = height - paddingBottom - (totalPrice / maxValue) * (height - paddingBottom)

  const hoveredData = hoveredYear !== null ? projections[hoveredYear - 1] : null

  return (
    <div className="bg-white rounded-lg border p-4">
      <h4 className="font-semibold mb-4">Besparelser over tid</h4>

      {/* Tooltip */}
      {hoveredData && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
          <p className="font-semibold mb-2">År {hoveredData.year}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Produktion:</span>
              <span className="ml-1">{formatNumber(hoveredData.production)} kWh</span>
            </div>
            <div>
              <span className="text-muted-foreground">Årlig besparelse:</span>
              <span className="ml-1 text-green-600">{formatCurrency(hoveredData.savings)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Akkumuleret:</span>
              <span className="ml-1 font-semibold">
                {formatCurrency(hoveredData.cumulativeSavings)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Systemværdi:</span>
              <span className="ml-1">{formatCurrency(hoveredData.systemValue)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - paddingBottom - ratio * (height - paddingBottom)
            return (
              <line
                key={ratio}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="0.3"
              />
            )
          })}

          {/* Cumulative savings area */}
          <path
            d={generateAreaPath(projections, (p) => p.cumulativeSavings)}
            fill="url(#savingsGradient)"
            opacity="0.3"
          />

          {/* Cumulative savings line */}
          <path
            d={generatePath(projections, (p) => p.cumulativeSavings)}
            fill="none"
            stroke="#10b981"
            strokeWidth="0.8"
          />

          {/* Investment line */}
          <line
            x1="0"
            y1={investmentY}
            x2="100"
            y2={investmentY}
            stroke="#7c3aed"
            strokeWidth="0.6"
            strokeDasharray="2,2"
          />

          {/* Break-even marker */}
          {breakEvenYear >= 0 && (
            <>
              <line
                x1={((breakEvenYear + 1) / 25) * 100}
                y1={investmentY}
                x2={((breakEvenYear + 1) / 25) * 100}
                y2={height - paddingBottom}
                stroke="#10b981"
                strokeWidth="0.5"
                strokeDasharray="1,1"
              />
              <circle
                cx={((breakEvenYear + 1) / 25) * 100}
                cy={investmentY}
                r="2"
                fill="#10b981"
              />
            </>
          )}

          {/* Hover areas */}
          {projections.map((_, i) => (
            <rect
              key={i}
              x={(i / 25) * 100}
              y="0"
              width={100 / 25}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoveredYear(i + 1)}
              onMouseLeave={() => setHoveredYear(null)}
              className="cursor-pointer"
            />
          ))}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="savingsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground px-1">
          <span>0</span>
          <span>5</span>
          <span>10</span>
          <span>15</span>
          <span>20</span>
          <span>25 år</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500" />
          <span className="text-muted-foreground">Akkumuleret besparelse</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-purple-600 border-dashed" style={{ borderTopWidth: 2, borderStyle: 'dashed' }} />
          <span className="text-muted-foreground">Investering</span>
        </div>
      </div>

      {/* Break-even info */}
      {breakEvenYear >= 0 && (
        <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm text-green-800">
            <span className="font-semibold">Break-even efter {breakEvenYear + 1} år</span>
            {' — '}
            Herefter er alle besparelser ren gevinst!
          </p>
        </div>
      )}

      {/* Summary table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 font-medium text-muted-foreground">År</th>
              <th className="text-right py-2 font-medium text-muted-foreground">Produktion</th>
              <th className="text-right py-2 font-medium text-muted-foreground">Årlig besp.</th>
              <th className="text-right py-2 font-medium text-muted-foreground">Akkumuleret</th>
            </tr>
          </thead>
          <tbody>
            {[1, 5, 10, 15, 20, 25].map((year) => {
              const data = projections[year - 1]
              const isBreakEven = year === breakEvenYear + 1
              return (
                <tr
                  key={year}
                  className={`border-b ${isBreakEven ? 'bg-green-50' : ''}`}
                >
                  <td className="py-2">
                    År {year}
                    {isBreakEven && (
                      <span className="ml-1 text-green-600 font-medium">(break-even)</span>
                    )}
                  </td>
                  <td className="text-right">{formatNumber(data.production)} kWh</td>
                  <td className="text-right text-green-600">{formatCurrency(data.savings)}</td>
                  <td className="text-right font-medium">
                    {formatCurrency(data.cumulativeSavings)}
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
