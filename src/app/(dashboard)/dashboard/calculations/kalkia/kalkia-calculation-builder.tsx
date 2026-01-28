'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PackageBuilder } from '@/components/modules/kalkia'
import type { CalculationItem } from '@/components/modules/kalkia'
import type { CalculationResult } from '@/types/kalkia.types'

export default function KalkiaCalculationBuilder() {
  const router = useRouter()

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
    }
  }) => {
    // For now, just log and redirect
    // In a full implementation, this would save to kalkia_calculations table
    console.log('Saving calculation:', data)

    // TODO: Implement actual save using createKalkiaCalculation action
    // The form data would need to be constructed from the data object

    // Redirect to calculations list
    router.push('/dashboard/calculations')
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Back navigation */}
      <div className="border-b px-4 py-2 bg-white flex items-center gap-4">
        <Link href="/dashboard/calculations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Tilbage til kalkulationer
          </Button>
        </Link>
        <div className="h-4 w-px bg-gray-300" />
        <span className="text-sm text-gray-600">
          Kalkia Komponentbibliotek
        </span>
      </div>

      {/* Package Builder */}
      <div className="flex-1 overflow-hidden">
        <PackageBuilder onSave={handleSave} />
      </div>
    </div>
  )
}
