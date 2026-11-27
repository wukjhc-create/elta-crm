'use server'

/**
 * Phase C4 — kundeoprettelse fra mail MED dubletkontrol (erstatningsflowet for den automatiske kundeoprettelse) og en
 * read-only dubletrapport. Flag COORDINATOR_ENABLED. Opretter kun på medarbejderens klik; sammenlægger/sletter aldrig.
 *
 * Måling: valg af en eksisterende kunde blandt viste dubletkandidater auditeres som `customer_duplicate_avoided`
 * (= faktisk undgået dubletoprettelse); oprettelse trods kandidater kræver begrundelse og auditeres
 * `customer_created_with_check` (antal/stryke viste kandidater, ingen persondata).
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { coordinatorEnabled, COORDINATOR_DISABLED_TEXT } from '@/lib/coordinator/feature-flag'
import { loadRegistry, loadCoordinatorContext } from '@/lib/coordinator/load-identity'
import { duplicateReport, findDuplicateCandidates, type DupCustomer, type DupInput, type DuplicateBasis, type DuplicateStrength } from '@/lib/coordinator/duplicates'
import { quickCreateCustomer } from '@/lib/actions/customers'
import { linkEmailToCustomer } from '@/lib/actions/incoming-emails'

type R<T> = { success: true; data: T } | { success: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DupCandidateView { id: string; customerNumber: string | null; name: string; email: string | null; phone: string | null; address: string | null; autoCreated: boolean; basis: DuplicateBasis[]; strength: DuplicateStrength }
export interface CustomerDraft { customerType: 'private' | 'business'; name: string; contactPerson: string; email: string; phone: string; address: string; postalCode: string; city: string; vat: string }

function toDup(rows: Array<Record<string, unknown>>): DupCustomer[] {
  const s = (v: unknown) => (v == null || v === '' ? null : String(v))
  return rows.filter((c) => c.is_active !== false).map((c) => ({
    id: String(c.id), customerNumber: s(c.customer_number), name: s(c.company_name), contactPerson: s(c.contact_person), email: s(c.email),
    phones: [s(c.phone), s(c.mobile)].filter((x): x is string => !!x), vat: s(c.vat_number), address: s(c.billing_address), postalCode: s(c.billing_postal_code),
    autoCreated: ((c.tags as string[] | null) ?? []).includes('auto-email') || /@elta-crm\.local$/i.test(String(c.email ?? '')), createdAt: String(c.created_at),
  }))
}

async function requireDedupeCtx(perm: 'customers.create' | 'customers.view' = 'customers.create') {
  if (!coordinatorEnabled()) return { error: COORDINATOR_DISABLED_TEXT } as const
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission(perm)) return { error: perm === 'customers.create' ? 'Du kan ikke oprette kunder' : 'Du har ikke adgang til kunder' } as const
    return { ctx } as const
  } catch { return { error: 'Ikke logget ind' } as const }
}

/** Kandidater filtreret til dem brugeren selv kan se (RLS). Skjulte kandidater tælles, men vises ikke. */
async function visibleCandidates(userDb: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], input: DupInput): Promise<{ list: DupCandidateView[]; hidden: number; strongHidden: number }> {
  const reg = await loadRegistry(createAdminClient())
  const cands = findDuplicateCandidates(input, toDup(reg.customers), { limit: 15 })
  if (!cands.length) return { list: [], hidden: 0, strongHidden: 0 }
  const vis = await userDb.from('customers').select('id').in('id', cands.map((c) => c.customer.id))
  const ok = new Set(((vis.data ?? []) as Array<{ id: string }>).map((x) => x.id))
  const list = cands.filter((c) => ok.has(c.customer.id)).map((c) => ({ id: c.customer.id, customerNumber: c.customer.customerNumber, name: c.customer.name ?? 'Kunde',
    email: c.customer.email, phone: c.customer.phones[0] ?? null, address: [c.customer.address, c.customer.postalCode].filter(Boolean).join(' ') || null,
    autoCreated: c.customer.autoCreated, basis: c.basis, strength: c.strength }))
  const hiddenC = cands.filter((c) => !ok.has(c.customer.id))
  return { list, hidden: hiddenC.length, strongHidden: hiddenC.filter((c) => c.strength === 'strong').length }
}

