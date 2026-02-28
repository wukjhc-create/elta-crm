/**
 * Quote Template Types
 *
 * Types for the "Den Gyldne Knap" — PDF quote generation from Mail module.
 * Two template types: Sales (solcelleanlæg) and Installation (montage).
 */

export type QuoteTemplateType = 'sales' | 'installation'

export interface QuoteLineItem {
  id: string               // crypto.randomUUID() for React keys
  description: string
  quantity: number
  unit: string             // from OFFER_UNITS ('stk','time','kWp' etc.)
  unitPrice: number
  section?: string         // 'Materialer', 'Arbejdsløn' etc.
  costPrice?: number       // Indkøbspris fra leverandør (netto)
  listPrice?: number       // Vejledende pris fra leverandør
  supplierSku?: string     // Varenummer hos leverandør
  supplierName?: string    // Leverandørnavn (f.eks. "AO")
}

export interface QuoteCustomerData {
  companyName: string
  contactPerson: string
  email: string
  phone?: string
  address?: string
  city?: string
  postalCode?: string
}

export interface SalesOfferData {
  systemSizeKwp: number
  estimatedAnnualProductionKwh: number
  panelType?: string
  inverterType?: string
  batteryType?: string
  roofType?: string
  estimatedSavingsPerYear?: number
}

export interface GenerateQuoteInput {
  templateType: QuoteTemplateType
  customer: QuoteCustomerData
  customerId?: string        // linked customer UUID (for portal auto-share)
  title: string
  description?: string
  lineItems: QuoteLineItem[]
  notes?: string
  validityDays: number       // default 30
  taxPercentage: number      // default 25
  discountPercentage: number // default 0
  senderName: string
  solarData?: SalesOfferData // only for 'sales'
}

export interface GenerateQuoteResult {
  success: boolean
  pdfUrl: string
  quoteReference: string
  sentQuoteId?: string
  error?: string
}
