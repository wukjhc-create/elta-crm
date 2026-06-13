'use client'

/**
 * Sprint Ø3.7 — Editor for faktura-/rykkertekster + afsenderidentitet.
 *
 * Kontoret kan se, tilpasse og preview'e de tekster der sendes til
 * kunderne. Tomme felter → kodestandard (vist som placeholder). Preview
 * sender ALDRIG mail — den interpolerer kun eksempel-variabler.
 *
 * Cost-free: kun kundevendte variabler. Ingen kost/margin/DB.
 */

import { useMemo, useState, useTransition } from 'react'
import { AlertCircle, Eye, Info, Loader2, Mail, Save, Send, User } from 'lucide-react'
import {
  DEFAULT_INVOICE_EMAIL_CONFIG,
  TEMPLATE_HEADLINES,
  TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  buildSampleVars,
  renderTemplate,
  type InvoiceEmailConfig,
  type InvoiceTemplateKey,
} from '@/lib/email/invoice-email-config'
import {
  updateInvoiceEmailConfig,
  sendInvoiceEmailTestAction,
} from '@/lib/actions/settings'

const TEMPLATE_KEYS: InvoiceTemplateKey[] = ['invoice', 'reminder1', 'reminder2', 'reminder3']

export function InvoiceEmailSettingsClient({
  initial,
  canManage,
  userEmail = '',
}: {
  initial: InvoiceEmailConfig
  canManage: boolean
  userEmail?: string
}) {
  const [cfg, setCfg] = useState<InvoiceEmailConfig>(initial)
  const [pending, startTransition] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)

  // Sprint Ø3.8 — testmail-modtager (default = egen email). ALDRIG kunde.
  const [testRecipient, setTestRecipient] = useState(userEmail)
  const [testingKey, setTestingKey] = useState<InvoiceTemplateKey | null>(null)
  const [testPending, startTestTransition] = useTransition()

  const sampleVars = useMemo(() => buildSampleVars(), [])

  const handleSendTest = (key: InvoiceTemplateKey) => {
    if (!canManage) return
    setTestingKey(key)
    startTestTransition(async () => {
      const res = await sendInvoiceEmailTestAction({
        template: key,
        recipient: testRecipient.trim() || null,
      })
      setTestingKey(null)
      setFlash({ ok: res.ok, text: res.message })
      setTimeout(() => setFlash(null), 8000)
    })
  }

  const setField = (key: InvoiceTemplateKey, field: 'subject' | 'body', value: string) => {
    setCfg((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const handleSave = () => {
    if (!canManage) return
    startTransition(async () => {
      const res = await updateInvoiceEmailConfig(cfg)
      setFlash(
        res.success
          ? { ok: true, text: 'Faktura- og rykkertekster gemt.' }
          : { ok: false, text: res.error ?? 'Kunne ikke gemme.' }
      )
      if (res.success && res.data) setCfg(res.data)
      setTimeout(() => setFlash(null), 6000)
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Faktura- og rykkertekster</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Tilpas de mails der sendes til kunderne ved faktura og betalingspåmindelser.
          Tomme felter bruger systemets standardtekst automatisk.
        </p>
      </div>

      {!canManage && (
        <div className="rounded ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Du kan se teksterne, men mangler adgang (settings.manage) til at gemme ændringer.
        </div>
      )}

      {flash && (
        <div
          className={`text-sm rounded px-3 py-2 ring-1 ${
            flash.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'
          }`}
        >
          {flash.text}
        </div>
      )}

      {/* Variabel-hjælp */}
      <div className="rounded-lg ring-1 ring-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">
          <Info className="w-3.5 h-3.5" />
          Tilgængelige variabler (indsæt med dobbelte tuborgklammer)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <span
              key={v.token}
              className="inline-flex items-center gap-1 text-[11px] bg-white ring-1 ring-gray-200 rounded px-1.5 py-0.5"
              title={v.label}
            >
              <code className="text-emerald-700">{`{{${v.token}}}`}</code>
              <span className="text-gray-400">{v.label}</span>
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">
          Ukendte eller manglende variabler fjernes automatisk — kunden ser aldrig rå{' '}
          <code>{'{{variabel}}'}</code>.
        </p>
      </div>

      {/* Afsender */}
      <section className="rounded-lg ring-1 ring-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          Afsender
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Afsendernavn</label>
            <input
              type="text"
              value={cfg.sender_name ?? ''}
              onChange={(e) => setCfg((p) => ({ ...p, sender_name: e.target.value }))}
              disabled={!canManage}
              placeholder="Fx Elta Solar – Bogholderi"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-500">Vises som afsendernavn i kundens indbakke.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Svar-til email (reply-to)</label>
            <input
              type="email"
              value={cfg.reply_to ?? ''}
              onChange={(e) => setCfg((p) => ({ ...p, reply_to: e.target.value }))}
              disabled={!canManage}
              placeholder="kontakt@eltasolar.dk"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Hvor kundens svar lander. Tom = systemets standard-postkasse.
            </p>
          </div>
        </div>
      </section>

      {/* Testmail-modtager */}
      <section className="rounded-lg ring-1 ring-blue-200 bg-blue-50/50 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" />
          Send testmail
        </h2>
        <p className="text-xs text-gray-600">
          Send en testmail af hver tekst til dig selv og se den i en rigtig indbakke,
          før den bruges til kunder. Testmailen bruger <strong>eksempeldata</strong>,
          markeres med <strong>[TEST]</strong> i emnet, og påvirker{' '}
          <strong>ingen rigtige fakturaer</strong> — ingen kunde modtager den.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Testmail sendes til</label>
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              disabled={!canManage}
              placeholder="din@email.dk"
              className="border rounded px-2 py-1.5 text-sm w-72 bg-white"
            />
          </div>
          <p className="text-[11px] text-gray-500 pb-1.5">
            Standard = din egen email. Brug knappen ved hver tekst nedenfor.
          </p>
        </div>
      </section>

      {/* Templates */}
      {TEMPLATE_KEYS.map((key) => (
        <TemplateEditor
          key={key}
          tKey={key}
          subject={cfg[key]?.subject ?? ''}
          body={cfg[key]?.body ?? ''}
          onChange={(field, value) => setField(key, field, value)}
          canManage={canManage}
          sampleVars={sampleVars}
          onSendTest={() => handleSendTest(key)}
          testing={testPending && testingKey === key}
          testRecipient={testRecipient.trim() || userEmail}
        />
      ))}

      <div className="flex justify-end sticky bottom-0 bg-gradient-to-t from-white to-transparent py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canManage || pending}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          title={!canManage ? 'Kræver settings.manage' : undefined}
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Gem tekster
        </button>
      </div>
    </div>
  )
}

function TemplateEditor({
  tKey,
  subject,
  body,
  onChange,
  canManage,
  sampleVars,
  onSendTest,
  testing,
  testRecipient,
}: {
  tKey: InvoiceTemplateKey
  subject: string
  body: string
  onChange: (field: 'subject' | 'body', value: string) => void
  canManage: boolean
  sampleVars: ReturnType<typeof buildSampleVars>
  onSendTest: () => void
  testing: boolean
  testRecipient: string
}) {
  const def = DEFAULT_INVOICE_EMAIL_CONFIG[tKey]
  // Preview = det der faktisk sendes: override hvis udfyldt, ellers standard.
  const effSubject = subject.trim() || def.subject
  const effBody = body.trim() || def.body
  const previewSubject = renderTemplate(effSubject, sampleVars)
  const previewBody = renderTemplate(effBody, sampleVars)
  const usingDefault = !subject.trim() && !body.trim()

  return (
    <section className="rounded-lg ring-1 ring-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-500" />
          {TEMPLATE_LABELS[tKey]}
        </h2>
        <div className="flex items-center gap-2">
          {usingDefault && (
            <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              Bruger standardtekst
            </span>
          )}
          <button
            type="button"
            onClick={onSendTest}
            disabled={!canManage || testing}
            title={
              canManage
                ? `Sender [TEST]-mail af "${TEMPLATE_LABELS[tKey]}" til ${testRecipient || 'din email'} — ingen kunde rammes`
                : 'Kræver settings.manage'
            }
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded ring-1 ring-blue-300 text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-60"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send testmail
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
        {/* Editor */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Emne</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => onChange('subject', e.target.value)}
              disabled={!canManage}
              placeholder={def.subject}
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Brødtekst</label>
            <textarea
              value={body}
              onChange={(e) => onChange('body', e.target.value)}
              disabled={!canManage}
              placeholder={def.body}
              rows={6}
              className="w-full border rounded px-2 py-1.5 text-sm font-mono leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Adskil afsnit med en tom linje. Fakturadetaljer (nr., beløb, forfald) indsættes
              automatisk under brødteksten.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            Preview (eksempeldata — sender ikke)
          </div>
          <div className="rounded-lg ring-1 ring-gray-200 overflow-hidden text-sm">
            <div className="bg-emerald-700 text-white px-4 py-2.5">
              <div className="text-[15px] font-semibold">{TEMPLATE_HEADLINES[tKey]}</div>
            </div>
            <div className="px-4 py-3 bg-white space-y-2">
              <div className="text-[11px] text-gray-400">
                <strong className="text-gray-600">Emne:</strong> {previewSubject}
              </div>
              <p className="text-gray-800">Kære {sampleVars.customer_name},</p>
              {previewBody.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-gray-700 whitespace-pre-line">
                  {para}
                </p>
              ))}
              <div className="rounded bg-gray-50 ring-1 ring-gray-100 px-3 py-2 text-[12px] text-gray-600">
                <div className="flex justify-between"><span>Fakturanummer</span><strong>{sampleVars.invoice_number}</strong></div>
                <div className="flex justify-between"><span>Beløb</span><strong>{sampleVars.amount}</strong></div>
                <div className="flex justify-between"><span>Forfaldsdato</span><span>{sampleVars.due_date}</span></div>
              </div>
              <p className="text-[12px] text-gray-500 pt-1">
                Med venlig hilsen,<br />
                <strong>{sampleVars.company_name}</strong>
              </p>
            </div>
          </div>
          {previewBody.includes('{{') || previewSubject.includes('{{') ? (
            <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Ukendt variabel registreret — tjek stavning.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
