'use client'

import { useState, useTransition } from 'react'
import {
  getGoLiveStatus,
  toggleRuleDryRunAction,
  testEconomicAction,
  testBankImportAction,
  runEmailSyncNowAction,
  runInvoiceRemindersNowAction,
  type ActionOutcome,
  type GoLiveStatus,
} from '@/lib/actions/go-live'
import { Button } from '@/components/ui/button'

const fmtTime = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'lige nu'
  if (min < 60) return `${min} min siden`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} t siden`
  return `${Math.floor(h / 24)} d siden`
}

type LogLine = { ok: boolean; label: string; message: string; at: string }

export function GoLiveClient({ initialStatus }: { initialStatus: GoLiveStatus }) {
  const [status, setStatus] = useState<GoLiveStatus>(initialStatus)
  const [busy, startTransition] = useTransition()
  const [log, setLog] = useState<LogLine[]>([])

  const refresh = async () => {
    const next = await getGoLiveStatus()
    setStatus(next)
  }

  const run = async (label: string, fn: () => Promise<ActionOutcome>) => {
    startTransition(async () => {
      const r = await fn()
      setLog((prev) => [
        { ok: r.ok, label, message: r.message, at: new Date().toISOString() },
        ...prev,
      ].slice(0, 20))
      await refresh()
    })
  }

  const isAdmin = status.current_user.is_admin
  const writeDisabled = busy || !isAdmin

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Go-Live Admin</h1>
          <p className="text-xs text-gray-500">
            Status og kontrol over produktionsklarhed · sidst opdateret {fmtTime(status.generated_at)}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={busy}>Opdater</Button>
      </div>

      {!isAdmin && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-900">
          <strong>Læseadgang:</strong> Du ser status, men kun brugere med rollen <code>admin</code> kan toggle regler eller køre handlinger.
          {status.current_user.role && <> Din rolle: <code>{status.current_user.role}</code>.</>}
        </div>
      )}

      {/* ---------- Status grid ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatusCard
          title="e-conomic"
          tone={
            status.economic.configured && status.economic.active
              ? 'ok'
              : status.economic.configured
              ? 'warning'
              : 'error'
          }
          lines={[
            `Konfigureret: ${status.economic.configured ? 'ja' : 'nej'}`,
            `Active: ${status.economic.active ? 'ja' : 'nej'}`,
            `Sidste sync: ${fmtTime(status.economic.last_sync_at)}`,
          ]}
          actions={
            <Button size="sm" variant="outline"
              onClick={() => run('Test e-conomic', testEconomicAction)} disabled={writeDisabled}>
              Test e-conomic
            </Button>
          }
        />

        <StatusCard
          title="Autopilot regler"
          tone={status.autopilot.live_count > 0 ? 'warning' : 'ok'}
          lines={[
            `${status.autopilot.dry_run_count} dry_run · ${status.autopilot.live_count} LIVE`,
            `Total regler: ${status.autopilot.rules.length}`,
          ]}
        />

        <StatusCard
          title="Bank import"
          tone={
            status.bank.total_transactions === 0
              ? 'warning'
              : status.bank.unmatched_count + status.bank.ambiguous_count > 0
              ? 'warning'
              : 'ok'
          }
          lines={[
            `Total: ${status.bank.total_transactions}`,
            `Sidst importeret: ${fmtTime(status.bank.last_imported_at)}`,
            `Umatchede: ${status.bank.unmatched_count} · ambiguous: ${status.bank.ambiguous_count}`,
          ]}
          actions={
            <Button size="sm" variant="outline"
              onClick={() => run('Test bank import', testBankImportAction)} disabled={writeDisabled}>
              Tjek bank-status
            </Button>
          }
        />

        <StatusCard
          title="Email sync"
          tone={
            status.email_sync.last_status === 'failed'
              ? 'error'
              : status.email_sync.last_sync_at
              ? 'ok'
              : 'warning'
          }
          lines={[
            `Mailboxes: ${status.email_sync.mailbox_count}`,
            `Status: ${status.email_sync.last_status ?? '—'}`,
            `Sidste sync: ${fmtTime(status.email_sync.last_sync_at)}`,
          ]}
          actions={
            <Button size="sm" onClick={() => run('Run email sync', runEmailSyncNowAction)} disabled={writeDisabled}>
              Kør email sync nu
            </Button>
          }
        />

        <StatusCard
          title="Invoice reminder cron"
          tone={status.invoice_reminder_cron.last_run_at ? 'ok' : 'warning'}
          lines={[
            `Sidste kørsel: ${fmtTime(status.invoice_reminder_cron.last_run_at)}`,
            `Sendt sidste 24 t: ${status.invoice_reminder_cron.last_24h_sent}`,
          ]}
          actions={
            <Button size="sm" onClick={() => run('Run invoice reminders', runInvoiceRemindersNowAction)} disabled={writeDisabled}>
              Kør rykker-tjek nu
            </Button>
          }
        />

        <StatusCard
          title="System fejl (24t)"
          tone={
            status.system_errors_last_24h > 5
              ? 'error'
              : status.system_errors_last_24h > 0
              ? 'warning'
              : 'ok'
          }
          lines={[`${status.system_errors_last_24h} fejl-rækker i system_health_log`]}
        />
      </div>

      {/* ---------- Autopilot rule list ---------- */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h2 className="text-sm font-semibold mb-3">Autopilot regler</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-1 pr-3">Navn</th>
                <th className="py-1 pr-3">Trigger</th>
                <th className="py-1 pr-3">Action</th>
                <th className="py-1 pr-3">Active</th>
                <th className="py-1 pr-3">Mode</th>
                <th className="py-1 pr-3">Skift</th>
              </tr>
            </thead>
            <tbody>
              {status.autopilot.rules.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-gray-400">Ingen regler.</td></tr>
              )}
              {status.autopilot.rules.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-gray-600">{r.trigger}</td>
                  <td className="py-2 pr-3 text-gray-600">{r.action}</td>
                  <td className="py-2 pr-3">{r.active ? 'ja' : 'nej'}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      r.dry_run ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {r.dry_run ? 'dry_run' : 'LIVE'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <Button
                      size="sm"
                      variant={r.dry_run ? 'default' : 'outline'}
                      disabled={writeDisabled}
                      onClick={() =>
                        run(
                          r.dry_run ? `Sæt LIVE: ${r.name}` : `Sæt dry_run: ${r.name}`,
                          () => toggleRuleDryRunAction(r.id, !r.dry_run)
                        )
                      }
                    >
                      {r.dry_run ? 'Sæt LIVE' : 'Sæt dry_run'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Action log ---------- */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">
        <h2 className="text-sm font-semibold mb-3">Handlinger (senest øverst)</h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-400">Ingen handlinger kørt i denne session.</p>
        ) : (
          <div className="space-y-2">
            {log.map((entry, i) => (
              <div key={i} className={`text-sm rounded px-3 py-2 ring-1 ${
                entry.ok
                  ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
                  : 'bg-red-50 ring-red-200 text-red-900'
              }`}>
                <div className="font-medium">{entry.label}</div>
                <div className="text-xs">{entry.message}</div>
                <div className="text-[11px] opacity-70 mt-0.5">{fmtTime(entry.at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusCard({
  title,
  lines,
  tone,
  actions,
}: {
  title: string
  lines: string[]
  tone: 'ok' | 'warning' | 'error'
  actions?: React.ReactNode
}) {
  const ringTone =
    tone === 'ok' ? 'ring-emerald-200'
    : tone === 'warning' ? 'ring-amber-200'
    : 'ring-red-200'
  const dotTone =
    tone === 'ok' ? 'bg-emerald-500'
    : tone === 'warning' ? 'bg-amber-500'
    : 'bg-red-500'
  return (
    <div className={`p-4 rounded-lg bg-white ring-1 ${ringTone}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dotTone}`} />
          {title}
        </h3>
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="text-xs text-gray-700">{l}</div>
        ))}
      </div>
      {actions && <div className="mt-3">{actions}</div>}
    </div>
  )
}
