'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  Calculator,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  FileText,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { deleteCalculation, duplicateCalculation, createCalculation } from '@/lib/actions/calculations'
import {
  CALCULATION_TYPE_LABELS,
  type CalculationWithRelations,
  type CalculationType,
} from '@/types/calculations.types'
import type { PaginatedResponse } from '@/types/common.types'
import CalculationForm from '@/components/modules/calculations/calculation-form'

interface CalculationsClientProps {
  initialCalculations: PaginatedResponse<CalculationWithRelations> | null
  initialFilters: {
    search: string
    calculation_type: string
    is_template: string
  }
}

export default function CalculationsClient({
  initialCalculations,
  initialFilters,
}: CalculationsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(initialFilters.search)
  const [calculationType, setCalculationType] = useState(initialFilters.calculation_type)
  const [isTemplate, setIsTemplate] = useState(initialFilters.is_template)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const calculations = initialCalculations?.data || []
  const total = initialCalculations?.total || 0
  const page = initialCalculations?.page || 1
  const totalPages = initialCalculations?.totalPages || 1

  const updateFilters = (newFilters: {
    search?: string
    calculation_type?: string
    is_template?: string
    page?: number
  }) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (newFilters.search !== undefined) {
        if (newFilters.search) {
          params.set('search', newFilters.search)
        } else {
          params.delete('search')
        }
        params.delete('page')
      }

      if (newFilters.calculation_type !== undefined) {
        if (newFilters.calculation_type && newFilters.calculation_type !== 'all') {
          params.set('calculation_type', newFilters.calculation_type)
        } else {
          params.delete('calculation_type')
        }
        params.delete('page')
      }

      if (newFilters.is_template !== undefined) {
        if (newFilters.is_template && newFilters.is_template !== 'all') {
          params.set('is_template', newFilters.is_template)
        } else {
          params.delete('is_template')
        }
        params.delete('page')
      }

      if (newFilters.page !== undefined) {
        if (newFilters.page > 1) {
          params.set('page', newFilters.page.toString())
        } else {
          params.delete('page')
        }
      }

      router.push(`/dashboard/calculations?${params.toString()}`)
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
  }

  const handleDelete = async (calc: CalculationWithRelations) => {
    if (!confirm(`Er du sikker på at du vil slette "${calc.name}"?`)) {
      return
    }

    const result = await deleteCalculation(calc.id)
    if (result.success) {
      toast.success('Kalkulation slettet')
      router.refresh()
    } else {
      toast.error(result.error || 'Kunne ikke slette kalkulation')
    }
  }

  const handleDuplicate = async (calc: CalculationWithRelations) => {
    const result = await duplicateCalculation(calc.id)
    if (result.success) {
      toast.success('Kalkulation duplikeret')
      router.refresh()
    } else {
      toast.error(result.error || 'Kunne ikke duplikere kalkulation')
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(price)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kalkulationer</h1>
          <p className="text-gray-500">
            {total} {total === 1 ? 'kalkulation' : 'kalkulationer'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/calculations/quick')}>
            <Zap className="w-4 h-4 mr-2" />
            Hurtig kalkulation
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Ny kalkulation
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Søg efter kalkulationer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </form>

        <Select
          value={calculationType || 'all'}
          onValueChange={(value) => {
            setCalculationType(value)
            updateFilters({ calculation_type: value })
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle typer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle typer</SelectItem>
            <SelectItem value="solar_system">Solcelleanlæg</SelectItem>
            <SelectItem value="electrical">El-installation</SelectItem>
            <SelectItem value="custom">Tilpasset</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={isTemplate || 'all'}
          onValueChange={(value) => {
            setIsTemplate(value)
            updateFilters({ is_template: value })
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Alle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="true">Skabeloner</SelectItem>
            <SelectItem value="false">Kalkulationer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Calculations Table */}
      {calculations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Ingen kalkulationer fundet
          </h3>
          <p className="text-gray-500 mb-4">
            {search || calculationType || isTemplate
              ? 'Prøv at ændre dine søgekriterier'
              : 'Kom i gang ved at oprette din første kalkulation'}
          </p>
          {!search && !calculationType && !isTemplate && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Opret kalkulation
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kalkulation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead className="text-right">Beløb</TableHead>
                <TableHead>Oprettet</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.map((calc) => (
                <TableRow key={calc.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/calculations/${calc.id}`}
                      className="font-medium hover:text-blue-600"
                    >
                      {calc.name}
                    </Link>
                    <div className="flex gap-2 mt-1">
                      {calc.is_template && (
                        <Badge variant="secondary">Skabelon</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CALCULATION_TYPE_LABELS[calc.calculation_type as CalculationType]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {calc.customer ? (
                      <span>{calc.customer.company_name}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPrice(calc.final_amount)}
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {formatDate(calc.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/calculations/${calc.id}`)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Åbn
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(calc)}>
                          <Copy className="w-4 h-4 mr-2" />
                          Dupliker
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(calc)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Slet
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-500">
                Side {page} af {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateFilters({ page: page - 1 })}
                >
                  Forrige
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateFilters({ page: page + 1 })}
                >
                  Næste
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Opret ny kalkulation</DialogTitle>
          </DialogHeader>
          <CalculationForm
            onSuccess={(calc) => {
              setShowCreateDialog(false)
              router.push(`/dashboard/calculations/${calc.id}`)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
