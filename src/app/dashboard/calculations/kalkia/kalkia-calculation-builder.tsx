'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { PackageBuilder } from '@/components/modules/kalkia'
import type { CalculationItem } from '@/components/modules/kalkia'
import type { CalculationResult } from '@/types/kalkia.types'
import { savePackageBuilderCalculation, cloneCalculationAsTemplate } from '@/lib/actions/kalkia-calculations'

export default function KalkiaCalculationBuilder() {
  const router = useRouter()
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (data: {
    name: string
    description: string
    items: CalculationItem[]
    result: CalculationResult | null
    buildingProfileId: string | null
    settings: {
      hourlyRate: number
      marginPercentage: number
      discountPercentage: number
      laborType: string
      timeAdjustment: string
    }
  }) => {
    setIsSaving(true)
    try {
      const result = await savePackageBuilderCalculation({
        name: data.name,
        description: data.description,
        items: data.items,
        result: data.result,
        buildingProfileId: data.buildingProfileId,
        settings: data.settings,
        isTemplate: false,
      })

      if (result.success) {
        toast.success('Kalkulation gemt', `"${data.name}" er blevet gemt.`)
        router.push('/dashboard/calculations')
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke gemme kalkulationen.')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Fejl', 'Der opstod en uventet fejl.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClone = async (data: {
    name: string
    description: string
    items: CalculationItem[]
    settings: {
      hourlyRate: number
      marginPercentage: number
      discountPercentage: number
      laborType: string
      timeAdjustment: string
    }
  }) => {
    setIsSaving(true)
    try {
      const result = await cloneCalculationAsTemplate({
        name: data.name,
        description: data.description,
        items: data.items,
        settings: data.settings,
        isTemplate: true,
      })

      if (result.success) {
        toast.success('Skabelon oprettet', `"${data.name}" er blevet gemt som skabelon.`)
      } else {
        toast.error('Fejl', result.error || 'Kunne ikke oprette skabelon.')
      }
    } catch (error) {
      console.error('Clone error:', error)
      toast.error('Fejl', 'Der opstod en uventet fejl.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Back navigation */}
      <div className="border-b px-4 py-2 bg-white flex items-center gap-4">
        <Link href="/dashboard/calculations">
          <Button variant="ghost" size="sm" disabled={isSaving}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Tilbage til kalkulationer
          </Button>
        </Link>
        <div className="h-4 w-px bg-gray-300" />
        <span className="text-sm text-gray-600">
          Kalkia Komponentbibliotek
        </span>
        {isSaving && (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Gemmer...</span>
          </div>
        )}
      </div>

      {/* Package Builder */}
      <div className="flex-1 overflow-hidden">
        <PackageBuilder onSave={handleSave} onClone={handleClone} />
      </div>
    </div>
  )
}
