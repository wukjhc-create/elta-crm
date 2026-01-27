'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Zap,
  Clock,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Component, ComponentCategory } from '@/lib/actions/components'

interface ComponentsClientProps {
  components: Component[]
  categories: ComponentCategory[]
}

export default function ComponentsClient({ components, categories }: ComponentsClientProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filteredComponents = components.filter(comp => {
    const matchesSearch = !search ||
      comp.name.toLowerCase().includes(search.toLowerCase()) ||
      (comp.code && comp.code.toLowerCase().includes(search.toLowerCase()))

    const matchesCategory = categoryFilter === 'all' ||
      (comp.category && comp.category.id === categoryFilter)

    return matchesSearch && matchesCategory
  })

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}t ${mins}m` : `${hours}t`
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
    }).format(price)
  }

  // Group by category
  const groupedComponents = filteredComponents.reduce((acc, comp) => {
    const catName = comp.category?.name || 'Uden kategori'
    if (!acc[catName]) acc[catName] = []
    acc[catName].push(comp)
    return acc
  }, {} as Record<string, Component[]>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Komponenter</h1>
        <p className="text-gray-600 mt-1">
          Administrer el-komponenter, tidsnormer, varianter og materialer
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Søg efter komponenter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Alle kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kategorier</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Components List */}
      {Object.keys(groupedComponents).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Ingen komponenter fundet</p>
            {search && <p className="text-sm">Prøv en anden søgning</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedComponents).map(([categoryName, comps]) => (
            <div key={categoryName}>
              <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                {categoryName}
                <Badge variant="secondary" className="ml-2">{comps.length}</Badge>
              </h2>

              <div className="grid gap-3">
                {comps.map(comp => (
                  <Link
                    key={comp.id}
                    href={`/dashboard/settings/components/${comp.id}`}
                    className="block"
                  >
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                              <Zap className="w-5 h-5 text-yellow-600" />
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900">{comp.name}</h3>
                              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                                {comp.code && (
                                  <Badge variant="outline" className="text-xs">
                                    {comp.code}
                                  </Badge>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(comp.base_time_minutes)}
                                </span>
                                <span>
                                  Kostpris: {formatPrice(comp.default_cost_price || 0)}
                                </span>
                                <span>
                                  Salgspris: {formatPrice(comp.default_sale_price || 0)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
