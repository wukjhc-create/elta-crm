'use client'

import { useState, useEffect } from 'react'
import {
  FileText,
  Loader2,
  Sparkles,
  Save,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  getSimplePriceSummary,
  savePriceExplanation,
  getPriceExplanation,
} from '@/lib/actions/ai-intelligence'
import type { OfferLineItem } from '@/types/offers.types'

interface PriceExplanationCardProps {
  offerId: string
  lineItems: OfferLineItem[]
  finalAmount: number
}

export function PriceExplanationCard({
  offerId,
  lineItems,
  finalAmount,
}: PriceExplanationCardProps) {
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [savedExplanation, setSavedExplanation] = useState<{
    sections: unknown
    generated_at: string
  } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // Load existing explanation on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await getPriceExplanation(offerId)
        if (data) {
          setSavedExplanation(data)
        }
      } catch {
        // No existing explanation - that's fine
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [offerId])

  const buildInput = () => {
    // Calculate total cost from line items that have cost_price
    const totalCost = lineItems.reduce((sum, li) => {
      if (li.line_type === 'section') return sum
      return sum + (li.cost_price || 0) * li.quantity
    }, 0)

    const marginPercentage = finalAmount > 0
      ? ((finalAmount - totalCost) / finalAmount) * 100
      : 0

    return {
      labor_cost: 0,
      material_cost: totalCost,
      total_price: finalAmount,
      margin_percentage: Math.max(0, marginPercentage),
      components: lineItems
        .filter(li => li.line_type !== 'section')
        .map(li => ({
          name: li.description,
          quantity: li.quantity,
          price: li.total,
        })),
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const input = buildInput()
      const summary = await getSimplePriceSummary(input)
      if (summary) {
        setExplanation(summary)
        setIsExpanded(true)
      } else {
        toast.error('Kunne ikke generere prisforklaring')
      }
    } catch {
      toast.error('Fejl ved generering')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!explanation) return

    setIsSaving(true)
    try {
      const input = buildInput()
      const result = await savePriceExplanation(
        null,
        offerId,
        {
          sections: {
            summary: explanation,
          },
          breakdown: {
            categories: [
              { name: 'Materialer', amount: input.material_cost, percentage: input.total_price > 0 ? (input.material_cost / input.total_price) * 100 : 0 },
            ],
            material_items: lineItems.filter(li => li.line_type !== 'section').length,
          },
        },
        'simple'
      )

      if (result.success) {
        toast.success('Prisforklaring gemt')
        setSavedExplanation({
          sections: { summary: explanation },
          generated_at: new Date().toISOString(),
        })
      } else {
        toast.error(result.error || 'Kunne ikke gemme')
      }
    } catch {
      toast.error('Fejl ved gemning')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Henter prisforklaring...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span className="text-sm font-medium">Prisforklaring</span>
        </div>
        {(explanation || savedExplanation) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {savedExplanation && !explanation && (
        <div>
          {isExpanded && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap mb-3 bg-gray-50 rounded p-3">
              {typeof savedExplanation.sections === 'object' && savedExplanation.sections !== null
                ? (savedExplanation.sections as Record<string, string>).summary || 'Gemt prisforklaring'
                : 'Gemt prisforklaring'}
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-3">
            Genereret {new Date(savedExplanation.generated_at).toLocaleDateString('da-DK')}
          </p>
        </div>
      )}

      {explanation && isExpanded && (
        <div className="text-sm text-gray-700 whitespace-pre-wrap mb-3 bg-violet-50 rounded p-3 border border-violet-100">
          {explanation}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={isGenerating || lineItems.length === 0}
        >
          {isGenerating ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          {explanation ? 'Generer ny' : 'Generer'}
        </Button>
        {explanation && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Save className="w-3 h-3 mr-1" />
            )}
            Gem
          </Button>
        )}
      </div>
    </div>
  )
}
