'use client'

/**
 * Sprint Ø6.2 — sikker e-conomic-opsætning.
 *
 * Viser KUN maskeret status (••••abcd), sidste test og testresultat.
 * Rå nøgler indtastes i password-felter og sendes direkte til en server
 * action der krypterer dem (AES-256-GCM) før lagring. Klienten modtager
 * aldrig en rå nøgle retur.
 */

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, BookCheck, KeyRound, PlugZap, Trash2, ShieldAlert, Loader2 } from 'lucide-react'
import {
  updateEconomicCredentialsAction,
  testEconomicConnectionAction,
  clearEconomicIntegrationAction,
  type EconomicIntegrationStatus,
} from '@/lib/actions/accounting'

const dkDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('da-DK', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    : '—'

export function EconomicSettingsClient({
  initial,
  canEdit,
}: {
  initial: EconomicIntegrationStatus
  canEdit: boolean
}) {
  const [status, setStatus] = useState(initial)
  const [apiToken, setApiToken] = useState('')
  const [grantToken, setGrantToken] = useState('')
  const [layout, setLayout] = useState(status.config_summary.layoutNumber?.toString() ?? '')
  const [paymentTerms, setPaymentTerms] = useState(status.config_summary.paymentTermsNumber?.toString() ?? '')
  const [vatZone, setVatZone] = useState(status.config_summary.vatZoneNumber?.toString() ?? '')
  const [autoBook, setAutoBook] = useState(status.config_summary.autoBookOnCreate)
  const [active, setActive] = useState(status.active)

  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const [clearing, startClear] = useTransition()
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const num = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const refresh = (patch: Partial<EconomicIntegrationStatus>) => setStatus((s) => ({ ...s, ...patch }))

  const handleSave = () => {
    setFlash(null)
    startSave(async () => {
      const res = await updateEconomicCredentialsAction({
        api_token: apiToken || undefined,
        agreement_grant_token: grantToken || undefined,
        active,
        config: {
          layoutNumber: num(layout),
          paymentTermsNumber: num(paymentTerms),
          vatZoneNumber: num(vatZone),
          autoBookOnCreate: autoBook,
        },
      })
      setFlash({ ok: res.ok, text: res.message })
      if (res.ok) {
        // Ryd password-felter, vis at nøgler nu er sat (uden at kende værdien).
        setApiToken('')
        setGrantToken('')
        refresh({
          configured: !!res.configured,
          active,
          api_token_masked: status.api_token_masked ?? '••••••••',
          grant_token_masked: status.grant_token_masked ?? '••••••••',
          config_summary: {
            layoutNumber: num(layout),
            paymentTermsNumber: num(paymentTerms),
            vatZoneNumber: num(vatZone),
            autoBookOnCreate: autoBook,
          },
        })
      }
    })
  }

  const handleTest = () => {
    setTestResult(null)
    startTest(async () => {
      const res = await testEconomicConnectionAction()
      setTestResult({ ok: res.ok, text: res.message })
      refresh({
        last_tested_at: res.tested_at ?? status.last_tested_at,
        last_test_ok: res.status === 'not_configured' ? status.last_test_ok : res.ok,
        last_test_message: res.message,
      })
    })
  }

  const handleClear = () => {
    if (!window.confirm('Ryd e-conomic-integrationen? Nøglerne slettes og bulk-eksport låses indtil den sættes op igen.')) return
    setFlash(null)
    startClear(async () => {
      const res = await clearEconomicIntegrationAction()
      setFlash({ ok: res.ok, text: res.message })
      if (res.ok) {
        setApiToken('')
        setGrantToken('')
        setActive(false)
        setTestResult(null)
        refresh({
          configured: false,
          active: false,
          api_token_masked: null,
          grant_token_masked: null,
          last_tested_at: null,
          last_test_ok: null,
          last_test_message: null,
        })
      }
    })
  }

  const busy = saving || testing || clearing
  const hasKeys = !!status.api_token_masked && !!status.grant_token_masked

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookCheck className="w-6 h-6 text-emerald-600" />
          Regnskab (e-conomic)
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Opsæt integrationen sikkert. Nøgler krypteres (AES-256-GCM) og vises aldrig i klartekst.
        </p>
      </div>

      {/* Status-kort */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-3">
        {status.configured ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">Integration aktiv og konfigureret</span>
          </div>
        ) : (
          <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <strong>e-conomic er ikke opsat endnu.</strong> Når nøglerne er gemt og aktive,
            låses bulk-eksport i fakturaoverblikket automatisk op.
          </div>
        )}

        <div className="text-sm divide-y divide-gray-100">
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">App-hemmelighed (X-AppSecretToken)</span>
            <span className="font-mono text-gray-900">{status.api_token_masked ?? '— ikke sat —'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Aftale-token (X-AgreementGrantToken)</span>
            <span className="font-mono text-gray-900">{status.grant_token_masked ?? '— ikke sat —'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Status</span>
            <span className="font-medium text-gray-900">{status.active ? 'Aktiv' : 'Ikke aktiv'}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Senest synkroniseret</span>
            <span className="font-medium text-gray-900">{dkDateTime(status.last_sync_at)}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-gray-500">Senest testet</span>
            <span className="font-medium text-gray-900">
              {status.last_tested_at ? (
                <span className={status.last_test_ok ? 'text-emerald-700' : 'text-red-700'}>
                  {dkDateTime(status.last_tested_at)} · {status.last_test_ok ? 'OK' : 'fejl'}
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>
      </div>

      {!status.encryption_ready && (
        <div className="rounded-lg ring-1 ring-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Kryptering er ikke konfigureret</strong> (ENCRYPTION_KEY mangler). Nøgler kan
            ikke gemmes sikkert, før den er sat i miljøet.
          </span>
        </div>
      )}

      {flash && (
        <div className={`rounded-lg px-3 py-2 text-sm ring-1 ${flash.ok ? 'bg-emerald-50 ring-emerald-200 text-emerald-900' : 'bg-red-50 ring-red-200 text-red-900'}`}>
          {flash.text}
        </div>
      )}

      {canEdit && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-800">
            <KeyRound className="w-4 h-4 text-gray-500" /> Adgangsnøgler
          </h2>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">App-hemmelighed (X-AppSecretToken)</span>
              <input
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={hasKeys ? 'Lad stå tom for at bevare nuværende' : 'Indtast app-hemmelighed'}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                disabled={busy}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Aftale-token (X-AgreementGrantToken)</span>
              <input
                type="password"
                autoComplete="off"
                value={grantToken}
                onChange={(e) => setGrantToken(e.target.value)}
                placeholder={hasKeys ? 'Lad stå tom for at bevare nuværende' : 'Indtast aftale-token'}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                disabled={busy}
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Faktura-layout</span>
              <input type="number" value={layout} onChange={(e) => setLayout(e.target.value)} disabled={busy}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Betalingsbet. (nr.)</span>
              <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={busy}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Momszone (nr.)</span>
              <input type="number" value={vatZone} onChange={(e) => setVatZone(e.target.value)} disabled={busy}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={autoBook} onChange={(e) => setAutoBook(e.target.checked)} disabled={busy} />
              Auto-bogfør ved oprettelse
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} />
              Aktiv
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy || !status.encryption_ready}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Gem opsætning
            </button>
            <button
              onClick={handleTest}
              disabled={busy || !hasKeys}
              className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title={hasKeys ? 'Test forbindelsen mod e-conomic' : 'Gem nøgler først'}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              Test forbindelse
            </button>
            <button
              onClick={handleClear}
              disabled={busy || !hasKeys}
              className="inline-flex items-center gap-1.5 rounded-md ring-1 ring-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 ml-auto"
            >
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Ryd integration
            </button>
          </div>

          {testResult && (
            <div className={`rounded-md px-3 py-2 text-sm flex items-center gap-2 ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.text}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Kun salgs-/fakturadata overføres til regnskab — ingen intern kost, margin eller dækningsbidrag.
        Nøgler vises aldrig i klartekst, logs eller revisionsspor.
      </p>
    </div>
  )
}
