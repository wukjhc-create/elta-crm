'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { updateProfile, uploadProfileAvatar, deleteProfileAvatar } from '@/lib/actions/settings'
import type { Profile, UpdateProfileInput } from '@/types/settings.types'
import { User, Phone, Building2, Mail, Save, Loader2, Camera, Trash2 } from 'lucide-react'

interface ProfileSettingsClientProps {
  profile: Profile
}

export function ProfileSettingsClient({ profile }: ProfileSettingsClientProps) {
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()
  const [formData, setFormData] = useState<UpdateProfileInput>({
    full_name: profile.full_name || '',
    phone: profile.phone || '',
    department: profile.department || '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    startTransition(async () => {
      const result = await updateProfile(formData)

      if (result.success) {
        toast.success('Profil opdateret')
      } else {
        toast.error(result.error || 'Kunne ikke opdatere profil')
      }
    })
  }

  const handleChange = (field: keyof UpdateProfileInput, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Profile header with avatar */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile.full_name || 'Profil'}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-blue-600" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setIsUploading(true)
                try {
                  const fd = new FormData()
                  fd.append('file', file)
                  const result = await uploadProfileAvatar(fd)
                  if (result.success && result.data) {
                    setAvatarUrl(result.data.url)
                    toast.success('Profilbillede opdateret')
                    router.refresh()
                  } else {
                    toast.error(result.error || 'Upload fejlede')
                  }
                } catch {
                  toast.error('Upload fejlede')
                } finally {
                  setIsUploading(false)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-full flex items-center justify-center transition-colors"
              aria-label="Skift profilbillede"
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {profile.full_name || 'Ikke angivet'}
            </h2>
            <p className="text-gray-500">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {profile.role}
              </span>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsUploading(true)
                    try {
                      const result = await deleteProfileAvatar()
                      if (result.success) {
                        setAvatarUrl(null)
                        toast.success('Profilbillede fjernet')
                        router.refresh()
                      } else {
                        toast.error(result.error || 'Kunne ikke fjerne billede')
                      }
                    } catch {
                      toast.error('Kunne ikke fjerne billede')
                    } finally {
                      setIsUploading(false)
                    }
                  }}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-3 h-3" />
                  Fjern billede
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Personlige oplysninger</h3>

        <div className="space-y-4">
          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              value={profile.email}
              disabled
              className="bg-gray-50"
            />
            <p className="text-xs text-gray-500">
              E-mail kan ikke ændres her. Kontakt administrator for at ændre din e-mail.
            </p>
          </div>

          {/* Full name */}
          <div className="space-y-2">
            <Label htmlFor="full_name" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Fulde navn
            </Label>
            <Input
              id="full_name"
              type="text"
              value={formData.full_name}
              onChange={(e) => handleChange('full_name', e.target.value)}
              placeholder="Dit fulde navn"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Telefonnummer
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+45 12 34 56 78"
            />
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label htmlFor="department" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Afdeling
            </Label>
            <Input
              id="department"
              type="text"
              value={formData.department}
              onChange={(e) => handleChange('department', e.target.value)}
              placeholder="F.eks. Salg, Support, Teknik"
            />
          </div>
        </div>
      </div>

      {/* Account info (read-only) */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Konto information</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Rolle:</span>
            <span className="ml-2 font-medium">{profile.role}</span>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <span className={`ml-2 font-medium ${profile.is_active ? 'text-green-600' : 'text-red-600'}`}>
              {profile.is_active ? 'Aktiv' : 'Inaktiv'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Oprettet:</span>
            <span className="ml-2 font-medium">
              {new Date(profile.created_at).toLocaleDateString('da-DK')}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Sidst opdateret:</span>
            <span className="ml-2 font-medium">
              {new Date(profile.updated_at).toLocaleDateString('da-DK')}
            </span>
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Gemmer...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Gem ændringer
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
