'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2,
  FileText,
  Check,
  X,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from 'lucide-react'
import { getImportBatches, getImportBatch, getPriceChangesFromImport } from '@/lib/actions/import'
import type { ImportBatchSummary, ImportStatus, PriceChange } from '@/types/suppliers.types'
import { formatDateTimeDK, formatDurationMs, formatCurrency } from '@/lib/utils/format'

interface ImportHistoryProps {
  supplierId?: string
}

const STATUS_CONFIG: Record<ImportStatus, { label: string; variant: 'default' | 'secondary' | 'outline'; className?: string }> = {
  pending: { label: 'Afventer', variant: 'secondary' },
  processing: { label: 'Kører', variant: 'outline' },
  completed: { label: 'Gennemført', variant: 'default' },
  failed: { label: 'Fejlet', variant: 'secondary', className: 'bg-red-100 text-red-800' },
  dry_run: { label: 'Test', variant: 'secondary' },
}

export function ImportHistory({ supplierId }: ImportHistoryProps) {
  const toast = useToast()
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedBatch, setSelectedBatch] = useState<ImportBatchSummary | null>(null)
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([])
  const [loadingChanges, setLoadingChanges] = useState(false)
  const pageSize = 10

  useEffect(() => {
    loadBatches()
  }, [supplierId, page])

  const loadBatches = async () => {
    setLoading(true)
    const result = await getImportBatches({
      supplier_id: supplierId,
      page,
      pageSize,
    })
    if (result.success && result.data) {
      setBatches(result.data.data)
      setTotalPages(result.data.totalPages)
    }
    setLoading(false)
  }

  const handleViewDetails = async (batch: ImportBatchSummary) => {
    setSelectedBatch(batch)
    setLoadingChanges(true)

    if (batch.status === 'completed') {
      const result = await getPriceChangesFromImport(batch.id)
      if (result.success && result.data) {
        setPriceChanges(result.data)
      }
    } else {
      setPriceChanges([])
    }

    setLoadingChanges(false)
  }

  const formatDate = (date: string) => {
    return formatDateTimeDK(date)
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '-'
    const ms = new Date(end).getTime() - new Date(start).getTime()
    return formatDurationMs(ms)
  }


  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading && batches.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {batches.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Ingen tidligere imports</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fil</TableHead>
                  {!supplierId && <TableHead>Leverandør</TableHead>}
                  <TableHead className="text-right">Rækker</TableHead>
                  <TableHead className="text-right">Nye</TableHead>
                  <TableHead className="text-right">Opdateret</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tid</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{batch.filename || 'Unavngivet'}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(batch.created_at)}
                        </p>
                      </div>
                    </TableCell>
                    {!supplierId && (
                      <TableCell>
                        <Badge variant="outline">{batch.supplier_code || batch.supplier_name}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      {batch.total_rows?.toLocaleString('da-DK') || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600">
                      {batch.new_products > 0 ? `+${batch.new_products}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-blue-600">
                      {batch.updated_products > 0 ? batch.updated_products : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_CONFIG[batch.status].variant} className={STATUS_CONFIG[batch.status].className}>
                        {batch.status === 'processing' && (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        )}
                        {batch.status === 'completed' && <Check className="w-3 h-3 mr-1" />}
                        {batch.status === 'failed' && <X className="w-3 h-3 mr-1" />}
                        {STATUS_CONFIG[batch.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDuration(batch.started_at, batch.completed_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(batch)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Side {page} af {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Forrige
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Næste
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Details Dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import detaljer</DialogTitle>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Fil</p>
                  <p className="font-medium">{selectedBatch.filename || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Størrelse</p>
                  <p className="font-medium">{formatFileSize(selectedBatch.file_size_bytes)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Leverandør</p>
                  <p className="font-medium">{selectedBatch.supplier_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <Badge variant={STATUS_CONFIG[selectedBatch.status].variant} className={STATUS_CONFIG[selectedBatch.status].className}>
                    {STATUS_CONFIG[selectedBatch.status].label}
                  </Badge>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 bg-gray-50 rounded-lg p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{selectedBatch.total_rows || 0}</p>
                  <p className="text-xs text-gray-500">Rækker</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{selectedBatch.new_products}</p>
                  <p className="text-xs text-gray-500">Nye</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{selectedBatch.updated_products}</p>
                  <p className="text-xs text-gray-500">Opdateret</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-500">{selectedBatch.skipped_rows}</p>
                  <p className="text-xs text-gray-500">Sprunget over</p>
                </div>
              </div>

              {/* Errors */}
              {selectedBatch.errors && selectedBatch.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">
                        {selectedBatch.errors.length} fejl
                      </p>
                      <ul className="text-sm text-red-700 mt-1 space-y-1 max-h-[150px] overflow-y-auto">
                        {selectedBatch.errors.slice(0, 10).map((error, i) => (
                          <li key={i}>
                            Række {error.row}: {error.message}
                          </li>
                        ))}
                        {selectedBatch.errors.length > 10 && (
                          <li className="text-red-500">
                            ... og {selectedBatch.errors.length - 10} flere
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Price changes */}
              {selectedBatch.status === 'completed' && (
                <div>
                  <p className="font-medium mb-2">Prisændringer</p>
                  {loadingChanges ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : priceChanges.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      Ingen prisændringer i denne import
                    </p>
                  ) : (
                    <div className="overflow-x-auto max-h-[200px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produkt</TableHead>
                            <TableHead className="text-right">Før</TableHead>
                            <TableHead className="text-center"></TableHead>
                            <TableHead className="text-right">Efter</TableHead>
                            <TableHead className="text-right">Ændring</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceChanges.slice(0, 10).map((change, i) => (
                            <TableRow key={i}>
                              <TableCell className="max-w-[150px] truncate">
                                {change.product_name}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {change.old_cost_price !== null ? formatCurrency(change.old_cost_price) : '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                <ArrowRight className="w-4 h-4 text-gray-400 mx-auto" />
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {change.new_cost_price !== null ? formatCurrency(change.new_cost_price) : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`flex items-center justify-end gap-1 text-sm ${
                                  change.change_percentage > 0 ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {change.change_percentage > 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                  ) : (
                                    <TrendingDown className="w-3 h-3" />
                                  )}
                                  {change.change_percentage.toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {priceChanges.length > 10 && (
                        <p className="text-xs text-gray-500 text-center py-2">
                          Viser 10 af {priceChanges.length} prisændringer
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>
                  <Clock className="w-3 h-3 inline mr-1" />
                  Startet: {selectedBatch.started_at ? formatDate(selectedBatch.started_at) : '-'}
                </span>
                <span>
                  Afsluttet: {selectedBatch.completed_at ? formatDate(selectedBatch.completed_at) : '-'}
                </span>
                <span>
                  Varighed: {formatDuration(selectedBatch.started_at, selectedBatch.completed_at)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
