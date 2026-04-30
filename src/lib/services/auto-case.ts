/**
 * Auto-Case Creation
 *
 * Creates a service case (with smart tasks + AI summary note) from an
 * incoming email after customer auto-linking succeeds.
 *
 * Tables (verified against production schema):
 * - service_cases:    status {'new','in_progress','pending','closed','converted'},
 *                     source {'email','phone','portal','manual'},
 *                     priority {'low','medium','high','urgent'},
 *                     source_email_id is the dedup key (FK incoming_emails).
 * - customer_tasks:   status {'pending','in_progress','done'},
 *                     priority {'low','normal','high','urgent'}.
 * - case_notes:       free-form notes; kind ∈ {'note','ai_summary','system'}.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { canSpendAi, recordAiCall } from '@/lib/services/ai-budget'

const OPENAI_TIMEOUT_MS = 15_000

export type CaseIntent = 'solar' | 'service' | 'electrical' | 'project' | 'general'
export type CasePriority = 'low' | 'medium' | 'high' | 'urgent'

export interface CaseEmailInput {
  id: string
  subject: string
  body: string | null
  extractedName?: string | null
  extractedAddress?: string | null
  intent?: CaseIntent
  priority?: CasePriority
}

// ----- Intent detection (cheap, keyword-based — no AI) -----

const INTENT_KEYWORDS: Record<Exclude<CaseIntent, 'general'>, string[]> = {
  solar: ['solcelle', 'solceller', 'solar', 'pv', 'wattsoon', 'wattpilot', 'inverter', 'batteri', 'kwp', 'sma', 'huawei'],
  service: ['fejl', 'fejlfinding', 'virker ikke', 'reparation', 'service', 'eftersyn', 'akut', 'haster', 'reklamation'],
  electrical: ['installation', 'eltavle', 'gruppetavle', 'stikkontakt', 'belysning', 'ladestander', 'el-arbejde', 'el arbejde', 'el-tjek'],
  project: ['nybyg', 'tilbygning', 'renovering', 'projekt', 'entreprise', 'byggeri'],
}

export function detectIntent(subject: string, body: string): CaseIntent {
  const t = `${subject} ${body}`.toLowerCase()
  // Check intent groups in order of specificity (service first — strongest signal)
  for (const intent of ['service', 'solar', 'electrical', 'project'] as const) {
    const hit = INTENT_KEYWORDS[intent].some((kw) => t.includes(kw))
    if (hit) return intent
  }
  return 'general'
}

// ----- Priority detection -----

const URGENT_KEYWORDS = ['akut', 'haster', 'asap', 'urgent', 'nedbrud', 'lige nu', 'i dag']
const HIGH_KEYWORDS = ['snarest', 'hurtigst muligt', 'inden weekend', 'klage', 'utilfreds', 'reklamation', 'kortslutning']

export function detectPriority(subject: string, body: string, intent: CaseIntent): CasePriority {
  const t = `${subject} ${body}`.toLowerCase()
  if (URGENT_KEYWORDS.some((kw) => t.includes(kw))) return 'urgent'
  if (HIGH_KEYWORDS.some((kw) => t.includes(kw))) return 'high'
  if (intent === 'service') return 'high'
  if (intent === 'solar' || intent === 'project') return 'medium'
  return 'medium'
}

// ----- Case creation (with dedup, smart title, priority) -----

export async function createCaseFromEmail(
  email: CaseEmailInput,
  customerId: string
): Promise<string | null> {
  const supabase = createAdminClient()

  // Dedup — one case per source email. With UNIQUE partial index (migration 00074)
  // the DB will enforce this even under concurrent runs.
  const { data: existing } = await supabase
    .from('service_cases')
    .select('id')
    .eq('source_email_id', email.id)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    console.log('CASE SKIP (duplicate for email):', email.id, '→ existing case:', existing.id)
    return existing.id
  }

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  // Title rule: name > address > subject only
  const subject = email.subject || '(Intet emne)'
  const name = email.extractedName?.trim()
  const address = email.extractedAddress?.trim()
  let title = subject
  if (name) title = `${subject} - ${name}`
  else if (address) title = `${subject} - ${address}`

  const body = email.body || ''
  const description = body.substring(0, 500) || null
  const intent = email.intent ?? detectIntent(subject, body)
  const priority = email.priority ?? detectPriority(subject, body, intent)

  const { data: created, error } = await supabase
    .from('service_cases')
    .insert({
      customer_id: customerId,
      title,
      description,
      status: 'new',
      priority,
      source: 'email',
      source_email_id: email.id,
      address: address ?? null,
      created_by: adminProfile?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !created) {
    // 23505: another worker created the case for this email between our select and insert.
    // Re-read and return the existing case instead of failing.
    const code = (error as { code?: string } | null)?.code
    if (code === '23505') {
      const { data: race } = await supabase
        .from('service_cases')
        .select('id')
        .eq('source_email_id', email.id)
        .limit(1)
        .maybeSingle()
      if (race?.id) {
        console.log('CASE RACE WINNER USED:', race.id)
        return race.id
      }
    }
    logger.error('Failed to create service_case from email', {
      entity: 'service_cases',
      metadata: { emailId: email.id, customerId, intent, priority },
      error,
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('auto_case', 'error', `case create failed: ${error.message}`, { emailId: email.id, customerId, intent })
    } catch { /* never crash */ }
    return null
  }

  return created.id
}

