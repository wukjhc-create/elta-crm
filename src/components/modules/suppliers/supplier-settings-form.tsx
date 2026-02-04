'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, Info } from 'lucide-react'
import { getSupplierSettings, updateSupplierSettings } from '@/lib/actions/suppliers'
import type { SupplierSettings, UpdateSupplierSettingsData, ImportFormat } from '@/types/suppliers.types'

interface SupplierSettingsFormProps {
  supplierId: string
  supplierCode?: string | null
}

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xml', label: 'XML' },
  { value: 'api', label: 'API' },
]

const ENCODING_OPTIONS = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
  { value: 'windows-1252', label: 'Windows-1252' },
]

const DELIMITER_OPTIONS = [
  { value: ';', label: 'Semikolon (;)' },
  { value: ',', label: 'Komma (,)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
]

export function SupplierSettingsForm({
  supplierId,
  supplierCode,
}: SupplierSettingsFormProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<SupplierSettings | null>(null)
  const [formData, setFormData] = useState<UpdateSupplierSettingsData>({
    import_format: 'csv',
    csv_delimiter: ';',
    csv_encoding: 'utf-8',
    default_margin_percentage: 25,
    auto_update_prices: false,
    is_preferred: false,
  })

  useEffect(() => {
    loadSettings()
  }, [supplierId])

  const loadSettings = async () => {
    setLoading(true)
    const result = await getSupplierSettings(supplierId)
    if (result.success) {
      if (result.data) {
        setSettings(result.data)
        setFormData({
          import_format: result.data.import_format || 'csv',
          csv_delimiter: result.data.csv_delimiter || ';',
          csv_encoding: result.data.csv_encoding || 'utf-8',
          default_margin_percentage: result.data.default_margin_percentage || 25,
          auto_update_prices: result.data.auto_update_prices || false,
          is_preferred: result.data.is_preferred || false,
        })
      } else {
        // Use default settings based on supplier code
        if (supplierCode === 'AO') {
          setFormData({
            import_format: 'csv',
            csv_delimiter: ';',
            csv_encoding: 'iso-8859-1',
            default_margin_percentage: 25,
            auto_update_prices: false,
            is_preferred: false,
          })
        } else if (supplierCode === 'LM') {
          setFormData({
            import_format: 'csv',
            csv_delimiter: ';',
            csv_encoding: 'utf-8',
            default_margin_percentage: 25,
            auto_update_prices: false,
            is_preferred: false,
          })
        }
      }
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    const result = await updateSupplierSettings(supplierId, formData)
    if (result.success && result.data) {
      toast.success('Indstillinger gemt')
      setSettings(result.data)
    } else {
      toast.error('Fejl', result.error)
    }

    setIsSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Import Settings */}
      <div className="space-y-4">
        <h3 className="font-medium">Import indstillinger</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="import_format">Format</Label>
            <Select
              value={formData.import_format}
              onValueChange={(value) => setFormData({ ...formData, import_format: value as ImportFormat })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.import_format === 'csv' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="csv_delimiter">Separator</Label>
                <Select
                  value={formData.csv_delimiter}
                  onValueChange={(value) => setFormData({ ...formData, csv_delimiter: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIMITER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv_encoding">Encoding</Label>
                <Select
                  value={formData.csv_encoding}
                  onValueChange={(value) => setFormData({ ...formData, csv_encoding: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENCODING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        {supplierCode && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5" />
            <p className="text-sm text-blue-700">
              {supplierCode === 'AO' && (
                <>AO filer bruger typisk semikolon-separator og ISO-8859-1 encoding.</>
              )}
              {supplierCode === 'LM' && (
                <>Lemvigh-Müller filer bruger typisk semikolon-separator og UTF-8 encoding.</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Pricing Settings */}
      <div className="space-y-4">
        <h3 className="font-medium">Prisindstillinger</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="default_margin">Standard avance (%)</Label>
            <Input
              id="default_margin"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={formData.default_margin_percentage}
              onChange={(e) => setFormData({ ...formData, default_margin_percentage: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500">
              Bruges som standard avance på nye produkter fra denne leverandør
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto_update">Automatisk prisopdatering</Label>
              <p className="text-xs text-gray-500">
                Opdater materialpriser automatisk når produktpriser ændres
              </p>
            </div>
            <Switch
              id="auto_update"
              checked={formData.auto_update_prices}
              onCheckedChange={(checked) => setFormData({ ...formData, auto_update_prices: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="is_preferred">Foretrukken leverandør</Label>
              <p className="text-xs text-gray-500">
                Vælg denne leverandør først når der er flere muligheder
              </p>
            </div>
            <Switch
              id="is_preferred"
              checked={formData.is_preferred}
              onCheckedChange={(checked) => setFormData({ ...formData, is_preferred: checked })}
            />
          </div>
        </div>
      </div>

      {/* Last Import Info */}
      {settings?.last_import_at && (
        <div className="text-sm text-gray-500">
          Sidst importeret:{' '}
          {new Date(settings.last_import_at).toLocaleString('da-DK', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Gem indstillinger
        </Button>
      </div>
    </form>
  )
}
