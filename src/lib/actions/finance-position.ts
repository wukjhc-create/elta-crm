'use server'

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { buildFinanceDesk, ECONOMIC_DEPS, type FinanceDesk } from '@/lib/finance/finance-desk'

/** Read only. Checks economy.view with effective permissions before any read. */
export async function loadFinanceDesk(): Promise<FinanceDesk | { ok: false; message: string }> {
  const ctx = await getAuthenticatedClientWithRole()
  return buildFinanceDesk(ctx, ECONOMIC_DEPS)
}
