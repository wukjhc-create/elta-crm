'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { saveNotificationPreferences } from '@/lib/actions/settings'
import type { NotificationPreferences } from '@/types/settings.types'
import { Bell, Mail, MessageSquare, FileText, Users, Save, Loader2, Info } from 'lucide-react'

interface PreferenceConfig {
  key: string
  label: string
  description: string
  icon: React.ReactNode
  defaultEmail: boolean
  defaultPush: boolean
}

const PREFERENCE_CONFIGS: PreferenceConfig[] = [
  {
    key: 'new_lead',
    label: 'Nye leads',
    description: 'Når et nyt lead oprettes eller tildeles dig',
    icon: <Users className="w-5 h-5" />,
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'new_message',
    label: 'Nye beskeder',
    description: 'Når du modtager en ny besked fra kunde eller kollega',
    icon: <MessageSquare className="w-5 h-5" />,
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'offer_signed',
    label: 'Tilbud underskrevet',
    description: 'Når en kunde underskriver et tilbud',
    icon: <FileText className="w-5 h-5" />,
    defaultEmail: true,
    defaultPush: true,
  },
  {
    key: 'offer_viewed',
    label: 'Tilbud set',
    description: 'Når en kunde ser dit tilbud',
    icon: <FileText className="w-5 h-5" />,
    defaultEmail: false,
    defaultPush: true,
  },
  {
    key: 'daily_summary',
    label: 'Daglig opsummering',
    description: 'Daglig rapport over aktiviteter',
    icon: <Mail className="w-5 h-5" />,
    defaultEmail: true,
    defaultPush: false,
  },
]

function buildState(saved: NotificationPreferences): Record<string, { email: boolean; push: boolean }> {
  const state: Record<string, { email: boolean; push: boolean }> = {}
  for (const config of PREFERENCE_CONFIGS) {
    state[config.key] = saved[config.key] ?? { email: config.defaultEmail, push: config.defaultPush }
  }
  return state
}

function buildDefaults(): Record<string, { email: boolean; push: boolean }> {
  const state: Record<string, { email: boolean; push: boolean }> = {}
  for (const config of PREFERENCE_CONFIGS) {
    state[config.key] = { email: config.defaultEmail, push: config.defaultPush }
  }
  return state
}

interface NotificationsSettingsClientProps {
  savedPreferences: NotificationPreferences
}

export function NotificationsSettingsClient({ savedPreferences }: NotificationsSettingsClientProps) {
  const [isPending, setIsPending] = useState(false)
  const toast = useToast()
  const [preferences, setPreferences] = useState(() => buildState(savedPreferences))

  const handleToggle = (key: string, type: 'email' | 'push') => {
    setPreferences(prev => ({
      ...prev,
      [key]: { ...prev[key], [type]: !prev[key][type] },
    }))
  }

  const handleSave = async () => {
    setIsPending(true)
    try {
      const result = await saveNotificationPreferences(preferences)
      if (result.success) {
        toast.success('Notifikationsindstillinger gemt')
      } else {
        toast.error(result.error || 'Kunne ikke gemme indstillinger')
      }
    } catch {
      toast.error('Kunne ikke gemme indstillinger')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800">
            Notifikationssystemet er under udvikling. Dine præferencer gemmes, men notifikationer sendes endnu ikke.
          </p>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="bg-white rounded-lg border divide-y">
        <div className="p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-900">Notifikationspræferencer</h3>
        </div>

        {/* Header */}
        <div className="p-4 bg-gray-50 grid grid-cols-[1fr,80px,80px] gap-4 text-sm font-medium text-gray-600">
          <div>Begivenhed</div>
          <div className="text-center">E-mail</div>
          <div className="text-center">Push</div>
        </div>

        {/* Preference rows */}
        {PREFERENCE_CONFIGS.map(config => {
          const pref = preferences[config.key]
          return (
            <div key={config.key} className="p-4 grid grid-cols-[1fr,80px,80px] gap-4 items-center">
              <div className="flex items-start gap-3">
                <div className="text-gray-500 mt-0.5">{config.icon}</div>
                <div>
                  <div className="font-medium text-gray-900">{config.label}</div>
                  <div className="text-sm text-gray-500">{config.description}</div>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleToggle(config.key, 'email')}
                  aria-label={`${config.label} e-mail ${pref.email ? 'til' : 'fra'}`}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    pref.email ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      pref.email ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleToggle(config.key, 'push')}
                  aria-label={`${config.label} push ${pref.push ? 'til' : 'fra'}`}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    pref.push ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      pref.push ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-medium text-gray-900 mb-3">Hurtige handlinger</h4>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const all: Record<string, { email: boolean; push: boolean }> = {}
              for (const c of PREFERENCE_CONFIGS) all[c.key] = { email: true, push: true }
              setPreferences(all)
            }}
          >
            Aktiver alle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const none: Record<string, { email: boolean; push: boolean }> = {}
              for (const c of PREFERENCE_CONFIGS) none[c.key] = { email: false, push: false }
              setPreferences(none)
            }}
          >
            Deaktiver alle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreferences(buildDefaults())}
          >
            Nulstil til standard
          </Button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Gemmer...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Gem indstillinger
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
