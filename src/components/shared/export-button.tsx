'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { generateCsv, downloadCsv, csvDate, csvDateTime, csvCurrency, csvBoolean } from '@/lib/utils/csv-export'
import type {
  ExportCustomer,
  ExportLead,
  ExportOffer,
  ExportProject,
  ExportCalculation,
} from '@/lib/actions/export'
import {
  exportCustomers,
  exportLeads,
  exportOffers,
  exportProjects,
  exportCalculations,
} from '@/lib/actions/export'

// =====================================================
// Column Definitions
// =====================================================

const CUSTOMER_COLUMNS = [
  { header: 'Kundenr.', accessor: (r: ExportCustomer) => r.customer_number || '' },
  { header: 'Firma', accessor: (r: ExportCustomer) => r.company_name },
  { header: 'Kontaktperson', accessor: (r: ExportCustomer) => r.contact_person || '' },
  { header: 'Email', accessor: (r: ExportCustomer) => r.email || '' },
  { header: 'Telefon', accessor: (r: ExportCustomer) => r.phone || '' },
  { header: 'CVR', accessor: (r: ExportCustomer) => r.vat_number || '' },
  { header: 'Adresse', accessor: (r: ExportCustomer) => r.billing_address || '' },
  { header: 'By', accessor: (r: ExportCustomer) => r.billing_city || '' },
  { header: 'Postnr.', accessor: (r: ExportCustomer) => r.billing_zip || '' },
  { header: 'Aktiv', accessor: (r: ExportCustomer) => csvBoolean(r.is_active) },
  { header: 'Noter', accessor: (r: ExportCustomer) => r.notes || '' },
  { header: 'Oprettet', accessor: (r: ExportCustomer) => csvDateTime(r.created_at) },
]

const LEAD_COLUMNS = [
  { header: 'Firma', accessor: (r: ExportLead) => r.company_name || '' },
  { header: 'Kontaktperson', accessor: (r: ExportLead) => r.contact_person || '' },
  { header: 'Email', accessor: (r: ExportLead) => r.email || '' },
  { header: 'Telefon', accessor: (r: ExportLead) => r.phone || '' },
  { header: 'Status', accessor: (r: ExportLead) => r.status },
  { header: 'Kilde', accessor: (r: ExportLead) => r.source || '' },
  { header: 'Værdi (DKK)', accessor: (r: ExportLead) => csvCurrency(r.value) },
  { header: 'Sandsynlighed (%)', accessor: (r: ExportLead) => r.probability != null ? `${r.probability}` : '' },
  { header: 'Beskrivelse', accessor: (r: ExportLead) => r.description || '' },
  { header: 'Tildelt', accessor: (r: ExportLead) => r.assigned_to_name || '' },
  { header: 'Oprettet', accessor: (r: ExportLead) => csvDateTime(r.created_at) },
]

const OFFER_COLUMNS = [
  { header: 'Tilbudsnr.', accessor: (r: ExportOffer) => r.offer_number || '' },
  { header: 'Titel', accessor: (r: ExportOffer) => r.title },
  { header: 'Kunde', accessor: (r: ExportOffer) => r.customer_name || '' },
  { header: 'Kundenr.', accessor: (r: ExportOffer) => r.customer_number || '' },
  { header: 'Status', accessor: (r: ExportOffer) => r.status },
  { header: 'Beløb (DKK)', accessor: (r: ExportOffer) => csvCurrency(r.total_amount) },
  { header: 'Rabat (DKK)', accessor: (r: ExportOffer) => csvCurrency(r.discount_amount) },
  { header: 'Slutbeløb (DKK)', accessor: (r: ExportOffer) => csvCurrency(r.final_amount) },
  { header: 'Gyldig til', accessor: (r: ExportOffer) => csvDate(r.valid_until) },
  { header: 'Noter', accessor: (r: ExportOffer) => r.notes || '' },
  { header: 'Oprettet', accessor: (r: ExportOffer) => csvDateTime(r.created_at) },
]

