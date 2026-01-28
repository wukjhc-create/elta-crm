'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  FolderTree,
  Wrench,
  Layers,
  Package,
  Settings,
  ChevronDown,
  ChevronRight,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { KalkiaNodeWithRelations, KalkiaNodeType, KalkiaVariantMaterial } from '@/types/kalkia.types'
import { KALKIA_NODE_TYPE_LABELS } from '@/types/kalkia.types'

// Extended variant type with materials from server
interface VariantWithMaterials {
  id: string
  node_id: string
  code: string
  name: string
  description: string | null
  base_time_seconds: number
  time_multiplier: number
  extra_time_seconds: number
  price_multiplier: number
  cost_multiplier: number
  waste_percentage: number
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
  materials?: KalkiaVariantMaterial[]
}

interface ComponentCategory {
  id: string
  name: string
  slug: string
}

interface KalkiaNodeDetailClientProps {
  node: KalkiaNodeWithRelations
  categories: ComponentCategory[]
}

const nodeTypeIcons: Record<KalkiaNodeType, React.ElementType> = {
  group: FolderTree,
  operation: Wrench,
  composite: Layers,
}

const nodeTypeColors: Record<KalkiaNodeType, string> = {
  group: 'bg-blue-100 text-blue-600',
  operation: 'bg-yellow-100 text-yellow-600',
  composite: 'bg-purple-100 text-purple-600',
}

export default function KalkiaNodeDetailClient({ node, categories }: KalkiaNodeDetailClientProps) {
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set())

  const Icon = nodeTypeIcons[node.node_type]
  const colorClass = nodeTypeColors[node.node_type]

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} sek`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}t ${mins}m` : `${hours}t`
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 2,
    }).format(price)
  }

  const toggleVariant = (variantId: string) => {
    const newExpanded = new Set(expandedVariants)
    if (newExpanded.has(variantId)) {
      newExpanded.delete(variantId)
    } else {
      newExpanded.add(variantId)
    }
    setExpandedVariants(newExpanded)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/settings/kalkia/nodes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tilbage
            </Button>
          </Link>
          <div className={`w-12 h-12 rounded-lg ${colorClass} flex items-center justify-center`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">{node.name}</h1>
              <Badge variant="outline">{node.code}</Badge>
            </div>
            <p className="text-gray-600 mt-1">{node.description || 'Ingen beskrivelse'}</p>
          </div>
        </div>
      </div>

      {/* Node Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={colorClass}>{KALKIA_NODE_TYPE_LABELS[node.node_type]}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Basistid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xl font-bold">{formatTime(node.base_time_seconds)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Kostpris</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-bold">{formatPrice(node.default_cost_price)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Salgspris</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-xl font-bold">{formatPrice(node.default_sale_price)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Path & Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detaljer</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Sti</dt>
              <dd className="mt-1 font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                {node.path}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Niveau</dt>
              <dd className="mt-1">{node.depth}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Kategori</dt>
              <dd className="mt-1">
                {node.category ? (
                  <Badge variant="outline">{node.category.name}</Badge>
                ) : (
                  <span className="text-gray-400">Ingen</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Svaerhedsgrad</dt>
              <dd className="mt-1">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-4 h-4 rounded ${
                        level <= node.difficulty_level
                          ? 'bg-yellow-400'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-sm text-gray-500">
                    ({node.difficulty_level}/5)
                  </span>
                </div>
              </dd>
            </div>
            {node.parent && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Overordnet node</dt>
                <dd className="mt-1">
                  <Link
                    href={`/dashboard/settings/kalkia/nodes/${node.parent.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {node.parent.name} ({node.parent.code})
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <Badge variant={node.is_active ? 'default' : 'secondary'}>
                  {node.is_active ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Varianter
            <Badge variant="secondary">{node.variants?.length || 0}</Badge>
          </CardTitle>
          <CardDescription>
            Varianter med tidsmultiplikatorer og materialelister
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!node.variants || node.variants.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Ingen varianter</p>
          ) : (
            <div className="space-y-2">
              {node.variants.map((variant) => (
                <Collapsible
                  key={variant.id}
                  open={expandedVariants.has(variant.id)}
                  onOpenChange={() => toggleVariant(variant.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        {expandedVariants.has(variant.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{variant.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {variant.code}
                            </Badge>
                            {variant.is_default && (
                              <Badge variant="default" className="text-xs">
                                Standard
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span>
                              Tidsmultiplikator: {variant.time_multiplier}x
                            </span>
                            {variant.extra_time_seconds > 0 && (
                              <span>+{formatTime(variant.extra_time_seconds)}</span>
                            )}
                            <span>
                              Prismultiplikator: {variant.price_multiplier}x
                            </span>
                            {variant.waste_percentage > 0 && (
                              <span>Spild: {variant.waste_percentage}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 ml-7 p-4 border rounded-lg">
                      <h4 className="font-medium text-sm text-gray-700 mb-2 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Materialer
                      </h4>
                      {(variant as VariantWithMaterials).materials && (variant as VariantWithMaterials).materials!.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Materiale</TableHead>
                              <TableHead className="text-right">Antal</TableHead>
                              <TableHead>Enhed</TableHead>
                              <TableHead className="text-right">Kostpris</TableHead>
                              <TableHead className="text-right">Salgspris</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(variant as VariantWithMaterials).materials!.map((material) => (
                              <TableRow key={material.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {material.material_name}
                                    {material.is_optional && (
                                      <Badge variant="outline" className="text-xs">
                                        Valgfrit
                                      </Badge>
                                    )}
                                  </div>
                                  {material.product && (
                                    <span className="text-xs text-gray-500">
                                      {material.product.sku}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {material.quantity}
                                </TableCell>
                                <TableCell>{material.unit}</TableCell>
                                <TableCell className="text-right">
                                  {material.cost_price
                                    ? formatPrice(material.cost_price)
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {material.sale_price
                                    ? formatPrice(material.sale_price)
                                    : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-gray-500 text-sm">
                          Ingen materialer defineret
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules */}
      {node.rules && node.rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Regler</CardTitle>
            <CardDescription>
              Betingede justeringer baseret pa forhold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Betingelse</TableHead>
                  <TableHead className="text-right">Tidsmultiplikator</TableHead>
                  <TableHead className="text-right">Ekstra tid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {node.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.rule_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.rule_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {JSON.stringify(rule.condition)}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.time_multiplier}x
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.extra_time_seconds > 0
                        ? formatTime(rule.extra_time_seconds)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI Tags */}
      {node.ai_tags && node.ai_tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">AI Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {node.ai_tags.map((tag, index) => (
                <Badge key={index} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {node.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Noter</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 whitespace-pre-wrap">{node.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
