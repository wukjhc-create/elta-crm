'use client'

import { useState, useCallback, useEffect } from 'react'
import { FileText, Printer, Save, FolderOpen } from 'lucide-react'
import { CalculatorForm } from './calculator-form'
import { ResultsPanel } from './results-panel'
import { SavingsChart } from './savings-chart'
import { SaveTemplateDialog, LoadTemplateDialog } from './template-dialog'
import { calculateSolarSystem, templateToInput } from '@/lib/utils/calculator'
import { getTemplates } from '@/lib/actions/calculator'
import {
  CALCULATOR_CONSTANTS,
  type CalculatorInput,
  type CalculatorResults,
  type TemplateWithCreator,
} from '@/types/calculator.types'

const defaultInput: CalculatorInput = {
  panelType: 'standard',
  panelCount: 12,
  inverterType: 'string_medium',
  mountingType: 'roof_tile',
  batteryOption: 'none',
  annualConsumption: 4000,
  margin: CALCULATOR_CONSTANTS.defaultMargin,
  discount: 0,
  includeVat: true,
}

export function CalculatorPageClient() {
  const [results, setResults] = useState<CalculatorResults>(() =>
    calculateSolarSystem(defaultInput)
  )
  const [currentInput, setCurrentInput] = useState<CalculatorInput>(defaultInput)
  const [formKey, setFormKey] = useState(0)
  const [templates, setTemplates] = useState<TemplateWithCreator[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)

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
        // Don't show error to user - templates are optional
      }
    } catch (err) {
      console.error('Error loading templates:', err)
      setTemplateError('Kunne ikke hente skabeloner')
    }
  }

  const applyTemplate = (template: TemplateWithCreator) => {
    const input = templateToInput(template)
    setCurrentInput(input)
    setResults(calculateSolarSystem(input))
    setActiveTemplateName(template.name)
    setFormKey((prev) => prev + 1)
  }

  const handleCalculate = useCallback((newInput: CalculatorInput) => {
    setCurrentInput(newInput)
    const newResults = calculateSolarSystem(newInput)
    setResults(newResults)
    setActiveTemplateName(null) // Clear template name when config changes
  }, [])

  const handleCreateOffer = () => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Solcelleberegner</h1>
          <p className="text-gray-600 mt-1">
            Beregn pris, produktion og besparelser for solcelleanlæg
            {activeTemplateName && (
              <span className="ml-2 text-primary font-medium">
                — {activeTemplateName}
              </span>
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
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <FileText className="w-4 h-4 mr-2" />
            Opret tilbud
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-1 no-print">
          <div className="bg-white rounded-lg border p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Konfiguration</h2>
            <CalculatorForm
              key={formKey}
              defaultValues={currentInput}
              onCalculate={handleCalculate}
            />
          </div>
        </div>

        {/* Right Column - Results */}
        <div className="lg:col-span-2 space-y-6">
          <ResultsPanel results={results} />
          <SavingsChart projections={results.yearlyProjections} totalPrice={results.totalPrice} />
        </div>
      </div>

      {/* Dialogs */}
      <SaveTemplateDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        config={currentInput}
        systemSize={results.systemSize}
        totalPrice={results.totalPrice}
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
