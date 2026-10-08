/**
 * Tilbudsrevisioner (Henrik 2026-10-07; migration 00203 — STAGING ONLY indtil prod-godkendelse).
 *
 *  - Ved afsendelse skrives et UFORANDERLIGT snapshot af det sendte indhold (offer_snapshots; kun service-role skriver).
 *  - Ændring af et sendt tilbud = NY REVISION (kopi som kladde, revision_of → forrige, revision_number + 1,
 *    tilbudsnummer "<basis>-R<n>"). Når revisionen sendes, markeres forrige som afløst (superseded_by/_at) og kan ikke
 *    længere accepteres; portalen viser kun den gældende revision.
 *  - Underskrift bindes til den præcise revisions snapshot (offer_signatures.snapshot_id).
 *
 * Feature-flag OFFER_REVISIONS_ENABLED='true' (kun staging/test) — i prod findes kolonnerne/tabellen ikke endnu, og
 * alle funktioner her er så no-ops. Bevidst IKKE 'use server' (kaldes server-side fra actions/portal efter gates).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export function offerRevisionsEnabled(): boolean {
  return process.env.OFFER_REVISIONS_ENABLED === 'true'
}

/** Kundevendte hovedfelter i snapshottet (aldrig kost/avance) */
const SNAPSHOT_HEADER = 'id, offer_number, title, description, scope, terms_and_conditions, valid_until, currency, ' +
  'customer_id, orderer_customer_id, end_customer_id, payer_customer_id, billing_mode, ' +
  'total_amount, discount_percentage, discount_amount, tax_percentage, tax_amount, final_amount, revision_number, revision_of'
const SNAPSHOT_LINES = 'position, description, quantity, unit, unit_price, discount_percentage, total, section, line_type'

const REVISABLE = new Set(['sent', 'viewed', 'rejected', 'expired'])

/**
 * Kaldes efter at tilbuddet er sat til 'sent': snapshot af revisionen + forrige revision markeres afløst.
 * Idempotent (UNIQUE offer_id+revision_number). Fejl logges, men vælter ikke afsendelsen.
 */
export async function recordOfferSent(offerId: string, userId: string | null): Promise<void> {
  if (!offerRevisionsEnabled()) return
  try {
    const admin = createAdminClient()
    const { data: offer } = await admin.from('offers').select(SNAPSHOT_HEADER).eq('id', offerId).maybeSingle()
    if (!offer) return
    const o = offer as unknown as Record<string, unknown> & { revision_number: number; revision_of: string | null; offer_number: string }
    const { data: lines } = await admin.from('offer_line_items').select(SNAPSHOT_LINES).eq('offer_id', offerId).order('position')
    const { error } = await admin.from('offer_snapshots').upsert(
      [{ offer_id: offerId, revision_number: o.revision_number ?? 1, snapshot: { header: o, lines: lines ?? [] }, sent_by: userId }],
      { onConflict: 'offer_id,revision_number', ignoreDuplicates: true },
    )
    if (error) logger.error('recordOfferSent: snapshot failed', { error, entityId: offerId })
    if (o.revision_of) {
      // forrige revision afløses (ikke hvis den allerede er accepteret — accepteret er endeligt)
      await admin.from('offers').update({ superseded_by: offerId, superseded_at: new Date().toISOString() })
        .eq('id', o.revision_of).is('superseded_by', null).neq('status', 'accepted')
      await admin.from('offer_activities').insert({
        offer_id: o.revision_of, activity_type: 'revision_superseded',
        description: `Afløst af revision ${o.revision_number} (${o.offer_number})`, performed_by: userId,
        metadata: { superseded_by: offerId },
      })
    }
    await admin.from('offer_activities').insert({
      offer_id: offerId, activity_type: 'revision_sent', description: `Revision ${o.revision_number ?? 1} sendt (uforanderligt snapshot gemt)`,
      performed_by: userId, metadata: { revision_number: o.revision_number ?? 1 },
    })
  } catch (err) {
    logger.error('recordOfferSent failed', { error: err, entityId: offerId })
  }
}

