'use client'

/**
 * PRICE EXPLANATION CARD
 *
 * Customer-facing price breakdown component that explains:
 * - What's included in the price
 * - Labor vs material split
 * - Quality guarantees
 * - Payment terms
 *
 * Part of Phase D AI Intelligence layer.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generatePriceExplanationAction, getBulletPriceSummary } from '@/lib/actions/ai-intelligence'
import type { PriceExplanationInput, PriceExplanationResult } from '@/types/ai-intelligence.types'
import { formatCurrency } from '@/lib/utils/format'
import {
  DollarSign,
  CheckCircle,
  XCircle,
  Shield,
  FileText,
  Wrench,
  Package,
  Loader2,
  RefreshCw,
  ChevronRight,
  PieChart,
  ListChecks,
  Award,
} from 'lucide-react'

interface PriceExplanationCardProps {
  input: PriceExplanationInput
  autoGenerate?: boolean
  showTabs?: boolean
  showBulletSummary?: boolean
  className?: string
}


function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function BreakdownBar({ categories }: { categories: Array<{ name: string; amount: number; percentage: number }> }) {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500']

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="h-6 rounded-full overflow-hidden flex">
        {categories.map((cat, idx) => (
          <div
            key={cat.name}
            className={`${colors[idx % colors.length]} h-full transition-all`}
            style={{ width: `${cat.percentage}%` }}
            title={`${cat.name}: ${formatPercent(cat.percentage)}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {categories.map((cat, idx) => (
          <div key={cat.name} className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
            <span className="text-muted-foreground">{cat.name}</span>
            <span className="font-medium">{formatCurrency(cat.amount)}</span>
            <span className="text-muted-foreground">({formatPercent(cat.percentage)})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function IncludedList({ items, type }: { items: string[]; type: 'included' | 'excluded' }) {
  const Icon = type === 'included' ? CheckCircle : XCircle
  const color = type === 'included' ? 'text-green-600' : 'text-red-500'

  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm">
          <Icon className={`h-4 w-4 mt-0.5 ${color} flex-shrink-0`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function GuaranteesList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm">
          <Shield className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function PriceExplanationCard({
  input,
  autoGenerate = false,
  showTabs = true,
  showBulletSummary = false,
  className,
}: PriceExplanationCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PriceExplanationResult | null>(null)
  const [bullets, setBullets] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [explanationResponse, bulletsResponse] = await Promise.all([
        generatePriceExplanationAction(input),
        showBulletSummary ? getBulletPriceSummary(input) : Promise.resolve([]),
      ])

      if (explanationResponse.success) {
        setResult(explanationResponse.data)
        setBullets(bulletsResponse)
      } else {
        setError(explanationResponse.error)
      }
    } catch (err) {
      setError('Der opstod en fejl ved generering af prisforklaring')
      console.error('Price explanation error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (autoGenerate) {
      generate()
    }
  }, [autoGenerate]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Prisforklaring
            </CardTitle>
            <CardDescription>
              Hvad er inkluderet i prisen
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && !result && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Genererer prisforklaring...
          </div>
        )}

        {/* No result yet */}
        {!isLoading && !result && !error && (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">Generer en kundevenlig prisforklaring</p>
            <Button onClick={generate}>
              <FileText className="h-4 w-4 mr-2" />
              Generer forklaring
            </Button>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Price header */}
            <div className="text-center py-4 bg-muted/30 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{formatCurrency(input.total_price)}</div>
              <div className="text-sm text-muted-foreground">inkl. moms</div>
            </div>

            {/* Bullet summary */}
            {showBulletSummary && bullets.length > 0 && (
              <div className="space-y-2 p-3 bg-green-50 rounded-lg">
                {bullets.map((bullet, idx) => (
                  <div key={idx} className="text-sm text-green-800">{bullet}</div>
                ))}
              </div>
            )}

            {/* Summary */}
            {result.sections.summary && (
              <p className="text-sm text-muted-foreground">{result.sections.summary}</p>
            )}

            {showTabs ? (
              <Tabs defaultValue="breakdown" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="breakdown" className="text-xs">
                    <PieChart className="h-3 w-3 mr-1" />
                    Fordeling
                  </TabsTrigger>
                  <TabsTrigger value="included" className="text-xs">
                    <ListChecks className="h-3 w-3 mr-1" />
                    Inkluderet
                  </TabsTrigger>
                  <TabsTrigger value="excluded" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Ekskluderet
                  </TabsTrigger>
                  <TabsTrigger value="guarantee" className="text-xs">
                    <Award className="h-3 w-3 mr-1" />
                    Garanti
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="breakdown" className="space-y-4 mt-4">
                  {result.breakdown.categories && (
                    <BreakdownBar categories={result.breakdown.categories} />
                  )}

                  {/* Labor explanation */}
                  {result.sections.labor_explanation && (
                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <Wrench className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-sm text-blue-800">Arbejdsløn</div>
                        <p className="text-sm text-blue-700">{result.sections.labor_explanation}</p>
                      </div>
                    </div>
                  )}

                  {/* Material explanation */}
                  {result.sections.material_explanation && (
                    <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <Package className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-sm text-green-800">Materialer</div>
                        <p className="text-sm text-green-700">{result.sections.material_explanation}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="included" className="mt-4">
                  {result.sections.whats_included && result.sections.whats_included.length > 0 ? (
                    <IncludedList items={result.sections.whats_included} type="included" />
                  ) : (
                    <p className="text-muted-foreground text-sm">Ingen detaljer tilgængelige</p>
                  )}
                </TabsContent>

                <TabsContent value="excluded" className="mt-4">
                  {result.sections.whats_not_included && result.sections.whats_not_included.length > 0 ? (
                    <IncludedList items={result.sections.whats_not_included} type="excluded" />
                  ) : (
                    <p className="text-muted-foreground text-sm">Ingen udeladelser specificeret</p>
                  )}
                </TabsContent>

                <TabsContent value="guarantee" className="mt-4 space-y-4">
                  {result.sections.quality_guarantees && result.sections.quality_guarantees.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Kvalitetsgarantier</h4>
                      <GuaranteesList items={result.sections.quality_guarantees} />
                    </div>
                  )}

                  {result.sections.payment_terms && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <h4 className="font-medium text-sm mb-1">Betalingsbetingelser</h4>
                      <p className="text-sm text-muted-foreground">{result.sections.payment_terms}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4">
                {/* Simple view without tabs */}
                {result.breakdown.categories && (
                  <BreakdownBar categories={result.breakdown.categories} />
                )}

                {result.sections.whats_included && result.sections.whats_included.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Inkluderet i prisen</h4>
                    <IncludedList items={result.sections.whats_included.slice(0, 5)} type="included" />
                    {result.sections.whats_included.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        +{result.sections.whats_included.length - 5} mere...
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Value propositions */}
            {result.sections.value_propositions && result.sections.value_propositions.length > 0 && (
              <div className="pt-4 border-t">
                <div className="flex flex-wrap gap-2">
                  {result.sections.value_propositions.map((prop, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {prop}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Compact price summary for offer cards
 */
export function PriceSummaryCompact({ input }: { input: PriceExplanationInput }) {
  const laborPercent = Math.round((input.labor_cost / input.total_price) * 100)
  const materialPercent = 100 - laborPercent

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Materialer</span>
        <span>{formatCurrency(input.material_cost)} ({materialPercent}%)</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Arbejdsløn</span>
        <span>{formatCurrency(input.labor_cost)} ({laborPercent}%)</span>
      </div>
      <div className="flex justify-between font-medium pt-2 border-t">
        <span>I alt</span>
        <span className="text-green-600">{formatCurrency(input.total_price)}</span>
      </div>
    </div>
  )
}
