/**
 * PM3-8 (Henrik 2026-10-19): montør (uden tasks.create) må kun sende opgavemail til KENDTE kunde-/kontaktadresser på en
 * sag/arbejdsordre der er tildelt montøren — ingen fri modtager og ingen cc. Admin/serviceleder/salg (tasks.create)
 * beholder den brede ret. Egen fil (ikke 'use server'), så sendTaskEmails gate forbliver tasks.edit.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/auth.types'
import type { Permission } from '@/lib/auth/permissions'

interface GuardCtx { supabase: SupabaseClient; userId: string; role: UserRole; hasPermission: (p: Permission) => boolean }

/** null = må sende; ellers dansk fejltekst. `to`/`cc` er trimmede og lowercased. */
export async function montorTaskMailDenied(ctx: GuardCtx, task: { serviceCaseId: string | null; customerId: string }, to: string, cc: string): Promise<string | null> {
  if (ctx.hasPermission('tasks.create')) return null
  if (cc) return 'Montører kan ikke tilføje cc på opgavemails'
  const { userCanViewCase, getWorkOrderEmployeeScope } = await import('@/lib/auth/case-scope')
  let assigned = false
  if (task.serviceCaseId) {
    assigned = await userCanViewCase(task.serviceCaseId, { role: ctx.role, userId: ctx.userId, supabase: ctx.supabase })
  } else {
    const scope = await getWorkOrderEmployeeScope({ supabase: ctx.supabase, userId: ctx.userId, role: ctx.role })
    if (scope.type === 'employee' && scope.employeeId) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { count } = await createAdminClient().from('work_orders').select('id, service_cases!inner(customer_id)', { count: 'exact', head: true })
        .eq('assigned_employee_id', scope.employeeId).neq('status', 'cancelled').eq('service_cases.customer_id', task.customerId)
      assigned = (count ?? 0) > 0
    }
  }
  if (!assigned) return 'Du kan kun sende mail på sager/arbejdsordrer, der er tildelt dig'
  const { getRecipientOptionsForCase, getRecipientOptionsForCustomer } = await import('@/lib/actions/mail-recipients')
  const opts = task.serviceCaseId ? await getRecipientOptionsForCase(task.serviceCaseId) : await getRecipientOptionsForCustomer(task.customerId)
  const known = new Set(opts.options.map((o) => String(o.email ?? '').trim().toLowerCase()).filter(Boolean))
  return known.has(to) ? null : 'Vælg en af kundens kendte adresser'
}
