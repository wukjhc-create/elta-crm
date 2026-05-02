'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { changePassword } from '@/lib/actions/settings'
import { Lock, Eye, EyeOff, Save, Loader2, Shield, CheckCircle } from 'lucide-react'

export function SecuritySettingsClient() {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Nuværende adgangskode er påkrævet'
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'Ny adgangskode er påkrævet'
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Adgangskode skal være mindst 8 tegn'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Bekræft adgangskode er påkrævet'
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Adgangskoderne matcher ikke'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    startTransition(async () => {
      const result = await changePassword(formData.currentPassword, formData.newPassword)

      if (result.success) {
        toast.success('Adgangskode ændret')
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
        setErrors({})
      } else {
        toast.error(result.error || 'Kunne ikke ændre adgangskode')
      }
    })
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Password strength indicator
  const getPasswordStrength = (password: string): { level: number; text: string; color: string } => {
    if (!password) return { level: 0, text: '', color: '' }

    let strength = 0
    if (password.length >= 8) strength++
    if (password.length >= 12) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^A-Za-z0-9]/.test(password)) strength++

    if (strength <= 2) return { level: strength, text: 'Svag', color: 'bg-red-500' }
    if (strength <= 3) return { level: strength, text: 'Middel', color: 'bg-yellow-500' }
    return { level: strength, text: 'Stærk', color: 'bg-green-500' }
  }

  const passwordStrength = getPasswordStrength(formData.newPassword)

  return (
    <div className="space-y-6">
      {/* Password change form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Skift adgangskode</h3>
          </div>

          <div className="space-y-4">
            {/* Current password */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Nuværende adgangskode</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => handleChange('currentPassword', e.target.value)}
                  placeholder="Indtast nuværende adgangskode"
                  className={errors.currentPassword ? 'border-red-500' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="text-sm text-red-500">{errors.currentPassword}</p>
              )}
            </div>

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Ny adgangskode</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={(e) => handleChange('newPassword', e.target.value)}
                  placeholder="Indtast ny adgangskode"
                  className={errors.newPassword ? 'border-red-500' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-sm text-red-500">{errors.newPassword}</p>
              )}

              {/* Password strength meter */}
              {formData.newPassword && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded ${
                          level <= passwordStrength.level ? passwordStrength.color : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Styrke: <span className={passwordStrength.level <= 2 ? 'text-red-500' : passwordStrength.level <= 3 ? 'text-yellow-600' : 'text-green-600'}>{passwordStrength.text}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Bekræft ny adgangskode</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Bekræft ny adgangskode"
                  className={errors.confirmPassword ? 'border-red-500' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">{errors.confirmPassword}</p>
              )}
              {formData.confirmPassword && formData.newPassword === formData.confirmPassword && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Adgangskoderne matcher
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gemmer...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Skift adgangskode
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* 2FA section - placeholder */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-900">To-faktor-autentificering (2FA)</h3>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-gray-500 mb-2">
            Ekstra sikkerhed med to-faktor-autentificering kommer snart.
          </p>
          <p className="text-sm text-gray-400">
            Med 2FA aktiveret skal du bekræfte login med din telefon.
          </p>
        </div>
      </div>

      {/* Security tips */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h4 className="font-semibold text-blue-900 mb-2">Sikkerhedstips</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Brug en unik adgangskode til hver konto</li>
          <li>• Brug mindst 12 tegn med blanding af store/små bogstaver, tal og specialtegn</li>
          <li>• Overvej at bruge en password manager</li>
          <li>• Skift adgangskode regelmæssigt (hver 3-6 måned)</li>
        </ul>
      </div>
    </div>
  )
}
