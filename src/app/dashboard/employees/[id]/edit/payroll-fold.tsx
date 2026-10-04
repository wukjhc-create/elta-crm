'use client'

/**
 * PV16 (shoulder-surfing): løn/satser på Rediger-siden er sammenfoldet som standard. Indholdet monteres (og henter
 * dermed sine data) først når det foldes ud, og foldes sammen igen når vinduet/fanen skjules.
 */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useCostReveal } from '@/components/shared/sensitive-amounts'

export function PayrollFold({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  const [open, toggle] = useCostReveal()
  // Kode-review: foldningen ved skjult fane afmonterede indholdet og smed ulagrede løn-rettelser væk. Efter første
  // udfoldning forbliver det monteret (data er allerede hentet) og skjules blot visuelt, når det foldes sammen.
  const [everOpened, setEverOpened] = useState(false)
  useEffect(() => { if (open) setEverOpened(true) }, [open])
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid={testId}
        className="w-full flex items-center justify-between bg-white rounded-lg border px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Lock className="w-4 h-4 text-gray-400" />
          {label}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          {open ? 'Skjul' : 'Vis'}
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {(open || everOpened) && <div hidden={!open}>{children}</div>}
    </div>
  )
}
