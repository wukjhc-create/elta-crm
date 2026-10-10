'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { saveNotificationPreferences } from '@/lib/actions/settings'
import type { NotificationPreferences } from '@/types/settings.types'
import { NOTIFY_AVAILABILITY, sanitizeNotifyPreferences, type NotifyChannel, type NotifyEvent } from '@/lib/notifications/events'
import { Bell, Mail, MessageSquare, FileText, Users, Save, Loader2, Info } from 'lucide-react'

/**
 * Henrik 2026-10-10: notifikationsindstillingerne er ægte — afsenderne (lib/notifications/user-notify.ts) sender KUN
 * det, brugeren har slået til (standard: alt fra). Kanaler/hændelser uden afsender vises som "ikke tilgængelig".
 */
interface PreferenceConfig {
  key: NotifyEvent
  label: string
  description: string
  icon: React.ReactNode
}

const PREFERENCE_CONFIGS: PreferenceConfig[] = [
  { key: 'new_lead', label: 'Lead tildelt dig', description: 'Når et lead tildeles dig af en kollega', icon: <Users className="w-5 h-5" /> },
  { key: 'new_message', label: 'Interne beskeder', description: 'Når en kollega sender dig en besked i ELTA Drift (kundernes beskeder går til den fælles postkasse)', icon: <MessageSquare className="w-5 h-5" /> },
  { key: 'offer_signed', label: 'Tilbud underskrevet', description: 'Når en kunde accepterer og underskriver et tilbud, du har oprettet', icon: <FileText className="w-5 h-5" /> },
  { key: 'offer_viewed', label: 'Tilbud set', description: 'Når en kunde første gang åbner et tilbud, du har oprettet', icon: <FileText className="w-5 h-5" /> },
  { key: 'daily_summary', label: 'Daglig opsummering', description: 'Daglig rapport over aktiviteter', icon: <Mail className="w-5 h-5" /> },
]

const CHANNELS: Array<{ key: NotifyChannel; label: string }> = [
  { key: 'email', label: 'E-mail' },
  { key: 'push', label: 'Push' },
]

interface NotificationsSettingsClientProps {
  savedPreferences: NotificationPreferences
}

export function NotificationsSettingsClient({ savedPreferences }: NotificationsSettingsClientProps) {
  const [isPending, setIsPending] = useState(false)
  const toast = useToast()
  const [preferences, setPreferences] = useState(() => sanitizeNotifyPreferences(savedPreferences))

  const handleToggle = (key: NotifyEvent, type: NotifyChannel) => {
    if (!NOTIFY_AVAILABILITY[key][type]) return
    setPreferences((prev) => ({ ...prev, [key]: { ...prev[key], [type]: !prev[key][type] } }))
  }

  const setAll = (on: boolean) => {
    setPreferences(sanitizeNotifyPreferences(Object.fromEntries(PREFERENCE_CONFIGS.map((c) => [c.key, { email: on, push: on }]))))
  }

  const handleSave = async () => {
    setIsPending(true)
    try {
      const result = await saveNotificationPreferences(preferences)
      if (result.success) toast.success('Notifikationsindstillinger gemt')
      else toast.error(result.error || 'Kunne ikke gemme indstillinger')
    } catch {
      toast.error('Kunne ikke gemme indstillinger')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
        <p className="text-sm text-blue-800">
          E-mails sendes til din login-adresse, og kun for det du slår til her (alt er fra som standard). Push-notifikationer
          og daglig opsummering findes ikke endnu og er derfor markeret &quot;ikke tilgængelig&quot;.
        </p>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        <div className="p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-900">Notifikationspræferencer</h3>
        </div>

        <div className="p-4 bg-gray-50 grid grid-cols-[1fr,90px,90px] gap-4 text-sm font-medium text-gray-600">
          <div>Begivenhed</div>
          {CHANNELS.map((c) => <div key={c.key} className="text-center">{c.label}</div>)}
        </div>

        {PREFERENCE_CONFIGS.map((config) => {
          const pref = preferences[config.key]
          return (
            <div key={config.key} className="p-4 grid grid-cols-[1fr,90px,90px] gap-4 items-center">
              <div className="flex items-start gap-3">
                <div className="text-gray-500 mt-0.5">{config.icon}</div>
                <div>
                  <div className="font-medium text-gray-900">{config.label}</div>
                  <div className="text-sm text-gray-500">{config.description}</div>
                </div>
              </div>
              {CHANNELS.map((ch) => {
                const available = NOTIFY_AVAILABILITY[config.key][ch.key]
                if (!available) {
                  return (
                    <div key={ch.key} className="flex justify-center">
                      <span className="text-xs text-gray-400 text-center" data-testid={`notify-${config.key}-${ch.key}-na`}>ikke tilgængelig</span>
                    </div>
                  )
                }
                const on = pref[ch.key]
                return (
                  <div key={ch.key} className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(config.key, ch.key)}
                      aria-label={`${config.label} ${ch.label} ${on ? 'til' : 'fra'}`}
                      data-testid={`notify-${config.key}-${ch.key}`}
                      className={`w-10 h-6 rounded-full transition-colors relative ${on ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-medium text-gray-900 mb-3">Hurtige handlinger</h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAll(true)}>Aktiver alle tilgængelige</Button>
          <Button variant="outline" size="sm" onClick={() => setAll(false)}>Deaktiver alle</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gemmer...</>) : (<><Save className="w-4 h-4 mr-2" />Gem indstillinger</>)}
        </Button>
      </div>
    </div>
  )
}
