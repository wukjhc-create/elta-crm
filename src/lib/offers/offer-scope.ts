/**
 * API-2 (Henrik 2026-10-19): salg ser kun egne tilbud — tilbud de selv har oprettet, eller som hører til en sag i
 * deres sags-scope (offers.converted_case_id / source_case_id ∈ getCaseScope). Admin/serviceleder (offers.view.all)
 * ser alle. Før kunne enhver med offers.view (salg) læse ALLE tilbud inkl. underskrift.
 *
 * Bevidst IKKE 'use server' (hjælper til actions/ruter). DB-niveau (RLS) = senere migration; indtil da håndhæves
 * scopet i hver læse-/skrivevej mod tilbud.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/auth.types'
import { hasPermission } from '@/lib/auth/permissions'
import { getCaseScope } from '@/lib/auth/case-scope'
import { selectInChunks } from '@/lib/supabase/in-chunks'
import { logger } from '@/lib/utils/logger'

export type OfferScope = { all: true } | { all: false; userId: string; extraIds: string[] }

interface ScopeCtx { role: UserRole; userId: string; supabase: SupabaseClient }

/** Loft for tilbud fra egne sager, som ikke er oprettet af brugeren selv (PostgREST .in()-grænse). */
const MAX_EXTRA = 300

export async function getOfferScope(ctx: ScopeCtx): Promise<OfferScope> {
  if (hasPermission(ctx.role, 'offers.view.all')) return { all: true }
  const cases = await getCaseScope(ctx)
  if (cases.type === 'all') return { all: true }
  let extraIds: string[] = []
  if (cases.caseIds.length) {
    const rows = await selectInChunks<{ id: string }>(cases.caseIds, (chunk) => ctx.supabase.from('offers').select('id')
      .neq('created_by', ctx.userId)
      .or(`converted_case_id.in.(${chunk.join(',')}),source_case_id.in.(${chunk.join(',')})`))
      .catch((err: unknown) => { logger.warn('offer-scope: sagstilbud kunne ikke hentes', { error: err }); return [] as Array<{ id: string }> })
    extraIds = [...new Set(rows.map((r) => r.id))]
    if (extraIds.length > MAX_EXTRA) {
      logger.warn('offer-scope: flere sagstilbud end loftet — de ældste udelades', { metadata: { count: extraIds.length } })
      extraIds = extraIds.slice(0, MAX_EXTRA)
    }
  }
  return { all: false, userId: ctx.userId, extraIds }
}

/** PostgREST .or()-udtryk for scopet; null = intet filter (alle tilbud). */
export function offerScopeOr(scope: OfferScope): string | null {
  if (scope.all) return null
  const parts = [`created_by.eq.${scope.userId}`]
  if (scope.extraIds.length) parts.push(`id.in.(${scope.extraIds.join(',')})`)
  return parts.join(',')
}

/** Lægger scopet på en offers-forespørgsel (uændret ved 'alle'). */
export function applyOfferScope<Q extends { or: (filter: string) => Q }>(query: Q, scope: OfferScope): Q {
  const f = offerScopeOr(scope)
  return f ? query.or(f) : query
}

/** Må brugeren se/ændre dette tilbud? (rækken skal findes og være i scopet) */
export async function offerInScope(supabase: SupabaseClient, offerId: string, scope: OfferScope): Promise<boolean> {
  if (scope.all) return true
  if (scope.extraIds.includes(offerId)) return true
  const { data } = await supabase.from('offers').select('created_by').eq('id', offerId).maybeSingle()
  return (data as { created_by?: string | null } | null)?.created_by === scope.userId
}

/**
 * Til actions der tager et tilbuds-id: null = adgang; ellers "Tilbud ikke fundet" (afslører ikke eksistens).
 * Henter selv brugerens kontekst.
 */
export async function offerScopeDeniedFor(offerId: string | null | undefined): Promise<string | null> {
  if (!offerId || !/^[0-9a-f-]{36}$/i.test(String(offerId))) return 'Tilbud ikke fundet'
  try {
    const { getAuthenticatedClientWithRole } = await import('@/lib/actions/action-helpers')
    const ctx = await getAuthenticatedClientWithRole()
    return (await offerInScope(ctx.supabase, offerId, await getOfferScope(ctx))) ? null : 'Tilbud ikke fundet'
  } catch {
    return 'Ikke logget ind'
  }
}

/** .or()-filter for den indloggede brugers tilbuds-scope ('id.not.is.null' = alle) — til lister/tællinger. */
export async function currentOfferScopeOr(): Promise<string> {
  try {
    const { getAuthenticatedClientWithRole } = await import('@/lib/actions/action-helpers')
    const ctx = await getAuthenticatedClientWithRole()
    return offerScopeOr(await getOfferScope(ctx)) ?? 'id.not.is.null'
  } catch {
    return 'id.is.null' // fail-closed: ingen tilbud uden gyldig kontekst
  }
}
