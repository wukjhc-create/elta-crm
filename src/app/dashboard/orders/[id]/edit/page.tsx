import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getServiceCase,
  getCustomersForOrderSelect,
  getProfilesForOrderSelect,
  getEmployeesForOrderSelect,
} from '@/lib/actions/service-cases'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { EditOrderForm } from './edit-order-form'

export const metadata: Metadata = {
  title: 'Rediger sag / ordre',
  description: 'Rediger en sag eller ordre',
}

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Accept either UUID or case_number in the URL.
  let resolvedId = id
  if (!UUID_RE.test(id)) {
    try {
      const { supabase } = await getAuthenticatedClient()
      const { data: row } = await supabase
        .from('service_cases')
        .select('id')
        .eq('case_number', id)
        .maybeSingle()
      if (row) resolvedId = row.id as string
      else notFound()
    } catch {
      notFound()
    }
  }

  const [caseRes, customersRes, profilesRes, employeesRes] = await Promise.all([
    getServiceCase(resolvedId),
    getCustomersForOrderSelect(),
    getProfilesForOrderSelect(),
    getEmployeesForOrderSelect(),
  ])

  if (!caseRes.success || !caseRes.data) {
    notFound()
  }

  const sag = caseRes.data
  const customers = customersRes.success && customersRes.data ? customersRes.data : []
  const profiles = profilesRes.success && profilesRes.data ? profilesRes.data : []
  const employees = employeesRes.success && employeesRes.data ? employeesRes.data : []

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link href="/dashboard/orders" className="hover:text-gray-700">Sager / Ordrer</Link>
        <span>/</span>
        <Link href={`/dashboard/orders/${sag.case_number}`} className="hover:text-gray-700">
          {sag.case_number}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Rediger</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">
          Rediger {sag.case_number}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Sagsnummeret kan ikke ændres.
        </p>
      </header>

      <EditOrderForm
        sag={sag}
        customers={customers}
        profiles={profiles}
        employees={employees}
      />
    </div>
  )
}
