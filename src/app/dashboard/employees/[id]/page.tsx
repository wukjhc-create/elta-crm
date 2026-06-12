import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEmployeeAction } from '@/lib/actions/employees'
import { EmployeeDetailClient } from './employee-detail-client'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'

export const metadata: Metadata = {
  title: 'Medarbejder',
  description: 'Detalje for en medarbejder',
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await getPageRoleContext()
  if (!ctx.has('employees.view')) {
    return <NoAccess permission="employees.view" />
  }
  const canSeePayroll = ctx.has('employees.payroll.view')
  const canEditPayroll = ctx.has('employees.payroll.edit')
  const canEditEmployee = ctx.has('employees.edit')
  const canManageLogin = ctx.has('users.edit')

  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const employee = await getEmployeeAction(id)
  if (!employee) notFound()

  return (
    <EmployeeDetailClient
      employee={employee}
      canSeePayroll={canSeePayroll}
      canEditPayroll={canEditPayroll}
      canEditEmployee={canEditEmployee}
      canManageLogin={canManageLogin}
    />
  )
}
