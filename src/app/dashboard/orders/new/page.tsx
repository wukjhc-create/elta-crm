import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getCustomersForOrderSelect,
  getProfilesForOrderSelect,
  getEmployeesForOrderSelect,
} from '@/lib/actions/service-cases'
import { NewOrderForm } from './new-order-form'

export const metadata: Metadata = {
  title: 'Ny sag / ordre',
  description: 'Opret en ny sag eller ordre',
}

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const [customersRes, profilesRes, employeesRes] = await Promise.all([
    getCustomersForOrderSelect(),
    getProfilesForOrderSelect(),
    getEmployeesForOrderSelect(),
  ])

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
        <span className="text-gray-900">Ny</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">Opret ny sag / ordre</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sagsnummer (SVC-…) tildeles automatisk når sagen oprettes.
        </p>
      </header>

      <NewOrderForm
        customers={customers}
        profiles={profiles}
        employees={employees}
      />
    </div>
  )
}
