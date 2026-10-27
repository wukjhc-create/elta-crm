/**
 * 00240-F1 (Henrik 2026-10-27): fakturaoplysninger på en sag kræver
 *   invoices.view.all  — ELLER —  invoices.view.own_cases OG at sagen er i brugerens EFFEKTIVE sags-scope
 *   (oprettet/tildelt/arbejdsordre/konverteret fra eget tilbud — getCaseScope/userCanViewCase).
 * Salg udvides IKKE til alle fakturaer; fakturaer uden sag ses kun med invoices.view.all.
 * Server-modul (ikke 'use server', aldrig i klientkode — scripts/assert-server-only-helpers.ts).
 *
 * RLS (can_view_case_finance) er stadig rolle-baseret (salg: kun created_by) indtil børnetabel-bølgen. Efter et bestået
 * scope-tjek læses fakturaerne derfor med admin-klienten (invoiceReader) — ALTID afgrænset til de tjekkede sager og med
 * eksplicitte salgs-/statuskolonner (aldrig kost/avance/løn/indkøb).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCaseScope, scopePermissions, userCanViewCase, type ScopeContext } from '@/lib/auth/case-scope'
import { createAdminClient } from '@/lib/supabase/admin'

export type InvoiceCaseScope =
  | { type: 'all' }
  /** invoices.view.own_cases + cases.view.all: alle fakturaer MED sag (ikke sagsløse) */
  | { type: 'all_cases' }
  | { type: 'cases'; caseIds: string[] }
  | { type: 'none' }

export async function invoiceCaseScope(ctx: ScopeContext): Promise<InvoiceCaseScope> {
  const can = await scopePermissions(ctx)
  if (can('invoices.view.all')) return { type: 'all' }
  if (!can('invoices.view.own_cases')) return { type: 'none' }
  const scope = await getCaseScope({ ...ctx, hasPermission: can })
  return scope.type === 'all' ? { type: 'all_cases' } : { type: 'cases', caseIds: scope.caseIds }
}

/** Må brugeren se fakturaoplysninger på DENNE sag? */
export async function canViewCaseInvoices(caseId: string, ctx: ScopeContext): Promise<boolean> {
  const can = await scopePermissions(ctx)
  if (can('invoices.view.all')) return true
  if (!can('invoices.view.own_cases')) return false
  return userCanViewCase(caseId, { ...ctx, hasPermission: can })
}

/** Er en faktura (via dens case_id) inden for scopet? Sagsløse fakturaer kun ved 'all'. */
export function invoiceInScope(scope: InvoiceCaseScope, caseId: string | null | undefined): boolean {
  if (scope.type === 'all') return true
  if (!caseId || scope.type === 'none') return false
  return scope.type === 'all_cases' || scope.caseIds.includes(caseId)
}

/**
 * Klient til fakturalæsning EFTER et bestået scope-tjek: brugerens egen ved 'all' (RLS giver alt), ellers admin-klienten
 * (RLS ville skære salg ned til created_by). Kalderen SKAL selv afgrænse forespørgslen til de tjekkede sager.
 */
export function invoiceReader(scope: InvoiceCaseScope, userDb: SupabaseClient): SupabaseClient {
  return scope.type === 'all' ? userDb : (createAdminClient() as unknown as SupabaseClient)
}
