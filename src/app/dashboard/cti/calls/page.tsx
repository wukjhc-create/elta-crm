import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { listTelephonyCalls } from '@/lib/actions/telephony-calls'
import { formatPhoneForDisplay } from '@/lib/integrations/relatel/phone'
import { CALLBACK_RULES } from '@/lib/integrations/telephony/callback-plan'
import { CallMatchActions } from './call-match-actions'

export const metadata: Metadata = { title: 'Opkaldshistorik' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { ringing: 'Ringer', answered: 'Besvaret', ended: 'Afsluttet', missed: 'Ubesvaret', voicemail: 'Telefonsvarer' }
const MATCH_LABEL: Record<string, string> = { unmatched: 'Ukendt', suggested: 'Forslag', ambiguous: 'Flere mulige kunder', confirmed: 'Bekræftet', rejected: 'Afvist' }

/**
 * Relatel-review 2026-11-15: operationel opkaldsliste over 00247-data (telephony_calls). Læser via listTelephonyCalls
 * (calls.view/calls.view_unmatched + RLS + kolonne-grant; forslag/sag kun når brugeren selv kan se dem). Ingen ny
 * forretningslogik: kunde bekræftes/afvises via de eksisterende handlinger; tilbageringning oprettes på opkaldskortet
 * (/dashboard/cti?number=…) via den kanoniske opgave-handling (idempotent pr. kunde). Der ringes ikke herfra.
 */
export default async function CallHistoryPage() {
  const perms = await getPageRoleContext()
  if (!perms.has('calls.view') && !perms.has('calls.view_unmatched')) return <NoAccess permission="calls.view" />
  const canMatch = perms.has('calls.match')
  const res = await listTelephonyCalls({ limit: 100 })

  const supabase = await createClient()
  const customerIds = [...new Set(res.calls.map((c) => c.customer?.id).filter(Boolean) as string[])]
  const employeeIds = [...new Set(res.calls.map((c) => c.employee_profile_id).filter(Boolean) as string[])]
  let openCallbacks = new Set<string>()
  let callbacksFailed = false
  if (customerIds.length) {
    const { data, error } = await supabase.from('customer_tasks').select('customer_id').in('customer_id', customerIds)
      .in('auto_rule', [...CALLBACK_RULES]).neq('status', 'done')
    if (error) callbacksFailed = true
    else openCallbacks = new Set(((data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id))
  }
  let people = new Map<string, string>()
  if (employeeIds.length) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', employeeIds)
    people = new Map(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? 'Medarbejder']))
  }
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '—')

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Opkaldshistorik</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard/cti/queue" className="text-blue-700 hover:underline">Tilbageringninger</Link>
          <Link href="/dashboard/cti" className="text-blue-700 hover:underline">Slå et nummer op</Link>
        </div>
      </div>
      <p className="text-sm text-gray-600">Opkald modtaget fra Relatel. Ingen kunde kobles automatisk — et forslag skal bekræftes. Der ringes ikke herfra.</p>
      {!res.available && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{res.error ?? 'Opkaldshistorik er ikke slået til.'}</p>}
      {res.available && res.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Opkald kunne ikke hentes. Det betyder ikke, at der er nul opkald.</p>
      )}
      {callbacksFailed && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tilbageringningsstatus kunne ikke læses.</p>}
      {res.available && !res.error && res.calls.length === 0 && <p className="text-sm text-gray-600">Ingen opkald endnu.</p>}
      {res.calls.length > 0 && (
        <ul className="divide-y rounded-lg border bg-white">
          {res.calls.map((c) => {
            const number = c.number ? formatPhoneForDisplay(c.number) : 'Skjult nummer'
            const status = STATUS_LABEL[c.status] ?? c.status
            const callback = c.customer ? (callbacksFailed ? 'ukendt' : openCallbacks.has(c.customer.id) ? 'åben tilbageringning' : 'ingen åben tilbageringning') : null
            return (
              <li key={c.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="font-medium text-gray-900">
                      {c.direction === 'outbound' ? 'Udgående til' : c.direction === 'inbound' ? 'Indgående fra' : 'Opkald'} {number}
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${c.missed ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{status}</span>
                    </p>
                    <p className="text-gray-500">
                      {fmt(c.started_at)}
                      {c.duration_seconds != null ? ` · ${Math.round(c.duration_seconds / 60)} min` : ''}
                      {c.has_voicemail ? ` · telefonsvarer${c.voicemail_duration_seconds != null ? ` (${c.voicemail_duration_seconds} s)` : ''}` : ''}
                      {' · '}{c.employee_profile_id ? (people.get(c.employee_profile_id) ?? 'Medarbejder') : 'Medarbejder ukendt'}
                    </p>
                    <p className="text-gray-600">
                      {c.customer
                        ? <>Kunde: <Link href={`/dashboard/customers/${c.customer.id}`} className="text-blue-700 hover:underline">{c.customer.name}</Link></>
                        : <>Match: {MATCH_LABEL[c.match_status] ?? c.match_status}{c.suggestion ? ` — ${c.suggestion.name}` : ''}{c.match_status === 'ambiguous' && c.candidate_count ? ` (${c.candidate_count})` : ''}</>}
                      {c.service_case_id && <> · <Link href={`/dashboard/orders/${c.service_case_id}`} className="text-blue-700 hover:underline">sag</Link></>}
                      {callback && ` · ${callback}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.number && <Link href={`/dashboard/cti?number=${c.number}`} className="text-blue-700 hover:underline">Opkaldskort / tilbageringning</Link>}
                    {canMatch && <CallMatchActions callId={c.id} version={c.match_version} suggestion={c.suggestion} confirmed={!!c.customer} matchStatus={c.match_status} />}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
