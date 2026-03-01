'use client'

import { formatCurrency } from '@/lib/utils/format'
import {
  computeOfferDB,
  getLineItemMargin,
  getDBBadgeClasses,
  getDBAmountColor,
  type LineItemForDB,
  type DBThresholds,
} from '@/lib/logic/pricing'

// =====================================================
// Universal Line Items Table
// Used by: Offer detail, Mail quote editor, Project detail
// =====================================================

export interface LineItemRow extends LineItemForDB {
  id: string
  position?: number
  description: string
  unit?: string
  image_url?: string | null
  line_type?: string | null
}

interface LineItemsTableProps {
  items: LineItemRow[]
  currency?: string
  /** Show cost price + margin columns (hide for customer-facing views) */
  showCostData?: boolean
  /** Show DB summary footer */
  showDBSummary?: boolean
  /** DB thresholds from settings (for correct traffic light colors) */
  thresholds?: DBThresholds
  /** Render custom actions per row (edit/delete buttons) */
  renderActions?: (item: LineItemRow) => React.ReactNode
}

export function LineItemsTable({
  items,
  currency = 'DKK',
  showCostData = true,
  showDBSummary = true,
  thresholds,
  renderActions,
}: LineItemsTableProps) {
  const db = computeOfferDB(items)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 text-sm font-medium text-gray-500">#</th>
              <th className="text-left py-2 text-sm font-medium text-gray-500">Beskrivelse</th>
              <th className="text-right py-2 text-sm font-medium text-gray-500">Antal</th>
              {showCostData && (
                <>
                  <th className="text-right py-2 text-sm font-medium text-gray-500">Indkøb</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-500">Avance</th>
                </>
              )}
              <th className="text-right py-2 text-sm font-medium text-gray-500">Salgspris</th>
              <th className="text-right py-2 text-sm font-medium text-gray-500">Total</th>
              {renderActions && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const costPrice = item.cost_price || item.supplier_cost_price_at_creation || null
              const marginPct = getLineItemMargin(item)

              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 text-sm text-gray-500">
                    {item.position ?? idx + 1}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-8 h-8 rounded object-contain border bg-white shrink-0"
                        />
                      )}
                      <span>{item.description}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    {item.quantity} {item.unit || 'stk'}
                  </td>
                  {showCostData && (
                    <>
                      <td className="py-3 text-right text-xs text-gray-500">
                        {costPrice ? formatCurrency(costPrice, currency, 2) : '-'}
                      </td>
                      <td className="py-3 text-right">
                        {marginPct != null ? (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${getDBBadgeClasses(marginPct, thresholds)}`}>
                            {marginPct}%
                          </span>
                        ) : '-'}
                      </td>
                    </>
                  )}
                  <td className="py-3 text-right">
                    {formatCurrency(item.unit_price, currency, 2)}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {formatCurrency(item.total, currency, 2)}
                  </td>
                  {renderActions && (
                    <td className="py-3 text-right">
                      {renderActions(item)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* DB Summary Footer */}
      {showDBSummary && items.length > 0 && db.hasAnyCost && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between items-center text-sm p-2 rounded bg-gray-50">
            <span className="text-gray-600 font-medium">Samlet dækningsbidrag:</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                Indkøb: {formatCurrency(db.totalCost, currency, 2)}
              </span>
              <span className={`font-bold ${getDBAmountColor(db.dbPercentage, thresholds)}`}>
                {formatCurrency(db.dbAmount, currency, 2)} ({db.dbPercentage}%)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
