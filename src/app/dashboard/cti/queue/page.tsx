import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const metadata: Metadata = { title: 'Tilbageringninger' }
export const dynamic = 'force-dynamic'

const RULES = ['assistant_missed_call', 'assistant_callback']

/**
 * Åbne tilbageringninger fra CRM-opgaver. Læser ikke Relatel.
 * En læsefejl vises som fejl — ikke som en tom kø.
 */
export default async function CallbackQueuePage() {
  if (!(await pageHasPermission('customers.view'))) return <NoAccess permission="customers.view" />
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customer_tasks')
    .select('id, title, description, status, due_date, customer_id, service_case_id, created_at, auto_rule, assigned_to')
    .in('auto_rule', RULES)
    .neq('status', 'done')
    .order('due_date', { ascending: true })
    .limit(100)

  const rows = (data ?? []) as Array<{
    id: string
    title: string
    description: string | null
    status: string
    due_date: string | null
    customer_id: string
    service_case_id: string | null
    created_at: string
    auto_rule: string
    assigned_to: string | null
  }>
  const customerIds = [...new Set(rows.map((r) => r.customer_id))]
  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean) as string[])]
  let names = new Map<string, string>()
  let people = new Map<string, string>()
  let namesFailed = false
  let peopleFailed = false
  if (!error && customerIds.length) {
    const cust = await supabase.from('customers').select('id, company_name').in('id', customerIds)
    if (cust.error) namesFailed = true
    else names = new Map(((cust.data ?? []) as Array<{ id: string; company_name: string }>).map((c) => [c.id, c.company_name]))
  }
  if (!error && assigneeIds.length) {
    const prof = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds)
    if (prof.error) peopleFailed = true
    else people = new Map(((prof.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? 'Medarbejder']))
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Tilbageringninger</h1>
        <Link href="/dashboard/cti" className="text-sm text-blue-700 hover:underline">Slå et nummer op</Link>
      </div>
      <p className="text-sm text-gray-600">Åbne opgaver oprettet som tilbageringning eller ubesvaret opkald. Der ringes ikke herfra.</p>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Køen kunne ikke læses. Det betyder ikke, at der er nul opkald.
        </p>
      )}
      {!error && namesFailed && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Kundenavne kunne ikke læses. Opgaverne vises alligevel.
        </p>
      )}
      {!error && peopleFailed && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Medarbejdernavne kunne ikke læses. Opgaverne vises alligevel.
        </p>
      )}
      {!error && rows.length === 0 && <p className="text-sm text-gray-600">Ingen åbne tilbageringninger.</p>}
      {!error && rows.length > 0 && (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{row.title}</p>
                  <p className="text-gray-500">
                    {names.get(row.customer_id) ?? 'Kunde'}
                    {' · '}
                    {row.assigned_to ? (people.get(row.assigned_to) ?? 'Medarbejder') : 'Ikke tildelt'}
                    {row.auto_rule === 'assistant_missed_call' ? ' · ubesvaret opkald' : ' · planlagt opkald'}
                    {row.due_date ? ` · ${new Date(row.due_date).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}` : ''}
                  </p>
                  {row.description && <p className="mt-1 text-gray-600 line-clamp-2">{row.description}</p>}
                </div>
                <Link href={`/dashboard/customers/${row.customer_id}`} className="shrink-0 text-blue-700 hover:underline">Åbn kunde</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
