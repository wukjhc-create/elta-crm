'use server'

/**
 * T6 — tidsstemplede noter på KUNDEN (customer_notes, 00196). customers.notes (ét fritekstfelt) overskrives aldrig.
 * Sager bruger den eksisterende case_notes-model (service-cases.ts). Læs: customers.view; skriv: customers.edit;
 * ret/slet: egen note eller admin/serviceleder (håndhæves også af RLS). Alt audit-logges (kun længde, ikke tekst).
 *
 * Tabellen findes kun hvor 00196 er anvendt: ellers returnerer listen available=false, og UI'et skjules.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAuditLog } from '@/lib/actions/audit'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

const CUSTOMER_NOTE_MAX = 5000

export type CustomerNote = { id: string; content: string; source: 'manual' | 'assistant' | 'telegram' | 'system'; created_at: string; created_by: string | null; author: string | null; canDelete: boolean }

export async function getCustomerNotes(customerId: string): Promise<{ available: boolean; notes: CustomerNote[]; canWrite: boolean }> {
  validateUUID(customerId, 'kunde ID')
  const { supabase, userId, role, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('customers.view')) return { available: false, notes: [], canWrite: false }
  const { data, error } = await supabase
    .from('customer_notes')
    .select('id, content, source, created_at, created_by')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return { available: false, notes: [], canWrite: false }
  const rows = (data ?? []) as Array<Omit<CustomerNote, 'author' | 'canDelete'>>
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[]
  const { data: profs } = authorIds.length ? await supabase.from('profiles').select('id, full_name').in('id', authorIds) : { data: [] }
  const names = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name]))
  // samme regel som RLS (customer_notes_delete): egen note eller admin/serviceleder
  const isLead = role === 'admin' || role === 'serviceleder'
  return {
    available: true,
    canWrite: hasPermission('customers.edit'),
    notes: rows.map((r) => ({ ...r, author: r.created_by ? names.get(r.created_by) ?? null : null, canDelete: r.created_by === userId || isLead })),
  }
}

export async function createCustomerNote(customerId: string, content: string): Promise<{ success: boolean; error?: string }> {
  validateUUID(customerId, 'kunde ID')
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('customers.edit')) return { success: false, error: 'Manglende tilladelse: customers.edit' }
  const text = (content ?? '').trim()
  if (!text) return { success: false, error: 'Noten er tom' }
  if (text.length > CUSTOMER_NOTE_MAX) return { success: false, error: `Noten er for lang (højst ${CUSTOMER_NOTE_MAX} tegn)` }
  const { data, error } = await supabase.from('customer_notes').insert({ customer_id: customerId, content: text, source: 'manual', created_by: userId }).select('id').single()
  if (error || !data) {
    logger.error('createCustomerNote failed', { error })
    return { success: false, error: 'Kunne ikke gemme noten' }
  }
  try {
    await createAuditLog({ entity_type: 'customer', entity_id: customerId, entity_name: customerId, action: 'update', action_description: 'Kundenote tilføjet', metadata: { event: 'customer_note_added', note_id: (data as { id: string }).id, source: 'manual', content_length: text.length } })
  } catch { /* best-effort */ }
  revalidatePath(`/dashboard/customers/${customerId}`)
  return { success: true }
}

export async function deleteCustomerNote(noteId: string): Promise<{ success: boolean; error?: string }> {
  validateUUID(noteId, 'note ID')
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('customers.edit')) return { success: false, error: 'Manglende tilladelse: customers.edit' }
  // RLS: kun egen note eller admin/serviceleder — 0 rækker = ikke tilladt
  const { data, error } = await supabase.from('customer_notes').delete().eq('id', noteId).select('id, customer_id')
  if (error || !(data ?? []).length) return { success: false, error: 'Du kan kun slette dine egne noter' }
  const customerId = (data as Array<{ customer_id: string }>)[0].customer_id
  try {
    await createAuditLog({ entity_type: 'customer', entity_id: customerId, entity_name: customerId, action: 'update', action_description: 'Kundenote slettet', metadata: { event: 'customer_note_deleted', note_id: noteId } })
  } catch { /* best-effort */ }
  revalidatePath(`/dashboard/customers/${customerId}`)
  return { success: true }
}
