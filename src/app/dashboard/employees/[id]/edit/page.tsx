import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEmployeeAction } from '@/lib/actions/employees'
import { EditEmployeeForm } from './edit-employee-form'

export const metadata: Metadata = {
  title: 'Rediger medarbejder',
  description: 'Rediger medarbejderens stamdata og satser',
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const employee = await getEmployeeAction(id)
  if (!employee) notFound()

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/dashboard/employees" className="hover:text-gray-700">
          Medarbejdere
        </Link>
        <span>/</span>
        <Link href={`/dashboard/employees/${employee.id}`} className="hover:text-gray-700">
          {employee.name || employee.email}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Rediger</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">
          Rediger {employee.name || employee.email}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Stamdata og satser kan redigeres uafhængigt. Hver gang satser
          gemmes, snapshotter systemet de gamle værdier i historik for
          løn-tilbageregning.
        </p>
      </header>

      <EditEmployeeForm employee={employee} />
    </div>
  )
}
