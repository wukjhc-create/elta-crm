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
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-2 px-2 font-medium text-gray-500 w-8">#</th>
              <th className="text-left py-2 px-2 font-medium text-gray-500">Beskrivelse</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500 w-16">Antal</th>
              <th className="text-left py-2 px-2 font-medium text-gray-500 w-16">Enhed</th>
              {showCostData && (
                <>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 w-24">Kostpris</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 w-20">Avance</th>
                </>
              )}
              <th className="text-right py-2 px-2 font-medium text-gray-500 w-24">Salgspris</th>
              <th className="text-right py-2 px-2 font-medium text-gray-500 w-28">Total</th>
              {renderActions && <th className="w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const costPrice = item.cost_price || item.supplier_cost_price_at_creation || null
              const marginPct = getLineItemMargin(item)

              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="py-2.5 px-2 text-gray-400">
                    {item.position ?? idx + 1}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-8 h-8 rounded object-contain border bg-white shrink-0"
                        />
                      )}
                      <span className="font-medium text-gray-900">{item.description}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right text-gray-700">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-2 text-gray-500">
                    {item.unit || 'stk'}
                  </td>
                  {showCostData && (
                    <>
                      <td className="py-2.5 px-2 text-right text-gray-500">
                        {costPrice ? formatCurrency(costPrice, currency, 2) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {marginPct != null ? (
                          <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${getDBBadgeClasses(marginPct, thresholds)}`}>
                            {marginPct}%
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 px-2 text-right text-gray-700">
                    {formatCurrency(item.unit_price, currency, 2)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold text-gray-900">
                    {formatCurrency(item.total, currency, 2)}
                  </td>
                  {renderActions && (
                    <td className="py-2.5 px-2 text-right">
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
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-gray-50 border">
            <span className="text-gray-600 font-medium">Samlet dækningsbidrag:</span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">
                Kostpris: {formatCurrency(db.totalCost, currency, 2)}
              </span>
              <span className={`font-bold text-base ${getDBAmountColor(db.dbPercentage, thresholds)}`}>
                {formatCurrency(db.dbAmount, currency, 2)}
              </span>
              <span className={`inline-flex text-sm font-bold px-2.5 py-1 rounded-full ${getDBBadgeClasses(db.dbPercentage, thresholds)}`}>
                {db.dbPercentage}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
