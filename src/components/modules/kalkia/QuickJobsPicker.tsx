'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  Home,
  Building2,
  Hammer,
  ChefHat,
  Car,
  Warehouse,
  LayoutGrid,
  Wrench,
  Search,
  Clock,
  Star,
  ChevronRight,
  Bath,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getQuickJobs, incrementQuickJobUsage } from '@/lib/actions/quick-jobs'
import { getCalcComponentForCalculation } from '@/lib/actions/components'
import { v4 as uuidv4 } from 'uuid'
import type { QuickJob, QuickJobCategory, QUICK_JOB_CATEGORIES } from '@/types/quick-jobs.types'
import { formatTimeMinutes } from '@/lib/utils/format'
import type { CalculationItem } from './CalculationPreview'

interface QuickJobsPickerProps {
  onAddItems: (items: CalculationItem[]) => void
  onClose?: () => void
  className?: string
}

// Icon mapping
const categoryIcons: Record<string, React.ElementType> = {
  residential: Home,
  renovation: Hammer,
  'kitchen-bath': ChefHat,
  outdoor: Sun,
  panel: LayoutGrid,
  service: Wrench,
  general: Zap,
}

const jobIcons: Record<string, React.ElementType> = {
  Home: Home,
  Building2: Building2,
  Hammer: Hammer,
  ChefHat: ChefHat,
  Bath: Bath,
  Car: Car,
  Warehouse: Warehouse,
  LayoutGrid: LayoutGrid,
  Wrench: Wrench,
  Search: Search,
  Zap: Zap,
  Sun: Sun,
}

export function QuickJobsPicker({
  onAddItems,
  onClose,
  className = '',
}: QuickJobsPickerProps) {
  const [jobs, setJobs] = useState<QuickJob[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingJob, setLoadingJob] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    const loadJobs = async () => {
      setLoading(true)
      const result = await getQuickJobs()
      if (result.success && result.data) {
        setJobs(result.data)
      }
      setLoading(false)
    }
    loadJobs()
  }, [])

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = !search ||
      job.name.toLowerCase().includes(search.toLowerCase()) ||
      job.description?.toLowerCase().includes(search.toLowerCase())

    const matchesCategory = !selectedCategory || job.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  // Get featured jobs
  const featuredJobs = jobs.filter((j) => j.is_featured)

  // Get unique categories
  const categories = [...new Set(jobs.map((j) => j.category))]

  // Handle selecting a quick job
  const handleSelectJob = useCallback(async (job: QuickJob) => {
    setLoadingJob(job.id)

    try {
      const calculationItems: CalculationItem[] = []

      // Process each component in the job
      for (const comp of job.components) {
        const compResult = await getCalcComponentForCalculation(undefined, comp.component_code)

        if (compResult.success && compResult.data) {
          const component = compResult.data

          // Find variant
          const activeVariants = component.variants?.filter((v) => v.is_active !== false) || []
          const variant = comp.variant_code
            ? activeVariants.find((v) => v.code === comp.variant_code)
            : activeVariants.find((v) => v.is_default) || activeVariants[0]

          const timeMultiplier = variant?.time_multiplier || 1
          const extraMinutes = variant?.extra_minutes || 0
          const complexityFactor = component.complexity_factor || 1

          let calculatedTime = component.base_time_minutes
          calculatedTime = Math.round(calculatedTime * timeMultiplier) + extraMinutes
          calculatedTime = Math.round(calculatedTime * complexityFactor)

          const materials = component.materials?.map((m) => ({
            name: m.material_name,
            quantity: m.quantity,
            unit: m.unit,
            costPrice: m.cost_price ?? 0,
            salePrice: m.sale_price ?? 0,
          })) || []

          calculationItems.push({
            id: uuidv4(),
            componentId: component.id,
            componentName: component.name,
            componentCode: component.code,
            variantId: variant?.id || null,
            variantName: variant?.name,
            quantity: comp.quantity,
            baseTimeMinutes: component.base_time_minutes,
            variantTimeMultiplier: timeMultiplier,
            variantExtraMinutes: extraMinutes,
            complexityFactor,
            calculatedTimeMinutes: calculatedTime,
            costPrice: component.default_cost_price || 0,
            salePrice: component.default_sale_price || 0,
            materials,
          })
        }
      }

      if (calculationItems.length > 0) {
        onAddItems(calculationItems)
        // Increment usage counter
        incrementQuickJobUsage(job.id)
      }

      onClose?.()
    } catch (err) {
      console.error('Error loading quick job:', err)
    }

    setLoadingJob(null)
  }, [onAddItems, onClose])

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      residential: 'Bolig',
      renovation: 'Renovering',
      'kitchen-bath': 'Køkken & Bad',
      outdoor: 'Udendørs',
      panel: 'Tavle',
      service: 'Service',
      general: 'Generelt',
    }
    return labels[cat] || cat
  }

  if (loading) {
    return (
      <div className={`p-8 text-center text-gray-500 ${className}`}>
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
        Henter hurtige jobs...
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header with search */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold">Hurtige Jobs</h3>
          <Badge variant="secondary">{jobs.length} jobs</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg i jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            className="text-xs"
          >
            Alle
          </Button>
          {categories.map((cat) => {
            const Icon = categoryIcons[cat] || Zap
            return (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                className="text-xs"
              >
                <Icon className="w-3 h-3 mr-1" />
                {getCategoryLabel(cat)}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Featured section (only if no search/filter) */}
      {!search && !selectedCategory && featuredJobs.length > 0 && (
        <div className="p-4 border-b bg-yellow-50">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-medium text-yellow-800">Populære jobs</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {featuredJobs.slice(0, 4).map((job) => {
              const Icon = jobIcons[job.icon] || Zap
              return (
                <button
                  key={job.id}
                  onClick={() => handleSelectJob(job)}
                  disabled={loadingJob === job.id}
                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-yellow-200 hover:border-yellow-400 hover:bg-yellow-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded bg-yellow-100 text-yellow-600 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{job.name}</p>
                    <p className="text-xs text-gray-500">{formatTimeMinutes(job.estimated_time_minutes)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto">
        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Ingen jobs fundet</p>
            <p className="text-sm mt-2">Prøv at ændre søgning eller filter</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredJobs.map((job) => {
              const Icon = jobIcons[job.icon] || Zap
              return (
                <button
                  key={job.id}
                  onClick={() => handleSelectJob(job)}
                  disabled={loadingJob === job.id}
                  className="w-full p-3 hover:bg-gray-50 transition-colors flex items-center gap-3 text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    {loadingJob === job.id ? (
                      <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{job.name}</span>
                      {job.is_featured && (
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeMinutes(job.estimated_time_minutes)}
                      </span>
                      <span>{job.components.length} komponenter</span>
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(job.category)}
                      </Badge>
                    </div>
                    {job.description && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {job.description}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
