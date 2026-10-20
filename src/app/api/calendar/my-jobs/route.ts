/**
 * Fokus E 2026-10-15: download af egne arbejdsordrer som kalenderfil (.ics) — montøren lægger sine job i telefonens
 * kalender. Kun indlogget bruger; kun job tildelt brugerens egen medarbejder (også for planlæggere, der ellers ser alle).
 * Periode: 14 dage tilbage til 60 dage frem + åbne job uden for perioden. Intet abonnement (det kræver en token-tabel).
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { listWorkOrdersByDateRange } from '@/lib/actions/work-orders'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { generateWorkOrdersICS } from '@/lib/utils/ics'

export const dynamic = 'force-dynamic'

const shift = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// PR4-4 (pilot-review 4): linket er et almindeligt <a download> på telefonen — en JSON-fejl blev hentet/vist råt. En lille
// dansk side med vej tilbage i stedet (beskeden escapes).
function errorPage(message: string, status: number): Response {
  const esc = message.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Telefonkalender</title></head>` +
    `<body style="font-family:system-ui,sans-serif;padding:24px;max-width:480px;margin:auto"><h1 style="font-size:18px">Telefonkalenderen kunne ikke hentes</h1>` +
    `<p>${esc}</p><p><a href="/dashboard/tasks">Tilbage til Mine job</a></p></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
  try {
    ctx = await getAuthenticatedClientWithRole()
  } catch {
    return errorPage('Du er ikke logget ind — log ind og prøv igen', 401)
  }
  // FW-15: kun den aktive medarbejderrække (to rækker → maybeSingle fejlede → 404)
  const { data: emp } = await ctx.supabase.from('employees').select('id').eq('profile_id', ctx.userId).eq('active', true).limit(1).maybeSingle()
  const employeeId = (emp as { id?: string } | null)?.id
  if (!employeeId) return errorPage('Dit login er ikke koblet til en medarbejder — bed kontoret om at koble dig under Medarbejdere', 404)

  const today = copenhagenParts(new Date()).date
  const res = await listWorkOrdersByDateRange(shift(today, -14), shift(today, 60), { includeOpenOutsideRange: true })
  if (!res.success) return errorPage(res.error ?? 'Kunne ikke hente job', 403)

  const events = (res.data ?? [])
    .filter((w) => w.assigned_employee_id === employeeId && w.scheduled_date && w.status !== 'cancelled')
    .map((w) => {
      const c = w.case
      const place = [c?.address, [c?.postal_code, c?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      return {
        id: w.id,
        date: String(w.scheduled_date).slice(0, 10),
        startTime: w.start_time ?? null,
        estimatedHours: w.estimated_hours == null ? null : Number(w.estimated_hours),
        title: `${w.status === 'done' ? '✓ ' : ''}${w.title}${c?.customer_name ? ` — ${c.customer_name}` : ''}`,
        location: place || null,
        description: c?.case_number ? `Sag ${c.case_number}` : null,
      }
    })
  return new NextResponse(generateWorkOrdersICS(events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="elta-job.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
