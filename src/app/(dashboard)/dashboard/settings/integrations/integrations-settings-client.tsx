'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import {
  Mail,
  Calendar,
  Calculator,
  FileText,
  CreditCard,
  Truck,
  CheckCircle,
  XCircle,
  ExternalLink,
  Settings,
  Save,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react'

interface Integration {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  status: 'connected' | 'available' | 'coming_soon'
  category: string
}

const integrations: Integration[] = [
  {
    id: 'smtp',
    name: 'E-mail (SMTP)',
    description: 'Send e-mails via din egen SMTP-server',
    icon: <Mail className="w-6 h-6" />,
    status: 'available',
    category: 'Kommunikation',
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Synkroniser aftaler med Google Calendar',
    icon: <Calendar className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Produktivitet',
  },
  {
    id: 'outlook',
    name: 'Microsoft Outlook',
    description: 'Synkroniser e-mail og kalender med Outlook',
    icon: <Mail className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Kommunikation',
  },
  {
    id: 'economic',
    name: 'e-conomic',
    description: 'Synkroniser fakturaer og kunder med e-conomic',
    icon: <Calculator className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Regnskab',
  },
  {
    id: 'dinero',
    name: 'Dinero',
    description: 'Synkroniser fakturaer og kunder med Dinero',
    icon: <FileText className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Regnskab',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Modtag online betalinger via Stripe',
    icon: <CreditCard className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Betalinger',
  },
  {
    id: 'solar_edge',
    name: 'SolarEdge',
    description: 'Hent produktionsdata fra SolarEdge inverters',
    icon: <Settings className="w-6 h-6" />,
    status: 'coming_soon',
    category: 'Solcelle',
  },
]

interface IntegrationsSettingsClientProps {
  smtpSettings?: {
    host: string | null
    port: number | null
    user: string | null
    password: string | null
    fromEmail: string | null
    fromName: string | null
  }
}

export function IntegrationsSettingsClient({ smtpSettings }: IntegrationsSettingsClientProps) {
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const [activeIntegration, setActiveIntegration] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [smtpForm, setSmtpForm] = useState({
    host: smtpSettings?.host || '',
    port: smtpSettings?.port?.toString() || '587',
    user: smtpSettings?.user || '',
    password: smtpSettings?.password || '',
    fromEmail: smtpSettings?.fromEmail || '',
    fromName: smtpSettings?.fromName || '',
  })

  const groupedIntegrations = integrations.reduce((acc, int) => {
    if (!acc[int.category]) acc[int.category] = []
    acc[int.category].push(int)
    return acc
  }, {} as Record<string, Integration[]>)

  const getStatusBadge = (status: Integration['status']) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Forbundet
          </span>
        )
      case 'available':
        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
            Tilgængelig
          </span>
        )
      case 'coming_soon':
        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
            Kommer snart
          </span>
        )
    }
  }

  const handleSaveSmtp = () => {
    startTransition(async () => {
      // This would normally call a server action to save SMTP settings
      // For now, just show a toast
      await new Promise(resolve => setTimeout(resolve, 500))
      toast.success('SMTP-indstillinger gemt (demo)')
      setActiveIntegration(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Integration categories */}
      {Object.entries(groupedIntegrations).map(([category, ints]) => (
        <div key={category} className="bg-white rounded-lg border">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900">{category}</h3>
          </div>

          <div className="divide-y">
            {ints.map(integration => (
              <div key={integration.id}>
                <div className="p-4 flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      integration.status === 'connected'
                        ? 'bg-green-100 text-green-600'
                        : integration.status === 'available'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {integration.icon}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{integration.name}</span>
                      {getStatusBadge(integration.status)}
                    </div>
                    <p className="text-sm text-gray-500">{integration.description}</p>
                  </div>

                  {integration.status === 'available' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveIntegration(
                        activeIntegration === integration.id ? null : integration.id
                      )}
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Konfigurer
                    </Button>
                  )}

                  {integration.status === 'connected' && (
                    <Button variant="outline" size="sm">
                      <Settings className="w-4 h-4 mr-1" />
                      Indstillinger
                    </Button>
                  )}

                  {integration.status === 'coming_soon' && (
                    <Button variant="ghost" size="sm" disabled>
                      Kommer snart
                    </Button>
                  )}
                </div>

                {/* SMTP configuration panel */}
                {activeIntegration === 'smtp' && integration.id === 'smtp' && (
                  <div className="p-4 bg-gray-50 border-t space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="smtp_host">SMTP Server</Label>
                        <Input
                          id="smtp_host"
                          value={smtpForm.host}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, host: e.target.value }))}
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_port">Port</Label>
                        <Input
                          id="smtp_port"
                          value={smtpForm.port}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, port: e.target.value }))}
                          placeholder="587"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="smtp_user">Brugernavn</Label>
                        <Input
                          id="smtp_user"
                          value={smtpForm.user}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, user: e.target.value }))}
                          placeholder="din@email.dk"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_password">Adgangskode</Label>
                        <div className="relative">
                          <Input
                            id="smtp_password"
                            type={showPassword ? 'text' : 'password'}
                            value={smtpForm.password}
                            onChange={(e) => setSmtpForm(prev => ({ ...prev, password: e.target.value }))}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="smtp_from_email">Afsender e-mail</Label>
                        <Input
                          id="smtp_from_email"
                          value={smtpForm.fromEmail}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, fromEmail: e.target.value }))}
                          placeholder="noreply@dinvirksomhed.dk"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtp_from_name">Afsender navn</Label>
                        <Input
                          id="smtp_from_name"
                          value={smtpForm.fromName}
                          onChange={(e) => setSmtpForm(prev => ({ ...prev, fromName: e.target.value }))}
                          placeholder="Din Virksomhed"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setActiveIntegration(null)}
                      >
                        Annuller
                      </Button>
                      <Button onClick={handleSaveSmtp} disabled={isPending}>
                        {isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Gemmer...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Gem SMTP
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* API info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">API-adgang</h4>
        <p className="text-sm text-blue-800 mb-3">
          Brug vores API til at bygge dine egne integrationer og automatiseringer.
        </p>
        <Button variant="outline" size="sm" disabled>
          <ExternalLink className="w-4 h-4 mr-1" />
          API-dokumentation (Kommer snart)
        </Button>
      </div>
    </div>
  )
}
