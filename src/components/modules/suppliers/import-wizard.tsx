'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  FileText,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileCheck,
  Package,
} from 'lucide-react'
import { previewImport, executeImport } from '@/lib/actions/import'
import type { ImportPreview, ImportResult, PriceChange } from '@/types/suppliers.types'
import { formatCurrency } from '@/lib/utils/format'

interface ImportWizardProps {
  supplierId: string
  supplierName: string
  supplierCode?: string | null
  onComplete?: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'complete'

export function ImportWizard({
  supplierId,
  supplierName,
  supplierCode,
  onComplete,
}: ImportWizardProps) {
  const toast = useToast()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.txt')) {
      toast.error('Forkert filtype', 'Vælg venligst en CSV-fil')
      return
    }

    setFile(selectedFile)
    setIsLoading(true)

    try {
      // Read file content
      const content = await readFileContent(selectedFile)
      setFileContent(content)

      // Get preview
      const previewResult = await previewImport(supplierId, content)
      if (previewResult.success && previewResult.data) {
        setPreview(previewResult.data)
        setStep('preview')
      } else {
        toast.error('Fejl ved læsning af fil', previewResult.error)
      }
    } catch (err) {
      toast.error('Fejl', 'Kunne ikke læse filen')
    }

    setIsLoading(false)
  }, [supplierId])

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  const handleImport = async (dryRun: boolean = false) => {
    if (!file || !fileContent) return

    setIsLoading(true)
    if (!dryRun) {
      setStep('importing')
      setProgress(0)
    }

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 10, 90))
    }, 500)

    try {
      const importResult = await executeImport(
        supplierId,
        fileContent,
        file.name,
        { dryRun }
      )

      clearInterval(progressInterval)
      setProgress(100)

      if (importResult.success && importResult.data) {
        setResult(importResult.data)
        if (!dryRun) {
          setStep('complete')
          toast.success(
            'Import gennemført',
            `${importResult.data.new_products} nye, ${importResult.data.updated_products} opdaterede`
          )
        }
      } else {
        toast.error('Import fejlede', importResult.error)
        if (!dryRun) {
          setStep('preview')
        }
      }
    } catch (err) {
      clearInterval(progressInterval)
      toast.error('Fejl', 'Import fejlede uventet')
      setStep('preview')
    }

    setIsLoading(false)
  }

  const handleReset = () => {
    setStep('upload')
    setFile(null)
    setFileContent('')
    setPreview(null)
    setResult(null)
    setProgress(0)
  }


  return (
    <div className="space-y-6">
      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`flex items-center gap-1 ${step === 'upload' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 'upload' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
            1
          </div>
          <span>Upload</span>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
        <div className={`flex items-center gap-1 ${step === 'preview' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 'preview' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
            2
          </div>
          <span>Forhåndsvisning</span>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" />
        <div className={`flex items-center gap-1 ${step === 'importing' || step === 'complete' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step === 'complete' ? 'bg-green-100 text-green-600' : step === 'importing' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
            {step === 'complete' ? <Check className="w-4 h-4" /> : '3'}
          </div>
          <span>Import</span>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg border p-8">
          <div className="max-w-md mx-auto text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">Upload produktfil</h3>
            <p className="text-sm text-gray-500 mb-6">
              Vælg en CSV-fil fra {supplierName} til import
            </p>

            <label className="block cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isLoading}
              />
              <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Vælg fil
              </span>
            </label>

            {supplierCode && (
              <p className="text-xs text-gray-400 mt-4">
                {supplierCode === 'AO' && 'Forventet format: CSV med semikolon-separator (ISO-8859-1)'}
                {supplierCode === 'LM' && 'Forventet format: CSV med semikolon-separator (UTF-8)'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* File info */}
          <div className="bg-white rounded-lg border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileCheck className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">{file?.name}</p>
                <p className="text-sm text-gray-500">
                  {preview.totalRows.toLocaleString('da-DK')} rækker fundet
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Vælg anden fil
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-sm">Nye produkter</span>
              </div>
              <p className="text-2xl font-bold">{preview.newProducts}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <RefreshCw className="w-4 h-4" />
                <span className="text-sm">Opdateringer</span>
              </div>
              <p className="text-2xl font-bold">{preview.updatedProducts}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <X className="w-4 h-4" />
                <span className="text-sm">Spring over</span>
              </div>
              <p className="text-2xl font-bold">{preview.skippedRows}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Fejl</span>
              </div>
              <p className="text-2xl font-bold">{preview.errors.length}</p>
            </div>
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Advarsler</p>
                  <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                    {preview.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Sample data */}
          {preview.sampleRows.length > 0 && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h4 className="font-medium">Eksempel på data (første 10 rækker)</h4>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Række</TableHead>
                      <TableHead>Varenummer</TableHead>
                      <TableHead>Navn</TableHead>
                      <TableHead className="text-right">Kostpris</TableHead>
                      <TableHead className="text-right">Listepris</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sampleRows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="text-gray-500">{row.rowNumber}</TableCell>
                        <TableCell className="font-mono text-sm">{row.parsed.sku}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{row.parsed.name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.parsed.cost_price !== null ? formatCurrency(row.parsed.cost_price, 'DKK', 2) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.parsed.list_price !== null ? formatCurrency(row.parsed.list_price, 'DKK', 2) : '-'}
                        </TableCell>
                        <TableCell>
                          {row.isValid ? (
                            row.isUpdate ? (
                              <Badge variant="secondary">
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Opdater
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800">
                                <Package className="w-3 h-3 mr-1" />
                                Ny
                              </Badge>
                            )
                          ) : (
                            <Badge variant="secondary" className="bg-red-100 text-red-800">
                              <X className="w-3 h-3 mr-1" />
                              Fejl
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              Annuller
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleImport(true)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileCheck className="w-4 h-4 mr-2" />
                )}
                Test import
              </Button>
              <Button onClick={() => handleImport(false)} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Kør import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="bg-white rounded-lg border p-8">
          <div className="max-w-md mx-auto text-center">
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-blue-500 animate-spin" />
            <h3 className="text-lg font-medium mb-2">Importerer produkter...</h3>
            <p className="text-sm text-gray-500 mb-6">
              Dette kan tage et øjeblik
            </p>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-gray-400 mt-2">{progress}%</p>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && result && (
        <div className="space-y-4">
          {/* Success message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <Check className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium text-green-800 mb-2">Import gennemført</h3>
            <p className="text-sm text-green-700">
              {result.new_products} nye produkter og {result.updated_products} opdateringer
            </p>
          </div>

          {/* Results summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{result.new_products}</p>
              <p className="text-sm text-gray-500">Nye produkter</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.updated_products}</p>
              <p className="text-sm text-gray-500">Opdaterede</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-gray-500">{result.skipped_rows}</p>
              <p className="text-sm text-gray-500">Sprunget over</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{result.price_changes.length}</p>
              <p className="text-sm text-gray-500">Prisændringer</p>
            </div>
          </div>

          {/* Price changes */}
          {result.price_changes.length > 0 && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h4 className="font-medium">Prisændringer</h4>
              </div>
              <div className="overflow-x-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Varenummer</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Gammel pris</TableHead>
                      <TableHead className="text-center">→</TableHead>
                      <TableHead className="text-right">Ny pris</TableHead>
                      <TableHead className="text-right">Ændring</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.price_changes.slice(0, 20).map((change, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{change.supplier_sku}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{change.product_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {change.old_cost_price !== null ? formatCurrency(change.old_cost_price, 'DKK', 2) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="w-4 h-4 text-gray-400 mx-auto" />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {change.new_cost_price !== null ? formatCurrency(change.new_cost_price, 'DKK', 2) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`flex items-center justify-end gap-1 text-sm ${
                            change.change_percentage > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {change.change_percentage > 0 ? (
                              <TrendingUp className="w-4 h-4" />
                            ) : (
                              <TrendingDown className="w-4 h-4" />
                            )}
                            {change.change_percentage.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {result.price_changes.length > 20 && (
                <div className="px-4 py-2 border-t bg-gray-50 text-sm text-gray-500 text-center">
                  Viser 20 af {result.price_changes.length} prisændringer
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Ny import
            </Button>
            {onComplete && (
              <Button onClick={onComplete}>
                <Check className="w-4 h-4 mr-2" />
                Færdig
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
