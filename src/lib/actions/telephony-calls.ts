'use server'

/**
 * 00247 opkaldshistorik — kontrollerede handlinger (logik i lib/telephony/call-actions-core.ts).
 * Læs: calls.view / calls.view_unmatched (+ RLS). Bekræft kunde, kobl sag, afvis: calls.match. Medarbejder-kobling:
 * users.manage_roles. Ingen handling her opretter opgave, påmindelse, SMS eller kundekommunikation; en tilbageringning
 * oprettes kun via den normale opgave-handling (customer-tasks.ts) ved et eksplicit klik.
 * Tåler at tabellerne mangler (prod før 00247): available=false / unavailable.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  confirmCallCustomerCore,
  linkCallCaseCore,
  listCallsCore,
  rejectCallMatchCore,
  setEmployeeLinkCore,
  type CallActionCtx,
  type CallActionResult,
  type CallListItem,
} from '@/lib/telephony/call-actions-core'

async function ctx(): Promise<CallActionCtx> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  return { supabase: supabase as unknown as CallActionCtx['supabase'], admin: createAdminClient(), userId, hasPermission }
}

export async function listTelephonyCalls(opts: { limit?: number; unconfirmedOnly?: boolean } = {}): Promise<{ available: boolean; calls: CallListItem[]; error?: string }> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('calls.view') && !hasPermission('calls.view_unmatched')) return { available: false, calls: [], error: 'Du har ikke adgang til opkald.' }
  return listCallsCore({ supabase: supabase as unknown as CallActionCtx['supabase'], admin: createAdminClient(), userId, hasPermission }, opts)
}

export async function confirmCallCustomer(callId: string, customerId: string, expectedVersion: number): Promise<CallActionResult> {
  const c = await ctx()
  if (!c.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at koble opkald til kunder.' }
  const res = await confirmCallCustomerCore(c, callId, customerId, expectedVersion)
  if (res.success) revalidatePath('/dashboard/cti')
  return res
}

export async function linkCallCase(callId: string, caseId: string | null, expectedVersion: number): Promise<CallActionResult> {
  const c = await ctx()
  if (!c.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at koble opkald til sager.' }
  const res = await linkCallCaseCore(c, callId, caseId, expectedVersion)
  if (res.success) revalidatePath('/dashboard/cti')
  return res
}

export async function rejectCallMatch(callId: string, expectedVersion: number): Promise<CallActionResult> {
  const c = await ctx()
  if (!c.hasPermission('calls.match')) return { success: false, error: 'Du har ikke adgang til at rette opkald.' }
  const res = await rejectCallMatchCore(c, callId, expectedVersion)
  if (res.success) revalidatePath('/dashboard/cti')
  return res
}

export async function setTelephonyEmployeeLink(providerEmployeeId: string, profileId: string | null): Promise<{ success: boolean; error?: string; outcome?: string }> {
  const c = await ctx()
  if (!c.hasPermission('users.manage_roles')) return { success: false, error: 'Du har ikke adgang til at koble telefoni-medarbejdere.' }
  return setEmployeeLinkCore(c, providerEmployeeId, profileId)
}
