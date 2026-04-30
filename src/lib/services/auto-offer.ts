/**
 * Auto-Offer Drafts (Phase 2)
 *
 * Creates an empty offer draft from a relevant email/case. The offer is
 * usable as-is — sales rep adds line items, sets total_amount, sends.
 *
 * Schema (offers, verified):
 * - offer_number       TEXT NOT NULL  (TILBUD-YYYY-NNNN)
 * - status             offer_status   ('draft' default)
 * - title              TEXT NOT NULL
 * - description        TEXT nullable  (short customer-facing summary)
 * - notes              TEXT nullable  (internal — AI summary stored here)
 * - customer_id        UUID nullable
 * - source_email_id    UUID nullable, FK incoming_emails, UNIQUE partial idx
 * - total_amount       NUMERIC NOT NULL DEFAULT 0  (treat 0 as "unset/empty")
 * - final_amount       NUMERIC NOT NULL DEFAULT 0
 * - tax_percentage     NUMERIC DEFAULT 25
 *
 * Line items live in `offer_line_items` (offer_id FK). Created empty here;
 * supplier_margin_applied on each line provides per-line margin support.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { retryOnUniqueViolation } from '@/lib/utils/retry'
import { canSpendAi, recordAiCall } from '@/lib/services/ai-budget'
import { fillOfferStarterLines } from '@/lib/services/offer-starter-packs'
import { applyPackageToOffer } from '@/lib/services/offer-packages'
import {
  recalculateOfferFull,
  suggestDiscount,
  type MarginContext,
} from '@/lib/services/offer-pricing'
import { createAdminClient as adminFor } from '@/lib/supabase/admin'

const OPENAI_TIMEOUT_MS = 15_000

export interface AutoOfferInput {
  emailId: string
  caseId: string | null
  customerId: string
  subject: string
  body: string
  extractedAddress: string | null
  extractedName: string | null
  intent: string | null
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null
}

export interface OfferAiSummary {
  wants: string
  jobType: 'solar' | 'service' | 'installation' | 'project' | 'general'
  scope: string
}

export async function createOfferDraftFromCase(input: AutoOfferInput): Promise<string | null> {
  const supabase = createAdminClient()

  // Dedup — DB-enforced via UNIQUE partial index on offers.source_email_id.
  const { data: existing } = await supabase
    .from('offers')
    .select('id')
    .eq('source_email_id', input.emailId)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    console.log('OFFER SKIP (existing for email):', input.emailId, '→', existing.id)
    return existing.id
  }

  // created_by — first admin profile
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (!adminProfile?.id) {
    logger.warn('createOfferDraftFromCase skipped: no admin profile for created_by', {
      metadata: { emailId: input.emailId },
    })
    return null
  }

  // Title rule: "Tilbud - <name or address>" (subject is too noisy for offer titles).
  // Falls back to subject only if extraction had nothing.
  const title = buildOfferTitle(input)

  // AI summary → stored in offer.notes (internal). Best-effort, never blocks.
  const aiSummary = await generateOfferAiSummary(input.subject, input.body, input.intent)
  const notes = formatOfferNotes(aiSummary, input.caseId)

  // description = short customer-facing summary (uses AI "wants" if available)
  const description = aiSummary?.wants
    ? aiSummary.wants
    : buildFallbackDescription(input)

  // Race-safe offer_number generation: re-read MAX+1 each retry.
  const result = await retryOnUniqueViolation<{ id: string; offer_number: string }>(
    async () => {
      const year = new Date().getFullYear()
      const prefix = `TILBUD-${year}-`
      const { data: lastRows } = await supabase
        .from('offers')
        .select('offer_number')
        .like('offer_number', `${prefix}%`)
        .order('offer_number', { ascending: false })
        .limit(1)

      let offerNumber = `${prefix}0001`
      if (lastRows && lastRows.length > 0) {
        const last = lastRows[0].offer_number as string
        const n = parseInt(last.split('-').pop() || '0', 10)
        if (!Number.isNaN(n)) offerNumber = `${prefix}${(n + 1).toString().padStart(4, '0')}`
      }

      return await supabase
        .from('offers')
        .insert({
          offer_number: offerNumber,
          title,
          description,
          status: 'draft',
          customer_id: input.customerId,
          total_amount: 0,
          final_amount: 0,
          tax_percentage: 25,
          currency: 'DKK',
          notes,
          source_email_id: input.emailId,
          created_by: adminProfile.id,
        })
        .select('id, offer_number')
        .single()
    },
    3,
    'offer_number/source_email_id'
  )

  if (result.error || !result.data) {
    // 23505 on source_email_id means another worker beat us — return that offer.
    const code = (result.error as { code?: string } | null)?.code
    if (code === '23505') {
      const { data: race } = await supabase
        .from('offers')
        .select('id')
        .eq('source_email_id', input.emailId)
        .limit(1)
        .maybeSingle()
      if (race?.id) {
        console.log('OFFER RACE WINNER USED:', race.id)
        return race.id
      }
    }
    logger.error('Failed to create offer draft from email', {
      entity: 'offers',
      metadata: { emailId: input.emailId, customerId: input.customerId },
      error: result.error,
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      await logHealth('auto_offer', 'error', `offer create failed: ${String(result.error)}`, { emailId: input.emailId, customerId: input.customerId })
    } catch { /* never crash */ }
    return null
  }

  console.log('OFFER CREATED:', result.data.id, result.data.offer_number)

  // Best-effort: pre-populate starter line items based on detected job type.
  // Never blocks. Never throws. Resolves against the local supplier_products
  // mirror only — no live API calls.
  try {
    const jobType = aiSummary?.jobType ?? input.intent ?? null
    const marginContext = await deriveMarginContext({
      jobType,
      customerId: input.customerId,
      priority: input.priority ?? null,
      scopeText: aiSummary?.scope ?? null,
    })

    // 1. Try a structured package first (offer_packages).
    const pkgResult = await applyPackageToOffer({
      offerId: result.data.id,
      customerId: input.customerId,
      jobType,
      marginContext,
    })

    // 2. If no package matched, fall back to material/category starter terms.
    if (!pkgResult || pkgResult.added === 0) {
      const fill = await fillOfferStarterLines({
        offerId: result.data.id,
        customerId: input.customerId,
        jobType,
        context: {
          priority: input.priority ?? null,
          scopeText: aiSummary?.scope ?? null,
        },
      })
      if (fill.added > 0 || fill.skipped > 0) {
        console.log('STARTER LINES:', { added: fill.added, skipped: fill.skipped, jobType })
      }
    }

    // 3. Discount suggestion — only auto-applied on creation. Manual edits later
    //    will overwrite this; recalculateOfferFull respects whatever discount the
    //    rep saves.
    await applyDiscountSuggestion(result.data.id, marginContext.isRepeatCustomer === true)

    // 4. Final totals roll-up.
    await recalculateOfferFull(result.data.id)
  } catch (err) {
    console.warn('STARTER LINES FAILED:', err instanceof Error ? err.message : err)
  }

  return result.data.id
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deriveMarginContext(args: {
  jobType: string | null
  customerId: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  scopeText: string | null
}): Promise<MarginContext> {
  const jt = (args.jobType || '').toLowerCase()
  const scope = (args.scopeText || '').toLowerCase()
  const ctx: MarginContext = {
    isUrgent: args.priority === 'urgent' || args.priority === 'high',
    isLargeProject:
      jt === 'project' ||
      scope.length > 300 ||
      /(renovering|erhverv|nybyg|kommerciel|entreprise)/.test(scope),
    isSmallJob: jt === 'service' && scope.length > 0 && scope.length < 120,
    isRepeatCustomer: false,
  }
  if (args.customerId) {
    try {
      const supabase = adminFor()
      const { count } = await supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', args.customerId)
        .neq('status', 'draft')
      ctx.isRepeatCustomer = (count ?? 0) > 0
    } catch (err) {
      logger.warn('repeat-customer probe failed', {
        metadata: { customerId: args.customerId },
        error: err,
      })
    }
  }
  return ctx
}