/** Forudfyld kundeformularen fra mailen (formular-felter / afsender) og find mulige dubletter */
export async function prepareCustomerFromMailAction(emailId: string): Promise<R<{ draft: CustomerDraft; candidates: DupCandidateView[]; hidden: number }>> {
  if (!UUID.test(String(emailId ?? ''))) return { success: false, error: 'Ugyldig mail' }
  const g = await requireDedupeCtx(); if ('error' in g) return { success: false, error: g.error as string }
  if (!g.ctx.hasPermission('inbox.view')) return { success: false, error: 'Du har ikke adgang til mail-indbakken' }
  const own = await g.ctx.supabase.from('incoming_emails').select('id').eq('id', emailId).maybeSingle()
  if (!own.data) return { success: false, error: 'Mailen findes ikke eller du har ikke adgang' }
  const c = await loadCoordinatorContext(createAdminClient(), emailId)
  if (!c.ok) return { success: false, error: c.error }
  const f = c.ctx.form
  const name = (f?.name ?? c.ctx.email.senderName ?? '').trim()
  const draft: CustomerDraft = {
    customerType: 'private', name, contactPerson: name, email: (f?.email ?? c.ctx.email.effectiveSender ?? '').trim(),
    phone: (f?.phone ?? c.ctx.signals.phones[0] ?? '').trim(), address: (f?.address ?? '').trim(), postalCode: (f?.postalCode ?? '').trim(), city: (f?.city ?? '').trim(),
    vat: c.ctx.signals.vats[0] ?? '',
  }
  if (draft.vat) draft.customerType = 'business'
  const v = await visibleCandidates(g.ctx.supabase, { name: draft.name, contactPerson: draft.contactPerson, email: draft.email, phone: draft.phone, vat: draft.vat, address: draft.address, postalCode: draft.postalCode })
  return { success: true, data: { draft, candidates: v.list, hidden: v.hidden } }
}

export async function checkCustomerDuplicatesAction(input: DupInput): Promise<R<{ candidates: DupCandidateView[]; hidden: number }>> {
  const g = await requireDedupeCtx(); if ('error' in g) return { success: false, error: g.error as string }
  const clean: DupInput = {}
  for (const k of ['name', 'contactPerson', 'email', 'phone', 'vat', 'address', 'postalCode'] as const) { const v = input?.[k]; if (typeof v === 'string') clean[k] = v.slice(0, 200) }
  const v = await visibleCandidates(g.ctx.supabase, clean)
  return { success: true, data: { candidates: v.list, hidden: v.hidden } }
}

/** Medarbejderen valgte en eksisterende kunde i stedet for at oprette en ny (= undgået dublet når kandidater blev vist) */
export async function chooseExistingCustomerForMailAction(input: { emailId: string; customerId: string; candidatesShown: number }): Promise<R<{ linked: true }>> {
  if (!UUID.test(String(input?.emailId ?? '')) || !UUID.test(String(input?.customerId ?? ''))) return { success: false, error: 'Ugyldige oplysninger' }
  const g = await requireDedupeCtx('customers.view'); if ('error' in g) return { success: false, error: g.error as string }
  if (!g.ctx.hasPermission('inbox.view')) return { success: false, error: 'Du har ikke adgang til mail-indbakken' }
  const c = await g.ctx.supabase.from('customers').select('id').eq('id', input.customerId).maybeSingle()
  if (!c.data) return { success: false, error: 'Kunden findes ikke eller du har ikke adgang' }
  const l = await linkEmailToCustomer(input.emailId, input.customerId)
  if (!l.success) return { success: false, error: l.error ?? 'Mailen kunne ikke kobles' }
  const shown = Math.max(0, Math.min(50, Number(input.candidatesShown) || 0))
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: input.emailId, action: shown > 0 ? 'customer_duplicate_avoided' : 'coordinator_decision',
    action_description: shown > 0 ? 'Eksisterende kunde valgt i stedet for ny (dublet undgået)' : 'Kobl til eksisterende kunde', metadata: { customer_id: input.customerId, candidates_shown: shown, version: 'c4-v1' } })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: { linked: true } }
}

/**
 * Opret ny kunde fra mailen efter dubletkontrol. Stærke kandidater (samme e-mail/telefon/CVR) kræver en begrundelse.
 * Kunden oprettes via den eksisterende quickCreateCustomer (customers.create), og mailen kobles manuelt bagefter.
 */
