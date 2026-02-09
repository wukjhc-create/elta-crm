'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Building2, Mail, Globe, FileText, Upload, Trash2, ImageIcon } from 'lucide-react'
import { updateCompanySettings, uploadCompanyLogo, deleteCompanyLogo } from '@/lib/actions/settings'
import { useToast } from '@/components/ui/toast'
import type { CompanySettings } from '@/types/company-settings.types'

interface CompanySettingsClientProps {
  settings: CompanySettings
}

export function CompanySettingsClient({ settings }: CompanySettingsClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.company_logo_url)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    company_name: settings.company_name || '',
    company_address: settings.company_address || '',
    company_city: settings.company_city || '',
    company_postal_code: settings.company_postal_code || '',
    company_country: settings.company_country || 'Danmark',
    company_phone: settings.company_phone || '',
    company_email: settings.company_email || '',
    company_vat_number: settings.company_vat_number || '',
    company_website: settings.company_website || '',
    default_tax_percentage: settings.default_tax_percentage || 25,
    default_currency: settings.default_currency || 'DKK',
    default_offer_validity_days: settings.default_offer_validity_days || 30,
    default_terms_and_conditions: settings.default_terms_and_conditions || '',
  })

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingLogo(true)
    try {
      const formDataObj = new FormData()
      formDataObj.append('file', file)
      const result = await uploadCompanyLogo(formDataObj)

      if (result.success && result.data) {
        setLogoUrl(result.data.url)
        toast.success('Logo uploadet')
        router.refresh()
      } else {
        toast.error('Kunne ikke uploade logo', result.error)
      }
    } catch {
      toast.error('Der opstod en fejl ved upload')
    } finally {
      setIsUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLogoDelete = async () => {
    setIsUploadingLogo(true)
    try {
      const result = await deleteCompanyLogo()
      if (result.success) {
        setLogoUrl(null)
        toast.success('Logo fjernet')
        router.refresh()
      } else {
        toast.error('Kunne ikke fjerne logo', result.error)
      }
    } catch {
      toast.error('Der opstod en fejl')
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const result = await updateCompanySettings({
        company_name: formData.company_name,
        company_address: formData.company_address || null,
        company_city: formData.company_city || null,
        company_postal_code: formData.company_postal_code || null,
        company_country: formData.company_country || null,
        company_phone: formData.company_phone || null,
        company_email: formData.company_email || null,
        company_vat_number: formData.company_vat_number || null,
        company_website: formData.company_website || null,
        default_tax_percentage: Number(formData.default_tax_percentage),
        default_currency: formData.default_currency,
        default_offer_validity_days: Number(formData.default_offer_validity_days),
        default_terms_and_conditions: formData.default_terms_and_conditions || null,
      })

      if (result.success) {
        toast.success('Indstillinger gemt')
        router.refresh()
      } else {
        toast.error('Kunne ikke gemme indstillinger', result.error)
      }
    } catch (error) {
      console.error('Error updating settings:', error)
      toast.error('Der opstod en fejl')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Company Logo */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <ImageIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Virksomhedslogo</h2>
            <p className="text-sm text-gray-500">Logo vises på tilbud og dokumenter</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Logo preview */}
          <div className="flex-shrink-0 w-32 h-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Virksomhedslogo"
                width={128}
                height={128}
                className="object-contain w-full h-full p-2"
              />
            ) : (
              <ImageIcon className="w-10 h-10 text-gray-300" />
            )}
          </div>

          {/* Upload controls */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLogo}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {isUploadingLogo ? 'Uploader...' : logoUrl ? 'Skift logo' : 'Upload logo'}
            </button>

            {logoUrl && (
              <button
                type="button"
                onClick={handleLogoDelete}
                disabled={isUploadingLogo}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Fjern logo
              </button>
            )}

            <p className="text-xs text-gray-500">
              PNG, JPEG, WebP eller SVG. Maks 2 MB.
            </p>
          </div>
        </div>
      </div>

    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Company Information */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Building2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Virksomhedsoplysninger</h2>
            <p className="text-sm text-gray-500">Grundlæggende info om din virksomhed</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
              Virksomhedsnavn *
            </label>
            <input
              type="text"
              id="company_name"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="company_vat_number" className="block text-sm font-medium text-gray-700 mb-1">
              CVR-nummer
            </label>
            <input
              type="text"
              id="company_vat_number"
              name="company_vat_number"
              value={formData.company_vat_number}
              onChange={handleChange}
              placeholder="12345678"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="company_address" className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <input
              type="text"
              id="company_address"
              name="company_address"
              value={formData.company_address}
              onChange={handleChange}
              placeholder="Gadenavn 123"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="company_postal_code" className="block text-sm font-medium text-gray-700 mb-1">
              Postnummer
            </label>
            <input
              type="text"
              id="company_postal_code"
              name="company_postal_code"
              value={formData.company_postal_code}
              onChange={handleChange}
              placeholder="1234"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="company_city" className="block text-sm font-medium text-gray-700 mb-1">
              By
            </label>
            <input
              type="text"
              id="company_city"
              name="company_city"
              value={formData.company_city}
              onChange={handleChange}
              placeholder="København"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="company_country" className="block text-sm font-medium text-gray-700 mb-1">
              Land
            </label>
            <input
              type="text"
              id="company_country"
              name="company_country"
              value={formData.company_country}
              onChange={handleChange}
              placeholder="Danmark"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kontaktoplysninger</h2>
            <p className="text-sm text-gray-500">Kontaktinfo der vises på tilbud</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="company_email" className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              id="company_email"
              name="company_email"
              value={formData.company_email}
              onChange={handleChange}
              placeholder="kontakt@firma.dk"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="company_phone" className="block text-sm font-medium text-gray-700 mb-1">
              Telefon
            </label>
            <input
              type="tel"
              id="company_phone"
              name="company_phone"
              value={formData.company_phone}
              onChange={handleChange}
              placeholder="+45 12 34 56 78"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="company_website" className="block text-sm font-medium text-gray-700 mb-1">
              Hjemmeside
            </label>
            <input
              type="url"
              id="company_website"
              name="company_website"
              value={formData.company_website}
              onChange={handleChange}
              placeholder="https://www.firma.dk"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Default Values */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-100 rounded-lg">
            <Globe className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Standardværdier</h2>
            <p className="text-sm text-gray-500">Standardindstillinger for tilbud</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="default_tax_percentage" className="block text-sm font-medium text-gray-700 mb-1">
              Moms (%)
            </label>
            <input
              type="number"
              id="default_tax_percentage"
              name="default_tax_percentage"
              value={formData.default_tax_percentage}
              onChange={handleChange}
              min="0"
              max="100"
              step="0.01"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="default_currency" className="block text-sm font-medium text-gray-700 mb-1">
              Valuta
            </label>
            <select
              id="default_currency"
              name="default_currency"
              value={formData.default_currency}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="DKK">DKK - Danske kroner</option>
              <option value="EUR">EUR - Euro</option>
              <option value="USD">USD - US Dollar</option>
              <option value="SEK">SEK - Svenska kronor</option>
              <option value="NOK">NOK - Norske kroner</option>
            </select>
          </div>

          <div>
            <label htmlFor="default_offer_validity_days" className="block text-sm font-medium text-gray-700 mb-1">
              Tilbuds gyldighed (dage)
            </label>
            <input
              type="number"
              id="default_offer_validity_days"
              name="default_offer_validity_days"
              value={formData.default_offer_validity_days}
              onChange={handleChange}
              min="1"
              max="365"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <FileText className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Standardbetingelser</h2>
            <p className="text-sm text-gray-500">Vilkår der vises på tilbud</p>
          </div>
        </div>

        <div>
          <label htmlFor="default_terms_and_conditions" className="block text-sm font-medium text-gray-700 mb-1">
            Betingelser og vilkår
          </label>
          <textarea
            id="default_terms_and_conditions"
            name="default_terms_and_conditions"
            value={formData.default_terms_and_conditions}
            onChange={handleChange}
            rows={6}
            placeholder="Indtast dine standard betingelser og vilkår..."
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Gemmer...' : 'Gem indstillinger'}
        </button>
      </div>
    </form>
    </div>
  )
}
