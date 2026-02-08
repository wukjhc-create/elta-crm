'use client'

import { useState } from 'react'
import {
  MessageSquare,
  Star,
  Clock,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { recordCalculationFeedback } from '@/lib/actions/auto-project'

interface CalculationFeedbackProps {
  projectId: string
  offerId?: string | null
  estimatedHours: number | null
  actualHours: number
  budget: number | null
  actualCost: number
}

export function CalculationFeedback({
  projectId,
  offerId,
  estimatedHours,
  actualHours,
  budget,
  actualCost,
}: CalculationFeedbackProps) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [actualMaterialCost, setActualMaterialCost] = useState<string>(
    actualCost > 0 ? actualCost.toString() : ''
  )
  const [finalActualHours, setFinalActualHours] = useState<string>(
    actualHours > 0 ? actualHours.toString() : ''
  )
  const [offerAccepted, setOfferAccepted] = useState<boolean | null>(null)
  const [projectProfitable, setProjectProfitable] = useState<boolean | null>(null)
  const [satisfaction, setSatisfaction] = useState<number>(0)
  const [lessonsLearned, setLessonsLearned] = useState('')
  const [suggestions, setSuggestions] = useState('')

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handleSubmit = async () => {
    const hours = parseFloat(finalActualHours)
    const materialCost = parseFloat(actualMaterialCost)

    if (isNaN(hours) || hours <= 0) {
      toast.error('Angiv faktiske timer')
      return
    }

    setSaving(true)
    try {
      const hoursVariance = estimatedHours && estimatedHours > 0
        ? ((hours - estimatedHours) / estimatedHours) * 100
        : undefined

      const materialVariance = budget && budget > 0 && !isNaN(materialCost)
        ? ((materialCost - budget) / budget) * 100
        : undefined

      const adjustmentSuggestions = suggestions.trim()
        ? suggestions.split('\n').filter(s => s.trim())
        : []

      const result = await recordCalculationFeedback(null, {
        project_id: projectId,
        offer_id: offerId || undefined,
        estimated_hours: estimatedHours || 0,
        actual_hours: hours,
        hours_variance_percentage: hoursVariance ? Math.round(hoursVariance * 100) / 100 : undefined,
        estimated_material_cost: budget || 0,
        actual_material_cost: !isNaN(materialCost) ? materialCost : undefined,
        material_variance_percentage: materialVariance ? Math.round(materialVariance * 100) / 100 : undefined,
        offer_accepted: offerAccepted ?? undefined,
        project_profitable: projectProfitable ?? undefined,
        customer_satisfaction: satisfaction > 0 ? satisfaction : undefined,
        lessons_learned: lessonsLearned.trim() || undefined,
        adjustment_suggestions: adjustmentSuggestions,
      })

      if (result.success) {
        toast.success('Feedback registreret')
        setSaved(true)
      } else {
        toast.error(result.error || 'Kunne ikke gemme feedback')
      }
    } catch {
      toast.error('Der opstod en fejl')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="bg-white border rounded-lg p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="font-semibold text-lg">Feedback registreret</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Tak! Dine data bruges til at forbedre kalkulationsnøjagtigheden.
        </p>
      </div>
    )
  }

  if (!showForm) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold">Projekt-feedback</h3>
              <p className="text-sm text-muted-foreground">
                Registrer faktiske data for at forbedre fremtidige kalkulationer
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowForm(true)}>
            Giv feedback
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-lg p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-100 rounded-lg">
          <MessageSquare className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="font-semibold">Projekt-feedback</h3>
          <p className="text-sm text-muted-foreground">
            Sammenlign estimat med faktiske tal
          </p>
        </div>
      </div>

      {/* Hours comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Clock className="w-4 h-4" />
            Estimerede timer
          </label>
          <div className="px-3 py-2 bg-gray-50 rounded-md border text-gray-600">
            {estimatedHours ? `${estimatedHours}t` : 'Ikke angivet'}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Clock className="w-4 h-4" />
            Faktiske timer
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={finalActualHours}
            onChange={(e) => setFinalActualHours(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            placeholder="F.eks. 24.5"
          />
        </div>
      </div>

      {/* Budget comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <DollarSign className="w-4 h-4" />
            Estimeret materialekostnad
          </label>
          <div className="px-3 py-2 bg-gray-50 rounded-md border text-gray-600">
            {budget ? formatPrice(budget) : 'Ikke angivet'}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <DollarSign className="w-4 h-4" />
            Faktisk materialekostnad
          </label>
          <input
            type="number"
            step="100"
            min="0"
            value={actualMaterialCost}
            onChange={(e) => setActualMaterialCost(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            placeholder="F.eks. 15000"
          />
        </div>
      </div>

      {/* Outcome */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Blev tilbuddet accepteret?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOfferAccepted(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                offerAccepted === true
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
              Ja
            </button>
            <button
              type="button"
              onClick={() => setOfferAccepted(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                offerAccepted === false
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
              Nej
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Var projektet profitabelt?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProjectProfitable(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                projectProfitable === true
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
              Ja
            </button>
            <button
              type="button"
              onClick={() => setProjectProfitable(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md border transition-colors ${
                projectProfitable === false
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
              Nej
            </button>
          </div>
        </div>
      </div>

      {/* Customer satisfaction */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Kundetilfredshed
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setSatisfaction(star)}
              className="p-1 transition-colors"
            >
              <Star
                className={`w-6 h-6 ${
                  star <= satisfaction
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
          {satisfaction > 0 && (
            <span className="text-sm text-gray-500 ml-2 self-center">
              {satisfaction}/5
            </span>
          )}
        </div>
      </div>

      {/* Lessons learned */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          Erfaringer (lessons learned)
        </label>
        <textarea
          value={lessonsLearned}
          onChange={(e) => setLessonsLearned(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          placeholder="Hvad gik godt? Hvad kunne forbedres?"
        />
      </div>

      {/* Adjustment suggestions */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          Forslag til justeringer (en per linje)
        </label>
        <textarea
          value={suggestions}
          onChange={(e) => setSuggestions(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          placeholder="F.eks. 'Tidsnorm for kabelinstallation bør øges med 15%'"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={() => setShowForm(false)}>
          Annuller
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Gem feedback
        </Button>
      </div>
    </div>
  )
}