const PROJECT_COLUMNS = [
  { header: 'Projektnr.', accessor: (r: ExportProject) => r.project_number || '' },
  { header: 'Navn', accessor: (r: ExportProject) => r.name },
  { header: 'Kunde', accessor: (r: ExportProject) => r.customer_name || '' },
  { header: 'Kundenr.', accessor: (r: ExportProject) => r.customer_number || '' },
  { header: 'Status', accessor: (r: ExportProject) => r.status },
  { header: 'Prioritet', accessor: (r: ExportProject) => r.priority || '' },
  { header: 'Startdato', accessor: (r: ExportProject) => csvDate(r.start_date) },
  { header: 'Slutdato', accessor: (r: ExportProject) => csvDate(r.end_date) },
  { header: 'Est. timer', accessor: (r: ExportProject) => r.estimated_hours != null ? `${r.estimated_hours}` : '' },
  { header: 'Faktiske timer', accessor: (r: ExportProject) => r.actual_hours != null ? `${r.actual_hours}` : '' },
  { header: 'Budget (DKK)', accessor: (r: ExportProject) => csvCurrency(r.budget) },
  { header: 'Faktisk kost (DKK)', accessor: (r: ExportProject) => csvCurrency(r.actual_cost) },
  { header: 'Beskrivelse', accessor: (r: ExportProject) => r.description || '' },
  { header: 'Oprettet', accessor: (r: ExportProject) => csvDateTime(r.created_at) },
]

const CALCULATION_COLUMNS = [
  { header: 'Navn', accessor: (r: ExportCalculation) => r.name },
  { header: 'Type', accessor: (r: ExportCalculation) => r.calculation_type || '' },
  { header: 'Kunde', accessor: (r: ExportCalculation) => r.customer_name || '' },
  { header: 'Kundenr.', accessor: (r: ExportCalculation) => r.customer_number || '' },
  { header: 'Skabelon', accessor: (r: ExportCalculation) => csvBoolean(r.is_template) },
  { header: 'Beløb (DKK)', accessor: (r: ExportCalculation) => csvCurrency(r.total_amount) },
  { header: 'Slutbeløb (DKK)', accessor: (r: ExportCalculation) => csvCurrency(r.final_amount) },
  { header: 'Oprettet af', accessor: (r: ExportCalculation) => r.created_by_name || '' },
  { header: 'Oprettet', accessor: (r: ExportCalculation) => csvDateTime(r.created_at) },
]

// =====================================================
// Component
// =====================================================

type ExportType = 'customers' | 'leads' | 'offers' | 'projects' | 'calculations'

interface ExportButtonProps {
  type: ExportType
  filters?: Record<string, string | boolean | undefined>
  className?: string
}

const EXPORT_CONFIG: Record<ExportType, { filename: string; label: string }> = {
  customers: { filename: 'kunder', label: 'Eksportér kunder' },
  leads: { filename: 'leads', label: 'Eksportér leads' },
  offers: { filename: 'tilbud', label: 'Eksportér tilbud' },
  projects: { filename: 'projekter', label: 'Eksportér projekter' },
  calculations: { filename: 'kalkulationer', label: 'Eksportér kalkulationer' },
}

export function ExportButton({ type, filters, className }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const config = EXPORT_CONFIG[type]

  async function handleExport() {
    setLoading(true)
    try {
      const timestamp = new Date().toISOString().slice(0, 10)
      const filename = `${config.filename}_${timestamp}.csv`

      let csv: string | null = null

      switch (type) {
        case 'customers': {
          const result = await exportCustomers(filters as Parameters<typeof exportCustomers>[0])
          if (!result.success || !result.data) throw new Error(result.error)
          csv = generateCsv(result.data, CUSTOMER_COLUMNS)
          break
        }
        case 'leads': {
          const result = await exportLeads(filters as Parameters<typeof exportLeads>[0])
          if (!result.success || !result.data) throw new Error(result.error)
          csv = generateCsv(result.data, LEAD_COLUMNS)
          break
        }
        case 'offers': {
          const result = await exportOffers(filters as Parameters<typeof exportOffers>[0])
          if (!result.success || !result.data) throw new Error(result.error)
          csv = generateCsv(result.data, OFFER_COLUMNS)
          break
        }
        case 'projects': {
          const result = await exportProjects(filters as Parameters<typeof exportProjects>[0])
          if (!result.success || !result.data) throw new Error(result.error)
          csv = generateCsv(result.data, PROJECT_COLUMNS)
          break
        }
        case 'calculations': {
          const result = await exportCalculations(filters as Parameters<typeof exportCalculations>[0])
          if (!result.success || !result.data) throw new Error(result.error)
          csv = generateCsv(result.data, CALCULATION_COLUMNS)
          break
        }
      }

      if (csv) {
        downloadCsv(csv, filename)
      }
    } catch {
      // Silent fail - button shows loading state returns to normal
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      title={config.label}
      aria-label={config.label}
      className={`inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${className || ''}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      CSV
    </button>
  )
}
