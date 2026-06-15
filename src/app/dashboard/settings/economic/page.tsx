import { Metadata } from 'next'
import { CheckCircle2, XCircle, BookCheck } from 'lucide-react'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getEconomicIntegrationStatusAction } from '@/lib/actions/accounting'

export const metadata: Metadata = {
  title: 'Regnskab (e-conomic)',
  description: 'Status for regnskabsintegration',
}

export const dynamic = 'force-dynamic'

export default async function EconomicSettingsPage() {
  if (!(await pageHasPermission('settings.economic'))) {
    return <NoAccess permission="settings.economic" />
  }
  const s = await getEconomicIntegrationStatusAction()

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-1.5 border-b border-gray-100 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookCheck className="w-6 h-6 text-emerald-600" />
          Regnskab (e-conomic)
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Status for regnskabsintegrationen. Hemmelige nøgler vises aldrig her.
        </p>
      </div>

      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5">
        {s.configured ? (
          <div className="flex items-center gap-2 text-emerald-700 mb-3">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">Integration aktiv og konfigureret</span>
          </div>
        ) : (
          <div className="rounded-lg ring-1 ring-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 mb-3">
            <strong>e-conomic er ikke opsat endnu.</strong> Integrationens
            adgangsnøgler konfigureres af en administrator. Når den er aktiv,
            kan fakturaer eksporteres fra den enkelte fakturas side.
          </div>
        )}

        <Row label="Udbyder" value="e-conomic" />
        <Row label="Status" value={s.active ? 'Aktiv' : 'Ikke aktiv'} />
        <Row
          label="Senest synkroniseret"
          value={
            s.last_sync_at
              ? new Intl.DateTimeFormat('da-DK', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                }).format(new Date(s.last_sync_at))
              : '—'
          }
        />
        <Row label="Faktura-layout" value={s.config_summary.layoutNumber?.toString() ?? '—'} />
        <Row label="Betalingsbetingelser (nr.)" value={s.config_summary.paymentTermsNumber?.toString() ?? '—'} />
        <Row label="Momszone (nr.)" value={s.config_summary.vatZoneNumber?.toString() ?? '—'} />
        <Row label="Auto-bogfør ved oprettelse" value={s.config_summary.autoBookOnCreate ? 'Ja' : 'Nej'} />
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <XCircle className="w-3 h-3" />
        Kun salgs-/fakturadata overføres til regnskab — ingen intern kost, margin eller dækningsbidrag.
      </p>
    </div>
  )
}
