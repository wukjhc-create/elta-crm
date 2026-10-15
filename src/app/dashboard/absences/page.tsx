import type { Metadata } from 'next'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { listCalendarEmployeesAction } from '@/lib/actions/employees'
import { AbsencesClient } from './absences-client'

export const metadata: Metadata = {
  title: 'Fravær',
  description: 'Medarbejderfravær (type og periode)',
}

export const dynamic = 'force-dynamic'

// 00228 (Henrik 2026-10-15): bogholderi ser type + periode; admin/serviceleder vedligeholder. Ingen helbredsdetaljer.
export default async function AbsencesPage() {
  const ctx = await getPageRoleContext()
  if (!ctx.has('absences.view')) return <NoAccess permission="absences.view" />
  const canManage = ctx.has('absences.manage')
  const employees = canManage ? (await listCalendarEmployeesAction()).map((e) => ({ id: e.id, name: e.name })) : []
  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <AbsencesClient canManage={canManage} employees={employees} />
    </div>
  )
}
