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

export async function GET() {
  let ctx: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
  try {
    ctx = await getAuthenticatedClientWithRole()
  } catch {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 })
  }
  const { data: emp } = await ctx.supabase.from('employees').select('id').eq('profile_id', ctx.userId).maybeSingle()
  const employeeId = (emp as { id?: string } | null)?.id
  if (!employeeId) return NextResponse.json({ error: 'Dit login er ikke koblet til en medarbejder' }, { status: 404 })

  const today = copenhagenParts(new Date()).date
  const res = await listWorkOrdersByDateRange(shift(today, -14), shift(today, 60), { includeOpenOutsideRange: true })
  if (!res.success) return NextResponse.json({ error: res.error ?? 'Kunne ikke hente job' }, { status: 403 })

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
