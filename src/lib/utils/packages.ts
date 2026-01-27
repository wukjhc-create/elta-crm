import type { PackageItem, PackageFinancialSummary } from '@/types/packages.types'

// Calculate financial summary from package items
export function calculateFinancialSummary(items: PackageItem[]): PackageFinancialSummary {
  let componentsCost = 0, componentsSale = 0
  let productsCost = 0, productsSale = 0
  let manualCost = 0, manualSale = 0
  let laborCost = 0, laborSale = 0
  let totalTimeMinutes = 0

  for (const item of items) {
    switch (item.item_type) {
      case 'component':
        componentsCost += item.total_cost
        componentsSale += item.total_sale
        break
      case 'product':
        productsCost += item.total_cost
        productsSale += item.total_sale
        break
      case 'time':
        laborCost += item.total_cost
        laborSale += item.total_sale
        break
      default:
        manualCost += item.total_cost
        manualSale += item.total_sale
    }
    totalTimeMinutes += item.total_time
  }

  const totalCost = componentsCost + productsCost + manualCost + laborCost
  const totalSale = componentsSale + productsSale + manualSale + laborSale
  const dbAmount = totalSale - totalCost
  const dbPercentage = totalSale > 0 ? (dbAmount / totalSale) * 100 : 0

  // Format time
  const hours = Math.floor(totalTimeMinutes / 60)
  const mins = totalTimeMinutes % 60
  const totalTimeFormatted = hours > 0
    ? `${hours}t ${mins}m`
    : `${mins}m`

  return {
    totalCost,
    totalSale,
    dbAmount,
    dbPercentage,
    totalTimeMinutes,
    totalTimeFormatted,
    componentsCost,
    componentsSale,
    productsCost,
    productsSale,
    manualCost,
    manualSale,
    laborCost,
    laborSale,
  }
}
