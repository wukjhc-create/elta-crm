'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search,
  Network,
  Clock,
  ChevronRight,
  Filter,
  FolderTree,
  Wrench,
  Layers,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { KalkiaNodeSummary, KalkiaNodeType } from '@/types/kalkia.types'
import { KALKIA_NODE_TYPE_LABELS } from '@/types/kalkia.types'
import { formatTimeSeconds, formatCurrency } from '@/lib/utils/format'

interface ComponentCategory {
  id: string
  name: string
  slug: string
}

interface KalkiaNodesClientProps {
  nodes: KalkiaNodeSummary[]
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

export default function KalkiaNodesClient({ nodes, categories }: KalkiaNodesClientProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [depthFilter, setDepthFilter] = useState<string>('all')

  const filteredNodes = nodes.filter((node) => {
    const matchesSearch =
      !search ||
      node.name.toLowerCase().includes(search.toLowerCase()) ||
      node.code.toLowerCase().includes(search.toLowerCase()) ||
      (node.description && node.description.toLowerCase().includes(search.toLowerCase()))

    const matchesCategory =
      categoryFilter === 'all' || node.category_slug === categoryFilter

    const matchesType = typeFilter === 'all' || node.node_type === typeFilter

    const matchesDepth =
      depthFilter === 'all' || node.depth === parseInt(depthFilter)

    return matchesSearch && matchesCategory && matchesType && matchesDepth
  })

  // Group by path prefix (root nodes)
  const groupedNodes = filteredNodes.reduce(
    (acc, node) => {
      const rootPath = node.path.split('.')[0]
      if (!acc[rootPath]) acc[rootPath] = []
      acc[rootPath].push(node)
      return acc
    },
    {} as Record<string, KalkiaNodeSummary[]>
  )

  // Get unique depths
  const depths = [...new Set(nodes.map((n) => n.depth))].sort()

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
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kalkia Komponenttrae</h1>
            <p className="text-gray-600 mt-1">
              Hierarkisk visning af alle noder, varianter og materialer
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Sog efter noder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typer</SelectItem>
            <SelectItem value="group">Gruppe</SelectItem>
            <SelectItem value="operation">Operation</SelectItem>
            <SelectItem value="composite">Sammensat</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kategorier</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={depthFilter} onValueChange={setDepthFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Niveau" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle niveauer</SelectItem>
            {depths.map((depth) => (
              <SelectItem key={depth} value={depth.toString()}>
                Niveau {depth}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <Badge variant="secondary">{filteredNodes.length} noder</Badge>
        <Badge variant="outline">
          {filteredNodes.filter((n) => n.node_type === 'group').length} grupper
        </Badge>
        <Badge variant="outline">
          {filteredNodes.filter((n) => n.node_type === 'operation').length} operationer
        </Badge>
        <Badge variant="outline">
          {filteredNodes.filter((n) => n.node_type === 'composite').length} sammensatte
        </Badge>
      </div>

      {/* Nodes List */}
      {filteredNodes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Ingen noder fundet</p>
            {search && <p className="text-sm">Prov en anden sogning</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNodes).map(([rootPath, groupNodes]) => (
            <div key={rootPath}>
              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FolderTree className="w-5 h-5" />
                {rootPath}
                <Badge variant="secondary" className="ml-2">
                  {groupNodes.length}
                </Badge>
              </h2>

              <div className="grid gap-2">
                {groupNodes.map((node) => {
                  const Icon = nodeTypeIcons[node.node_type]
                  const colorClass = nodeTypeColors[node.node_type]

                  return (
                    <Link
                      key={node.id}
                      href={`/dashboard/settings/kalkia/nodes/${node.id}`}
                      className="block"
                    >
                      <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {/* Indentation based on depth */}
                              {node.depth > 0 && (
                                <div
                                  style={{ width: `${node.depth * 20}px` }}
                                  className="border-l-2 border-gray-200 h-8"
                                />
                              )}

                              <div
                                className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center`}
                              >
                                <Icon className="w-5 h-5" />
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-gray-900">
                                    {node.name}
                                  </h3>
                                  <Badge variant="outline" className="text-xs">
                                    {node.code}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {KALKIA_NODE_TYPE_LABELS[node.node_type]}
                                  </Badge>
                                  {node.base_time_seconds > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatTimeSeconds(node.base_time_seconds)}
                                    </span>
                                  )}
                                  {node.default_sale_price > 0 && (
                                    <span>
                                      {formatCurrency(node.default_sale_price)}
                                    </span>
                                  )}
                                  {node.variant_count > 0 && (
                                    <span>{node.variant_count} varianter</span>
                                  )}
                                  {node.category_name && (
                                    <Badge variant="outline" className="text-xs">
                                      {node.category_name}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {node.child_count > 0 && (
                                <Badge variant="secondary">
                                  {node.child_count} børn
                                </Badge>
                              )}
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