// ----- Smart tasks (per intent) -----

export async function createSmartTasks(caseId: string, intent: CaseIntent): Promise<void> {
  const supabase = createAdminClient()

  const { data: caseRow } = await supabase
    .from('service_cases')
    .select('id, customer_id')
    .eq('id', caseId)
    .maybeSingle()

  if (!caseRow?.customer_id) {
    logger.warn('createSmartTasks: case not found or missing customer_id', { metadata: { caseId } })
    return
  }

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (!adminProfile?.id) {
    logger.warn('createSmartTasks skipped: no admin profile for created_by', { metadata: { caseId } })
    return
  }

  // Always-on baseline tasks
  const tasks: Array<{ title: string; priority: 'low' | 'normal' | 'high' | 'urgent' }> = [
    { title: 'Kontakt kunde', priority: 'high' },
    { title: 'Lav tilbud', priority: 'normal' },
  ]

  // Intent-specific tasks
  if (intent === 'solar') {
    tasks.push({ title: 'Beregn anlæg', priority: 'normal' })
    tasks.push({ title: 'Tjek tag og forbrug', priority: 'normal' })
  } else if (intent === 'service') {
    tasks.push({ title: 'Fejlfinding', priority: 'high' })
    tasks.push({ title: 'Aftale servicebesøg', priority: 'high' })
  } else if (intent === 'electrical') {
    tasks.push({ title: 'Vurder el-installation', priority: 'normal' })
  } else if (intent === 'project') {
    tasks.push({ title: 'Aftale opmåling', priority: 'normal' })
  }

  const rows = tasks.map((t) => ({
    customer_id: caseRow.customer_id,
    title: t.title,
    description: `Auto-genereret fra sag ${caseId} (${intent})`,
    status: 'pending',
    priority: t.priority,
    created_by: adminProfile.id,
  }))

  const { error } = await supabase.from('customer_tasks').insert(rows)
  if (error) {
    logger.error('Failed to create smart tasks for case', {
      entity: 'customer_tasks',
      metadata: { caseId, customerId: caseRow.customer_id, intent, count: rows.length },
      error,
    })
  }
}

// Backwards-compat shim — older code may still call createDefaultTasks.
export async function createDefaultTasks(caseId: string): Promise<void> {
  await createSmartTasks(caseId, 'general')
}

// ----- Case notes (AI summary etc.) -----

export interface WriteCaseNoteInput {
  caseId: string
  content: string
  kind?: 'note' | 'ai_summary' | 'system'
  urgency?: CasePriority | null
}

export async function writeCaseNote(input: WriteCaseNoteInput): Promise<void> {
  const supabase = createAdminClient()
  try {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()

    const { error } = await supabase.from('case_notes').insert({
      case_id: input.caseId,
      content: input.content.substring(0, 4000),
      kind: input.kind ?? 'note',
      urgency: input.urgency ?? null,
      created_by: adminProfile?.id ?? null,
    })
    if (error) {
      console.error('CASE NOTE FAILED', error.message)
    }
  } catch (err) {
    console.error('CASE NOTE FAILED', err)
  }
}

// ----- AI summary (urgency + customer ask) -----

export interface CaseAiSummary {
  summary: string
  urgency: CasePriority
}

export async function generateCaseAiSummary(subject: string, body: string): Promise<CaseAiSummary | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!(await canSpendAi())) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Du opsummerer dansk indkomne kunde-emails for et el/solcelle-firma. Svar altid med rå JSON.',
          },
          {
            role: 'user',
            content: `Lav en KORT intern note om hvad kunden vil + vurdering af hastighed.

Returnér JSON:
{
  "summary": "1-3 korte sætninger på dansk om hvad kunden ønsker, og hvad næste skridt er.",
  "urgency": "low" | "medium" | "high" | "urgent"
}

Brug "urgent" KUN ved nedbrud, akutte sikkerhedsproblemer eller eksplicit hast.
Brug "high" når kunden er utilfreds, klager eller forventer hurtigt svar.
Default = "medium".

Emne: ${subject}
Body (første 2500 tegn):
${(body || '').substring(0, 2500)}`,
          },
        ],
      }),
    })

    if (!res.ok) {
      logger.warn('AI case summary request failed', {
        metadata: { status: res.status, body: (await res.text()).substring(0, 200) },
      })
      return null
    }

    void recordAiCall(1)

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    const urgencyRaw = typeof parsed.urgency === 'string' ? parsed.urgency.toLowerCase().trim() : 'medium'
    const urgency: CasePriority = (['low', 'medium', 'high', 'urgent'] as const).includes(urgencyRaw as CasePriority)
      ? (urgencyRaw as CasePriority)
      : 'medium'

    if (!summary) return null
    return { summary, urgency }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    if (aborted) {
      logger.warn('AI case summary aborted (timeout)', { metadata: { timeoutMs: OPENAI_TIMEOUT_MS } })
    } else {
      logger.warn('AI case summary threw', { error: err })
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}