export async function createCustomerFromMailCheckedAction(input: { emailId: string; draft: CustomerDraft; reason?: string | null }): Promise<R<{ customerId: string } | { needsReason: true; candidates: DupCandidateView[] }>> {
  if (!UUID.test(String(input?.emailId ?? ''))) return { success: false, error: 'Ugyldig mail' }
  const g = await requireDedupeCtx(); if ('error' in g) return { success: false, error: g.error as string }
  if (!g.ctx.hasPermission('inbox.view')) return { success: false, error: 'Du har ikke adgang til mail-indbakken' }
  const own = await g.ctx.supabase.from('incoming_emails').select('id, customer_id').eq('id', input.emailId).maybeSingle()
  if (!own.data) return { success: false, error: 'Mailen findes ikke eller du har ikke adgang' }
  if ((own.data as { customer_id: string | null }).customer_id) return { success: false, error: 'Mailen er allerede koblet til en kunde — fjern koblingen først' }
  const d = input.draft
  const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  const draft: CustomerDraft = { customerType: d?.customerType === 'business' ? 'business' : 'private', name: str(d?.name), contactPerson: str(d?.contactPerson) || str(d?.name),
    email: str(d?.email), phone: str(d?.phone, 50), address: str(d?.address), postalCode: str(d?.postalCode, 10), city: str(d?.city, 100), vat: str(d?.vat, 20) }
  if (!draft.name) return { success: false, error: 'Navn er påkrævet' }
  if (!draft.email) return { success: false, error: 'E-mail er påkrævet' }
  const reason = str(input.reason, 300)
  const v = await visibleCandidates(g.ctx.supabase, { name: draft.name, contactPerson: draft.contactPerson, email: draft.email, phone: draft.phone, vat: draft.vat, address: draft.address, postalCode: draft.postalCode })
  const strong = v.list.filter((c) => c.strength === 'strong').length + v.strongHidden
  if (strong > 0 && !reason) return { success: true, data: { needsReason: true, candidates: v.list } }
  const created = await quickCreateCustomer({
    customer_type: draft.customerType, primary_name: draft.name, contact_person: draft.contactPerson, email: draft.email, phone: draft.phone || null,
    billing_address: draft.address || null, billing_postal_code: draft.postalCode || null, billing_city: draft.city || null,
    vat_number: draft.customerType === 'business' ? draft.vat || null : null, allow_duplicate_email: !!reason,
  })
  if (!created.success || !created.data) return { success: false, error: created.error ?? 'Kunden kunne ikke oprettes' }
  const customerId = (created.data as { id: string }).id
  const l = await linkEmailToCustomer(input.emailId, customerId)
  await insertAuditRow({ user_id: g.ctx.userId, entity_type: 'incoming_email', entity_id: input.emailId, action: 'customer_created_with_check',
    action_description: 'Ny kunde oprettet fra mail efter dubletkontrol', metadata: { customer_id: customerId, candidates_shown: v.list.length, strong_candidates: strong, reason_given: !!reason, linked: l.success, version: 'c4-v1' } })
  revalidatePath('/dashboard/arbejdsko')
  return { success: true, data: { customerId } }
}

export interface DuplicateReportRow { basis: DuplicateBasis; strength: DuplicateStrength; suggestion: string; autoCreated: number; customers: Array<{ id: string; customerNumber: string | null; name: string; autoCreated: boolean }> }

/** Read-only dubletrapport (kun brugere der ser alle kunder: customers.view.all). Ændrer intet. */
export async function getDuplicateReportAction(): Promise<R<{ groups: DuplicateReportRow[]; customersTotal: number }>> {
  const g = await requireDedupeCtx('customers.view'); if ('error' in g) return { success: false, error: g.error as string }
  if (!g.ctx.hasPermission('customers.view.all')) return { success: false, error: 'Dubletrapporten kræver adgang til alle kunder' }
  const reg = await loadRegistry(createAdminClient())
  const dups = toDup(reg.customers)
  const byId = new Map(dups.map((c) => [c.id, c]))
  const groups = duplicateReport(dups).map((gr) => ({ basis: gr.basis, strength: gr.strength, suggestion: gr.suggestion, autoCreated: gr.autoCreated,
    customers: gr.customerIds.map((id) => { const c = byId.get(id)!; return { id, customerNumber: c.customerNumber, name: c.name ?? 'Kunde', autoCreated: c.autoCreated } }) }))
  return { success: true, data: { groups, customersTotal: dups.length } }
}
