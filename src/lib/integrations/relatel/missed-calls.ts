/**
 * T12 — ubesvaret opkald → kunde-/sagsmatch → tilbageringningsopgave i CRM. Bevidst IKKE 'use server'.
 *
 * Ingen netværk her: opkaldene leveres af en RelatelClient (i dag kun disabledRelatelClient → intet sker, ingen
 * live-aktivering uden Henriks godkendelse). CRM er source of truth: resultatet er en customer_tasks-række
 * (auto_rule assistant_missed_call), som vises i kalenderen og påmindes via assistentens normale påmindelses-flow.
 *
 * Regler:
 *  - Kun indgående opkald uden answered_at.
 *  - Kunde findes via lookupCaller (normaliserede numre på kunder, kontakter, leads). Opgave KUN ved præcis én kunde —
 *    0 eller flere kunder → 'unmatched'/'ambiguous' (ingen gæt; listen returneres så en medarbejder kan vælge).
 *  - Idempotent pr. opkald: markøren [opkald:<uuid>] i beskrivelsen; samme opkald giver aldrig to opgaver.
 *  - Telefonsvarer-transskription (hvis leveret) lægges i beskrivelsen (højst 1.000 tegn).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupCaller, type CallerMatch } from '@/lib/integrations/relatel/lookup'
import type { RelatelCall, RelatelClient } from '@/lib/integrations/relatel/contract'
import { ASSISTANT_RULE } from '@/lib/assistant/rules'

export type MissedCallInput = RelatelCall & { voicemail_transcript?: string | null }

export type MissedCallOutcome =
  | { status: 'ignored'; reason: 'not_missed' | 'no_number' }
  | { status: 'duplicate'; taskId: string }
  | { status: 'unmatched'; number: string | null }
  | { status: 'ambiguous'; number: string | null; matches: CallerMatch[] }
  | { status: 'created'; taskId: string; customerId: string }
  | { status: 'failed'; error: string }

const callMarker = (uuid: string) => `[opkald:${uuid}]`

function hhmmCopenhagen(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' })
}

export async function processMissedCall(
  admin: SupabaseClient,
  call: MissedCallInput,
  opts: { assigneeProfileId: string; now?: Date },
): Promise<MissedCallOutcome> {
  if (call.direction !== 'inbound' || call.answered_at) return { status: 'ignored', reason: 'not_missed' }
  if (!call.from) return { status: 'ignored', reason: 'no_number' }

  const marker = callMarker(call.uuid)
  const { data: existing } = await admin.from('customer_tasks').select('id')
    .eq('auto_rule', ASSISTANT_RULE.missedCall).like('description', `%${marker}%`).limit(1)
  const dup = ((existing ?? []) as Array<{ id: string }>)[0]
  if (dup) return { status: 'duplicate', taskId: dup.id }

  const lookup = await lookupCaller(admin, call.from)
  const customerIds = [...new Set(lookup.matches.map((m) => m.customer_id).filter(Boolean) as string[])]
  if (customerIds.length === 0) return { status: 'unmatched', number: lookup.number }
  if (customerIds.length > 1) return { status: 'ambiguous', number: lookup.number, matches: lookup.matches }

  const customerId = customerIds[0]
  const label = lookup.matches.find((m) => m.customer_id === customerId)?.label ?? 'kunde'
  const openCase = lookup.openCases.find((c) => c.customer_id === customerId) ?? null
  const now = opts.now ?? new Date()
  const transcript = (call.voicemail_transcript ?? '').trim().slice(0, 1000)
  const description = [
    `Ubesvaret opkald kl. ${hhmmCopenhagen(call.started_at)} fra ${lookup.number ?? call.from}.`,
    openCase ? `Åben sag: ${openCase.case_number ?? ''} ${openCase.title}`.trim() : null,
    transcript ? `Telefonsvarer: «${transcript}»` : null,
    marker,
  ].filter(Boolean).join('\n')

  const { data: task, error } = await admin.from('customer_tasks').insert({
    customer_id: customerId,
    service_case_id: openCase?.id ?? null,
    title: `Ring tilbage: ${label}`,
    description,
    status: 'pending',
    priority: 'high',
    assigned_to: opts.assigneeProfileId,
    due_date: now.toISOString(),
    reminder_at: now.toISOString(),
    auto_generated: true,
    auto_rule: ASSISTANT_RULE.missedCall,
    created_by: opts.assigneeProfileId,
  }).select('id').single()
  if (error || !task) return { status: 'failed', error: error?.message ?? 'insert failed' }

  await admin.from('audit_logs').insert({
    user_id: null,
    entity_type: 'assistant',
    entity_id: (task as { id: string }).id,
    action: 'assistant_missed_call_task',
    action_description: 'ELTA Assistant: tilbageringning oprettet efter ubesvaret opkald',
    metadata: { channel: 'relatel', customer_id: customerId, has_voicemail: !!transcript },
  })
  return { status: 'created', taskId: (task as { id: string }).id, customerId }
}

/** Hent opkald siden `since` fra klienten og behandl de ubesvarede. Deaktiveret klient → 'disabled' (intet sker). */
export async function syncMissedCalls(
  admin: SupabaseClient,
  client: RelatelClient,
  opts: { since: string; assigneeProfileId: string; maxPerRun?: number; now?: Date },
): Promise<{ status: 'disabled' | 'ok'; outcomes: MissedCallOutcome[] }> {
  let calls: RelatelCall[]
  try {
    calls = await client.listCalls({ since: opts.since })
  } catch {
    return { status: 'disabled', outcomes: [] }
  }
  const outcomes: MissedCallOutcome[] = []
  for (const c of calls.slice(0, opts.maxPerRun ?? 50)) {
    outcomes.push(await processMissedCall(admin, c, { assigneeProfileId: opts.assigneeProfileId, now: opts.now }).catch((e: unknown) => ({ status: 'failed' as const, error: e instanceof Error ? e.message : String(e) })))
  }
  return { status: 'ok', outcomes }
}
