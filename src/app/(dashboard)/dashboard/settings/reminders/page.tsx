'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Clock, Save, Loader2, Mail, ToggleLeft, ToggleRight, Send, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { sendTestReminder } from '@/lib/actions/reminder-test'

interface ReminderSettings {
  reminder_enabled: boolean
  reminder_interval_days: number
  reminder_max_count: number
  reminder_email_subject: string | null
}

export default function ReminderSettingsPage() {
  const [settings, setSettings] = useState<ReminderSettings>({
    reminder_enabled: true,
    reminder_interval_days: 3,
    reminder_max_count: 3,
    reminder_email_subject: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('company_settings')
        .select('reminder_enabled, reminder_interval_days, reminder_max_count, reminder_email_subject')
        .limit(1)
        .maybeSingle()

      if (data) {
        setSettings({
          reminder_enabled: data.reminder_enabled ?? true,
          reminder_interval_days: data.reminder_interval_days ?? 3,
          reminder_max_count: data.reminder_max_count ?? 3,
          reminder_email_subject: data.reminder_email_subject,
        })
      }
      setIsLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    const supabase = createClient()
    await supabase
      .from('company_settings')
      .update({
        reminder_enabled: settings.reminder_enabled,
        reminder_interval_days: settings.reminder_interval_days,
        reminder_max_count: settings.reminder_max_count,
        reminder_email_subject: settings.reminder_email_subject || null,
      })
      .not('id', 'is', null)
    setIsSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestReminder = async () => {
    setTestStatus('sending')
    setTestMessage('')
    const result = await sendTestReminder()
    if (result.success) {
      setTestStatus('success')
      setTestMessage(`Test-rykker sendt til ${result.to}`)
    } else {
      setTestStatus('error')
      setTestMessage(result.error || 'Ukendt fejl')
    }
    setTimeout(() => setTestStatus('idle'), 8000)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Opfølgning</h1>
        </div>
        <div className="bg-white rounded-lg border p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Automatisk Opfølgning</h1>
          <p className="text-gray-500 text-sm">Konfigurer rykkermails til ubesvarede tilbud</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {/* Enable/Disable */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-medium">Automatisk opfølgning</h3>
              <p className="text-sm text-gray-500">Send rykkermails til kunder der ikke har svaret</p>
            </div>
          </div>
          <button
            onClick={() => setSettings({ ...settings, reminder_enabled: !settings.reminder_enabled })}
            className="text-2xl"
          >
            {settings.reminder_enabled
              ? <ToggleRight className="w-10 h-10 text-green-600" />
              : <ToggleLeft className="w-10 h-10 text-gray-300" />
            }
          </button>
        </div>

        {/* Interval */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Send rykker efter antal dage uden svar
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={30}
              value={settings.reminder_interval_days}
              onChange={(e) => setSettings({ ...settings, reminder_interval_days: parseInt(e.target.value) || 3 })}
              className="w-24 px-3 py-2 border rounded-md text-center text-lg font-semibold"
              disabled={!settings.reminder_enabled}
            />
            <span className="text-gray-600">dage</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Systemet tjekker dagligt kl. 9 og sender rykkere til tilbud der har ventet i mindst dette antal dage.</p>
        </div>

        {/* Max count */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Maksimalt antal rykkere per tilbud
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={10}
              value={settings.reminder_max_count}
              onChange={(e) => setSettings({ ...settings, reminder_max_count: parseInt(e.target.value) || 3 })}
              className="w-24 px-3 py-2 border rounded-md text-center text-lg font-semibold"
              disabled={!settings.reminder_enabled}
            />
            <span className="text-gray-600">rykkere</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Efter dette antal stopper systemet med at sende rykkere automatisk.</p>
        </div>

        {/* Email subject */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Mail className="w-4 h-4 inline mr-1" />
            E-mail emne (valgfrit)
          </label>
          <input
            type="text"
            value={settings.reminder_email_subject || ''}
            onChange={(e) => setSettings({ ...settings, reminder_email_subject: e.target.value || null })}
            placeholder="Påmindelse: Dit tilbud fra Elta Solar"
            className="w-full px-3 py-2 border rounded-md"
            disabled={!settings.reminder_enabled}
          />
          <p className="text-xs text-gray-400 mt-2">Tilbudsnummeret tilføjes automatisk i parenteser. Lad feltet være tomt for standardtekst.</p>
        </div>
      </div>

      {/* Test button */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              <Send className="w-4 h-4 text-green-600" />
              Send test-rykker til mig selv
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Sender en test-rykkermail til din egen e-mail, så du kan se det endelige design.
            </p>
          </div>
          <button
            onClick={handleTestReminder}
            disabled={testStatus === 'sending'}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium whitespace-nowrap"
          >
            {testStatus === 'sending' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sender...</>
            ) : (
              <><Send className="w-4 h-4" /> Send test-rykker</>
            )}
          </button>
        </div>

        {/* Test result */}
        {testStatus === 'success' && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {testMessage}
          </div>
        )}
        {testStatus === 'error' && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Fejl:</strong> {testMessage}
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>Sådan virker det:</strong> Systemet checker dagligt kl. 9:00 om der er tilbud med status &ldquo;Sendt&rdquo; eller &ldquo;Set&rdquo;
        der ikke har fået svar. Hvis tilbuddet har ventet i mindst {settings.reminder_interval_days} dage,
        sendes en venlig rykkermail automatisk. Kunden kan se tilbuddet og svare direkte via linket.
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {isSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Gemmer...</>
          ) : saved ? (
            <><Save className="w-4 h-4" /> Gemt!</>
          ) : (
            <><Save className="w-4 h-4" /> Gem indstillinger</>
          )}
        </button>
      </div>
    </div>
  )
}