/**
 * Auto-apply a discount suggestion on draft creation only.
 * NEVER touches discount fields if the rep has already set a non-zero value.
 */
async function applyDiscountSuggestion(offerId: string, isRepeatCustomer: boolean): Promise<void> {
  try {
    const supabase = adminFor()
    const { data: offer } = await supabase
      .from('offers')
      .select('discount_percentage, discount_amount, total_amount')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) return

    const existingPct = Number(offer.discount_percentage ?? 0)
    const existingAmt = Number(offer.discount_amount ?? 0)
    if (existingPct > 0 || existingAmt > 0) {
      // Manual override already present — never overwrite.
      return
    }

    // Need a current total to evaluate the > 50.000 threshold; use a quick
    // line-item sum (we haven't called recalculateOfferFull yet at this point).
    const { data: lines } = await supabase
      .from('offer_line_items')
      .select('sale_price, unit_price, quantity, discount_percentage')
      .eq('offer_id', offerId)
      .limit(10000)
    const grossTotal = (lines || []).reduce((s, l) => {
      const sale = Number(l.sale_price ?? l.unit_price ?? 0)
      const qty = Number(l.quantity ?? 0)
      const disc = Math.max(0, Math.min(100, Number(l.discount_percentage ?? 0)))
      return s + sale * qty * (1 - disc / 100)
    }, 0)

    const suggestion = suggestDiscount({ totalAmount: grossTotal, isRepeatCustomer })
    if (!suggestion) return

    await supabase
      .from('offers')
      .update({ discount_percentage: suggestion.percentage })
      .eq('id', offerId)

    console.log('OFFER DISCOUNT SUGGESTED:', suggestion.percentage, '%', `(${suggestion.reason})`)
  } catch (err) {
    logger.warn('applyDiscountSuggestion failed', { entityId: offerId, error: err })
  }
}

