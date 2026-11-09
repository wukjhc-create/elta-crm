'use server'

/**
 * Employee Setup Integrity (2026-11-09): den indloggede brugers EGEN medarbejderopsætning, så "Mine job" og
 * tidsregistrering kan sige hvad der mangler i stedet for at vise en tom liste. Kun egne data; ingen satser/beløb.
 */
import { formatError, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { EMPLOYEE_SETUP_TEXT, loadEmployeeSetup, roleRequiresEmployee, type EmployeeLinkState } from '@/lib/employees/setup-integrity'
import type { ActionResult } from '@/types/common.types'

export interface MyEmployeeSetup {
  state: EmployeeLinkState
  /** Opsætningen er et problem for denne bruger (montør uden entydig medarbejder, eller dublet/inaktiv for alle) */
  incomplete: boolean
  message: string | null
}

export async function getMyEmployeeSetupAction(): Promise<ActionResult<MyEmployeeSetup>> {
  try {
    const { supabase, userId, role } = await getAuthenticatedClientWithRole()
    const setup = await loadEmployeeSetup(supabase, userId)
    // Kontor-roller uden medarbejder er normalt (de registrerer ikke tid); dubletter/kun-inaktiv er altid et problem
    const incomplete = setup.state === 'ambiguous' || setup.state === 'inactive_only' || (setup.state === 'missing' && roleRequiresEmployee(role))
    return {
      success: true,
      data: { state: setup.state, incomplete, message: incomplete && setup.state !== 'linked' ? EMPLOYEE_SETUP_TEXT[setup.state] : null },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke kontrollere din medarbejderopsætning') }
  }
}
