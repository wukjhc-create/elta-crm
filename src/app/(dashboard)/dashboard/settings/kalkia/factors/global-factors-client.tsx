'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Sliders,
  Clock,
  DollarSign,
  Percent,
  Trash2,
  Users,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { KalkiaGlobalFactor, KalkiaFactorCategory } from '@/types/kalkia.types'
import { KALKIA_FACTOR_CATEGORY_LABELS, KALKIA_VALUE_TYPE_LABELS } from '@/types/kalkia.types'

interface GlobalFactorsClientProps {
  factors: KalkiaGlobalFactor[]
}

const categoryIcons: Record<KalkiaFactorCategory, React.ElementType> = {
  time: Clock,
  cost: DollarSign,
  pricing: Percent,
  waste: Trash2,
  labor: Users,
}

const categoryColors: Record<KalkiaFactorCategory, string> = {
  time: 'bg-blue-100 text-blue-600',
  cost: 'bg-green-100 text-green-600',
  pricing: 'bg-purple-100 text-purple-600',
  waste: 'bg-orange-100 text-orange-600',
  labor: 'bg-pink-100 text-pink-600',
}

export default function GlobalFactorsClient({ factors }: GlobalFactorsClientProps) {
  // Group factors by category
  const groupedFactors = factors.reduce(
    (acc, factor) => {
      if (!acc[factor.category]) acc[factor.category] = []
      acc[factor.category].push(factor)
      return acc
    },
    {} as Record<KalkiaFactorCategory, KalkiaGlobalFactor[]>
  )

  const formatValue = (factor: KalkiaGlobalFactor) => {
    switch (factor.value_type) {
      case 'percentage':
        return `${factor.value}%`
      case 'multiplier':
        return `${factor.value}x`
      case 'fixed':
        if (factor.category === 'labor') {
          return new Intl.NumberFormat('da-DK', {
            style: 'currency',
            currency: 'DKK',
            minimumFractionDigits: 0,
          }).format(factor.value)
        }
        return factor.value.toString()
      default:
        return factor.value.toString()
    }
  }

  const formatRange = (factor: KalkiaGlobalFactor) => {
    if (factor.min_value === null && factor.max_value === null) return '-'
    const min = factor.min_value !== null ? factor.min_value : '...'
    const max = factor.max_value !== null ? factor.max_value : '...'
    return `${min} - ${max}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings/kalkia">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tilbage
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <Sliders className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Globale Faktorer</h1>
              <p className="text-gray-600 mt-1">
                Systemdaekkende beregningsfaktorer
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-medium text-purple-900">Om globale faktorer</p>
              <p className="text-sm text-purple-700 mt-1">
                Globale faktorer anvendes i alle kalkulationer og styrer indirekte tid,
                personlig tid, overhead, spild og arbejdslonsfaktorer. AEndringer her
                paavirker alle fremtidige kalkulationer.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Factors by Category */}
      {Object.entries(groupedFactors).map(([category, categoryFactors]) => {
        const Icon = categoryIcons[category as KalkiaFactorCategory]
        const colorClass = categoryColors[category as KalkiaFactorCategory]

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                {KALKIA_FACTOR_CATEGORY_LABELS[category as KalkiaFactorCategory]}
                <Badge variant="secondary">{categoryFactors.length}</Badge>
              </CardTitle>
              <CardDescription>
                {category === 'time' && 'Faktorer der paavirker tidsberegninger'}
                {category === 'cost' && 'Faktorer der paavirker omkostningsberegninger'}
                {category === 'pricing' && 'Faktorer der paavirker prissaetning'}
                {category === 'waste' && 'Faktorer der paavirker spildberegninger'}
                {category === 'labor' && 'Faktorer der paavirker arbejdslonsberegninger'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faktor</TableHead>
                    <TableHead>Noegle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Vaerdi</TableHead>
                    <TableHead className="text-center">Interval</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryFactors.map((factor) => (
                    <TableRow key={factor.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{factor.factor_name}</p>
                          {factor.description && (
                            <p className="text-xs text-gray-500 mt-1">
                              {factor.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {factor.factor_key}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {KALKIA_VALUE_TYPE_LABELS[factor.value_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-bold text-lg">
                          {formatValue(factor)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-gray-500">
                          {formatRange(factor)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={factor.is_active ? 'default' : 'secondary'}>
                          {factor.is_active ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {/* Key Formulas Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Beregningsformler</CardTitle>
          <CardDescription>
            Reference for hvordan faktorer anvendes i kalkulationer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 font-mono text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">// Tidsberegning</p>
              <p>indirektTid = direktTid * indirekte_tid%</p>
              <p>personligTid = direktTid * personlig_tid%</p>
              <p>totalArbejdstid = direktTid + indirektTid + personligTid</p>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">// Omkostningsberegning</p>
              <p>arbejdslon = (totalArbejdstid / 3600) * timesats</p>
              <p>materialespild = materialer * materialespild%</p>
              <p>kostpris = materialer + materialespild + arbejdslon</p>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">// Prissaetning</p>
              <p>overhead = kostpris * overhead%</p>
              <p>salgsgrundlag = kostpris + overhead</p>
              <p>daekningsbidrag = nettopris - kostpris</p>
              <p>DB% = (daekningsbidrag / nettopris) * 100</p>
              <p>DB/time = daekningsbidrag / totalArbejdstimer</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
