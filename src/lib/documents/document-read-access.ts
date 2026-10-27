/**
 * Læseregel for ét customer_documents-dokument (samme regel som getCustomerDocuments CU-1/SEC-5 og besigtigelsens
 * documentReadDenied; = 00241-forslagets dokument-prædikat):
 *  - dokument på en sag      → sagen skal være i brugerens scope (userCanViewCase)
 *  - dokument uden sag       → cases.view.all eller customers.edit, ellers skal kunden have en sag i brugerens scope
 *  - mail-vedhæftning (source_email_id) → kræver desuden customers.emails.view (interne — aldrig til montør)
 * Returnerer fejltekst ved afvisning, null = tilladt. Fejl ved opslag afviser (fail-closed).
 * Server-modul (ikke 'use server', aldrig i klientkode — scripts/assert-server-only-helpers.ts).
 */
import { getCaseScope, userCanViewCase, type ScopeContext } from '@/lib/auth/case-scope'
import type { Permission } from '@/lib/auth/permissions'

export interface DocumentAccessRow {
  service_case_id?: string | null
  customer_id?: string | null
  source_email_id?: string | null
}

export async function customerDocumentReadDenied(
  doc: DocumentAccessRow,
  ctx: ScopeContext & { hasPermission: (p: Permission) => boolean },
): Promise<string | null> {
  if (doc.source_email_id && !ctx.hasPermission('customers.emails.view')) return 'Mail-vedhæftninger kræver adgang til kundens mails'
  if (doc.service_case_id) {
    return (await userCanViewCase(doc.service_case_id, ctx)) ? null : 'Du har ikke adgang til dette dokument'
  }
  if (ctx.hasPermission('cases.view.all') || ctx.hasPermission('customers.edit')) return null
  if (!doc.customer_id) return 'Du har ikke adgang til dette dokument'
  const scope = await getCaseScope(ctx)
  if (scope.type === 'all') return null
  for (let i = 0; i < scope.caseIds.length; i += 200) {
    const { count, error } = await ctx.supabase.from('service_cases').select('id', { count: 'exact', head: true })
      .eq('customer_id', doc.customer_id).in('id', scope.caseIds.slice(i, i + 200))
    if (error) return 'Adgangen kunne ikke kontrolleres — prøv igen'
    if ((count ?? 0) > 0) return null
  }
  return 'Du har ikke adgang til dette dokument'
}