function buildOfferTitle(input: AutoOfferInput): string {
  const name = input.extractedName?.trim()
  const address = input.extractedAddress?.trim()
  if (name) return `Tilbud - ${name}`
  if (address) return `Tilbud - ${address}`
  return `Tilbud - ${input.subject || '(uden emne)'}`
}

function buildFallbackDescription(input: AutoOfferInput): string {
  const parts: string[] = []
  if (input.extractedName) parts.push(`Kunde: ${input.extractedName}`)
  if (input.extractedAddress) parts.push(`Adresse: ${input.extractedAddress}`)
  if (input.intent) parts.push(`Type: ${input.intent}`)
  parts.push('Emne: ' + (input.subject || '(intet)'))
  return parts.join('\n')
}

function formatOfferNotes(summary: OfferAiSummary | null, caseId: string | null): string {
  const lines: string[] = []
  lines.push('AUTO-DRAFT — Tilbudskladde fra indgående email.')
  if (caseId) lines.push(`Sag: ${caseId}`)
  lines.push('')
  if (summary) {
    lines.push('AI-resume:')
    lines.push(`• Hvad kunden vil: ${summary.wants}`)
    lines.push(`• Type: ${summary.jobType}`)
    lines.push(`• Omfang: ${summary.scope}`)
  } else {
    lines.push('AI-resume kunne ikke genereres (faldet tilbage til manuel udfyldelse).')
  }
  return lines.join('\n')
}

// =====================================================
// AI summary for offer.notes
// =====================================================

export async function generateOfferAiSummary(
  subject: string,
  body: string,
  intentHint: string | null
): Promise<OfferAiSummary | null> {
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
            content:
              'Du er senior tilbudsskriver i et dansk el/solcelle-firma. Du analyserer en kundes email og laver et kort tilbudsudkast-resume. Svar altid med rå JSON.',
          },
          {
            role: 'user',
            content: `Analyser kundens email og returnér JSON:
{
  "wants": "1-2 sætninger om hvad kunden konkret beder om",
  "jobType": "solar" | "service" | "installation" | "project" | "general",
  "scope": "Kort estimat af omfang — fx 'enfamiliehus, ca. 8 kWp solceller', 'fejlfinding på eltavle', 'ladestander 11 kW'. Maks 2 sætninger."
}

Regler:
- Brug det videresendte indhold hvis emailen er videresendt.
- Hvis omfanget ikke fremgår, skriv "Omfang ikke specificeret — kræver opmåling/dialog".
- Ingen markdown, ingen forklaring, kun JSON.

Intent-hint fra heuristik: ${intentHint || 'ukendt'}
Emne: ${subject || '(intet)'}
Body (første 2500 tegn):
${(body || '').substring(0, 2500)}`,
          },
        ],
      }),
    })

    if (!res.ok) {
      logger.warn('AI offer summary request failed', {
        metadata: { status: res.status, body: (await res.text()).substring(0, 200) },
      })
      return null
    }

    void recordAiCall(1)

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    const wants = typeof parsed.wants === 'string' ? parsed.wants.trim() : ''
    const scope = typeof parsed.scope === 'string' ? parsed.scope.trim() : ''
    const jobTypeRaw = typeof parsed.jobType === 'string' ? parsed.jobType.toLowerCase().trim() : 'general'
    const allowed = ['solar', 'service', 'installation', 'project', 'general'] as const
    const jobType = (allowed as readonly string[]).includes(jobTypeRaw)
      ? (jobTypeRaw as OfferAiSummary['jobType'])
      : 'general'

    if (!wants || !scope) return null
    return { wants, jobType, scope }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    if (aborted) {
      logger.warn('AI offer summary aborted (timeout)', { metadata: { timeoutMs: OPENAI_TIMEOUT_MS } })
    } else {
      logger.warn('AI offer summary threw', { error: err })
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}
