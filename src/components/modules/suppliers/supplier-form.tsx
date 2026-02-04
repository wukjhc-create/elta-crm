'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Plus, Save } from 'lucide-react'
import { createSupplier, updateSupplier } from '@/lib/actions/suppliers'
import type { Supplier, CreateSupplierData } from '@/types/suppliers.types'

interface SupplierFormProps {
  supplier?: Supplier
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function SupplierForm({
  supplier,
  open,
  onOpenChange,
  onSuccess,
}: SupplierFormProps) {
  const toast = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<CreateSupplierData>({
    name: supplier?.name || '',
    code: supplier?.code || '',
    contact_name: supplier?.contact_name || '',
    contact_email: supplier?.contact_email || '',
    contact_phone: supplier?.contact_phone || '',
    website: supplier?.website || '',
    notes: supplier?.notes || '',
    is_active: supplier?.is_active ?? true,
  })

  const isEdit = !!supplier

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Fejl', 'Navn er påkrævet')
      return
    }

    setIsSaving(true)

    let result
    if (isEdit) {
      result = await updateSupplier(supplier.id, formData)
    } else {
      result = await createSupplier(formData)
    }

    if (result.success) {
      onSuccess()
    } else {
      toast.error('Fejl', result.error)
    }

    setIsSaving(false)
  }

  const handleClose = () => {
    if (!isSaving) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Rediger leverandør' : 'Ny leverandør'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Opdater leverandørens oplysninger'
              : 'Opret en ny leverandør/grossist til produktimport'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Navn *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="F.eks. AO, Lemvigh-Müller"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Kode</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="F.eks. AO, LM"
                  maxLength={10}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://www.example.dk"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Kontaktperson</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Navn på kontakt"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Telefon</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="+45 12345678"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">E-mail</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="kontakt@example.dk"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Noter</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Valgfrie noter om leverandøren..."
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Aktiv</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>
              Annuller
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : isEdit ? (
                <Save className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {isEdit ? 'Gem ændringer' : 'Opret leverandør'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
