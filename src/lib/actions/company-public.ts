'use server'

/**
 * Firmaoplysninger til dokumenter og formularer (tilbudsvisning/-print, tilbudsformular, kundekort,
 * dashboard). Samme returform som getCompanySettings, men:
 *   - roller med settings.view får som før den fulde række (getCompanySettings),
 *   - øvrige roller med adgang til tilbud/kunder får KUN offentlige kolonner (navn, adresse, CVR,
 *     kontakt, bank, logo, standarder) — aldrig SMTP/SMS-hemmeligheder.
 * Før: getCompanySettings krævede settings.view → for salg var firmaet "Virksomhed" uden adresse/CVR
 * på tilbuds-print, og tilbudsformularen manglede standard-gyldighed.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { COMPANY_SETTINGS_PUBLIC_COLUMNS } from '@/lib/settings/company-columns'
import type { CompanySettings } from '@/types/company-settings.types'
import type { ActionResult } from '@/types/common.types'

export async function getDocumentCompanySettings(): Promise<ActionResult<CompanySettings>> {
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (hasPermission('settings.view')) {
    const { getCompanySettings } = await import('@/lib/actions/settings')
    return getCompanySettings()
  }
  if (!hasPermission('offers.view') && !hasPermission('customers.view')) {
    return { success: false, error: 'Manglende tilladelse' }
  }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient()
    .from('company_settings')
    .select(COMPANY_SETTINGS_PUBLIC_COLUMNS)
    .limit(1)
    .maybeSingle()
  if (error || !data) return { success: false, error: 'Firmaindstillinger ikke fundet' }
  return { success: true, data: data as unknown as CompanySettings }
}