/** Ny revision af et sendt tilbud: kopi som kladde med revision-kæde. Returnerer den nye kladdes id. */
export async function createOfferRevision(offerId: string, userId: string): Promise<{ ok: true; id: string; offer_number: string } | { ok: false; error: string }> {
  if (!offerRevisionsEnabled()) return { ok: false, error: 'Revisioner er ikke slået til' }
  const admin = createAdminClient()
  const { data: src } = await admin.from('offers')
    .select('id, title, offer_number, status, revision_number, superseded_by, description, scope, customer_id, lead_id, discount_percentage, tax_percentage, currency, terms_and_conditions, notes, orderer_customer_id, end_customer_id, payer_customer_id, billing_mode, valid_until, is_proposal')
    .eq('id', offerId).maybeSingle()
  if (!src) return { ok: false, error: 'Tilbud ikke fundet' }
  const s = src as Record<string, unknown> & { status: string; revision_number: number; superseded_by: string | null; offer_number: string; title: string }
  if (s.status === 'accepted') return { ok: false, error: 'Accepterede tilbud er endelige — opret et nyt tilbud' }
  if (!REVISABLE.has(s.status)) return { ok: false, error: 'Kun sendte tilbud kan revideres (kladder redigeres direkte)' }
  if (s.superseded_by) return { ok: false, error: 'Tilbuddet er allerede afløst af en nyere revision' }
  const { data: open } = await admin.from('offers').select('id, offer_number').eq('revision_of', offerId).is('superseded_by', null).maybeSingle()
  if (open) return { ok: false, error: `Der findes allerede en revision (${(open as { offer_number: string }).offer_number})` }

  const nextRev = (s.revision_number ?? 1) + 1
  const base = String(s.offer_number).replace(/-R\d+$/, '')
  const insert: Record<string, unknown> = {
    offer_number: `${base}-R${nextRev}`, title: s.title, status: 'draft', created_by: userId,
    revision_of: offerId, revision_number: nextRev,
  }
  for (const f of ['description', 'scope', 'customer_id', 'lead_id', 'discount_percentage', 'tax_percentage', 'currency', 'terms_and_conditions',
    'notes', 'orderer_customer_id', 'end_customer_id', 'payer_customer_id', 'billing_mode', 'valid_until', 'is_proposal']) {
    if (s[f] !== null && s[f] !== undefined) insert[f] = s[f]
  }
  const { data: created, error: insErr } = await admin.from('offers').insert([insert]).select('id, offer_number').single()
  if (insErr || !created) {
    logger.error('createOfferRevision: insert failed', { error: insErr, entityId: offerId })
    return { ok: false, error: 'Kunne ikke oprette revisionen' }
  }
  const newId = (created as { id: string }).id
  const { data: lines } = await admin.from('offer_line_items')
    .select('position, description, quantity, unit, unit_price, discount_percentage, total, line_type, product_id, calculation_id, section, cost_price, notes, supplier_product_id, supplier_cost_price_at_creation, supplier_margin_applied, supplier_name_at_creation, image_url, material_id, margin_percentage, sale_price')
    .eq('offer_id', offerId).order('position')
  const rows = ((lines ?? []) as Array<Record<string, unknown>>).map((l) => ({ ...l, offer_id: newId }))
  if (rows.length) {
    const { error: lErr } = await admin.from('offer_line_items').insert(rows)
    if (lErr) {
      await admin.from('offers').delete().eq('id', newId)
      logger.error('createOfferRevision: lines failed', { error: lErr, entityId: offerId })
      return { ok: false, error: 'Kunne ikke kopiere tilbudslinjerne' }
    }
  }
  await admin.from('offer_activities').insert([
    { offer_id: newId, activity_type: 'revision_created', description: `Revision ${nextRev} oprettet fra ${s.offer_number}`, performed_by: userId, metadata: { revision_of: offerId } },
    { offer_id: offerId, activity_type: 'revision_created', description: `Ny revision ${nextRev} oprettet (${base}-R${nextRev})`, performed_by: userId, metadata: { revision_id: newId } },
  ])
  return { ok: true, id: newId, offer_number: (created as { offer_number: string }).offer_number }
}

/** Seneste snapshot for tilbuddet (til underskrift). */
export async function latestSnapshotId(offerId: string): Promise<string | null> {
  if (!offerRevisionsEnabled()) return null
  const { data } = await createAdminClient().from('offer_snapshots').select('id').eq('offer_id', offerId)
    .order('revision_number', { ascending: false }).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Er tilbuddet afløst? (portal/accept) — returnerer afløserens id eller null */
export async function supersededBy(offerId: string): Promise<string | null> {
  if (!offerRevisionsEnabled()) return null
  const { data } = await createAdminClient().from('offers').select('superseded_by').eq('id', offerId).maybeSingle()
  return (data as { superseded_by: string | null } | null)?.superseded_by ?? null
}

/** Revisionshistorik for tilbudssiden: kæden (ældste → nyeste) + snapshots */
export async function getRevisionHistory(offerId: string): Promise<Array<{ id: string; offer_number: string; revision_number: number; status: string; superseded_at: string | null; snapshot_sent_at: string | null }>> {
  if (!offerRevisionsEnabled()) return []
  const admin = createAdminClient()
  // find roden
  let rootId = offerId
  for (let i = 0; i < 50; i++) {
    const { data } = await admin.from('offers').select('revision_of').eq('id', rootId).maybeSingle()
    const prev = (data as { revision_of: string | null } | null)?.revision_of
    if (!prev) break
    rootId = prev
  }
  const chain: Array<{ id: string; offer_number: string; revision_number: number; status: string; superseded_at: string | null }> = []
  let cur: string | null = rootId
  for (let i = 0; i < 50 && cur; i++) {
    const { data } = await admin.from('offers').select('id, offer_number, revision_number, status, superseded_at').eq('id', cur).maybeSingle()
    if (!data) break
    chain.push(data as (typeof chain)[number])
    const nextRes: { data: unknown } = await admin.from('offers').select('id').eq('revision_of', cur).order('revision_number', { ascending: false }).limit(1).maybeSingle()
    cur = (nextRes.data as { id: string } | null)?.id ?? null
  }
  const { data: snaps } = await admin.from('offer_snapshots').select('offer_id, sent_at').in('offer_id', chain.map((c) => c.id))
  const sentAt = new Map(((snaps ?? []) as Array<{ offer_id: string; sent_at: string }>).map((s) => [s.offer_id, s.sent_at]))
  return chain.map((c) => ({ ...c, snapshot_sent_at: sentAt.get(c.id) ?? null }))
}
