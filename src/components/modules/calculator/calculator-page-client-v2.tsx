'use client'

import { useState, useCallback, useEffect } from 'react'
import { FileText, Printer, Save, FolderOpen, AlertCircle } from 'lucide-react'
import { CalculatorFormV2 } from './calculator-form-v2'
import { ResultsPanel } from './results-panel'
import { SavingsChart } from './savings-chart'
import { SaveTemplateDialog, LoadTemplateDialog } from './template-dialog'
import {
  calculateSolarSystemV2,
  buildCalculatorContext,
  getDefaultInputV2,
  convertLegacyToV2,
  convertV2ToLegacy,
} from '@/lib/utils/solar-calculator'
import { templateToInput } from '@/lib/utils/calculator'
import { getTemplates } from '@/lib/actions/calculator'
import type {
  CalculatorResults,
  TemplateWithCreator,
  CalculatorInput,
} from '@/types/calculator.types'
import type {
  SolarProductsByType,
  SolarAssumptions,
  CalculatorInputV2,
} from '@/types/solar-products.types'

interface CalculatorPageClientV2Props {
  products: SolarProductsByType
  assumptions: SolarAssumptions
}

export function CalculatorPageClientV2({
  products,
  assumptions,
}: CalculatorPageClientV2Props) {
  // Initialize with default input based on available products
  const defaultInput = getDefaultInputV2(products)

  // Build initial context and results
  const initialContext = buildCalculatorContext(products, assumptions, defaultInput)
  const initialResults = initialContext
    ? calculateSolarSystemV2(defaultInput, initialContext)
    : null

  const [results, setResults] = useState<CalculatorResults | null>(initialResults)
  const [currentInput, setCurrentInput] = useState<CalculatorInputV2>(defaultInput)
  const [formKey, setFormKey] = useState(0)
  const [templates, setTemplates] = useState<TemplateWithCreator[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [calculationError, setCalculationError] = useState<string | null>(null)

  // Load templates on mount
  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setTemplateError(null)
      const result = await getTemplates()
      if (result.success && result.data) {
        setTemplates(result.data)
      } else if (!result.success) {
        console.error('Failed to load templates:', result.error)
      }
    } catch (err) {
      console.error('Error loading templates:', err)
      setTemplateError('Kunne ikke hente skabeloner')
    }
  }

  const applyTemplate = (template: TemplateWithCreator) => {
    try {
      // Templates may be in legacy format - convert if needed
      const legacyInput = templateToInput(template) as CalculatorInput
      const v2Input = convertLegacyToV2(legacyInput)

      const context = buildCalculatorContext(products, assumptions, v2Input)
      if (!context) {
        setCalculationError('Kunne ikke finde de valgte produkter i databasen')
        return
      }

      setCurrentInput(v2Input)
      setResults(calculateSolarSystemV2(v2Input, context))
      setActiveTemplateName(template.name)
      setCalculationError(null)
      setFormKey((prev) => prev + 1)
    } catch (err) {
      console.error('Error applying template:', err)
      setCalculationError('Kunne ikke anvende skabelon')
    }
  }

  const handleCalculate = useCallback(
    (newInput: CalculatorInputV2) => {
      const context = buildCalculatorContext(products, assumptions, newInput)

      if (!context) {
        setCalculationError('Kunne ikke finde de valgte produkter')
        return
      }

      setCurrentInput(newInput)
      const newResults = calculateSolarSystemV2(newInput, context)
      setResults(newResults)
      setActiveTemplateName(null)
      setCalculationError(null)
    },
    [products, assumptions]
  )

  const handleCreateOffer = () => {
    if (!results) return

    const params = new URLSearchParams({
      systemSize: results.systemSize.toString(),
      panelCount: currentInput.panelCount.toString(),
      totalPrice: results.totalPrice.toString(),
    })
    window.location.href = `/dashboard/offers?create=true&${params.toString()}`
  }

  const handlePrint = () => {
    window.print()
  }

  // Convert V2 input to legacy format for template saving
  const legacyInputForSave = convertV2ToLegacy(currentInput)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Solcelleberegner</h1>
          <p className="text-gray-600 mt-1">
            Beregn pris, produktion og besparelser for solcelleanlæg
            {activeTemplateName && (
              <span className="ml-2 text-primary font-medium">— {activeTemplateName}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <button
            onClick={() => setShowLoadDialog(true)}
            className="inline-flex items-center px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Indlæs skabelon
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="inline-flex items-center px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            <Save className="w-4 h-4 mr-2" />
            Gem skabelon
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </button>
          <button
            onClick={handleCreateOffer}
            disabled={!results}
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <FileText className="w-4 h-4 mr-2" />
            Opret tilbud
          </button>
        </div>
      </div>

      {/* Error display */}
      {calculationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Beregningsfejl</p>
            <p className="text-red-600 text-sm">{calculationError}</p>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-1 no-print">
          <div className="bg-white rounded-lg border p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Konfiguration</h2>
            <CalculatorFormV2
              key={formKey}
              products={products}
              defaultValues={currentInput}
              onCalculate={handleCalculate}
            />
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="lg:col-span-2 space-y-6">
          {results ? (
            <>
              <ResultsPanel results={results} />
              <SavingsChart
                projections={results.yearlyProjections}
                totalPrice={results.totalPrice}
              />
            </>
          ) : (
            <div className="bg-white rounded-lg border p-6 text-center text-gray-500">
              Vælg produkter for at se beregning
            </div>
          )}
        </div>
      </div>

      {/* Dialogs - use legacy format for backward compatibility */}
      <SaveTemplateDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        config={legacyInputForSave}
        systemSize={results?.systemSize || 0}
        totalPrice={results?.totalPrice || 0}
        onSaved={loadTemplates}
      />

      <LoadTemplateDialog
        isOpen={showLoadDialog}
        onClose={() => setShowLoadDialog(false)}
        templates={templates}
        onSelect={applyTemplate}
        onRefresh={loadTemplates}
      />

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
