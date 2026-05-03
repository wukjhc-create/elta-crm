import type { Metadata } from 'next'
import Link from 'next/link'
import { NewEmployeeForm } from './new-employee-form'

export const metadata: Metadata = {
  title: 'Opret medarbejder',
  description: 'Tilføj en ny medarbejder',
}

export const dynamic = 'force-dynamic'

export default function NewEmployeePage() {
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
        <span className="text-gray-900">Ny</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">Opret ny medarbejder</h1>
        <p className="text-sm text-gray-500 mt-1">
          Stamdata kan altid redigeres bagefter. Satser/kostpriser sættes på medarbejderens detaljeside.
        </p>
      </header>

      <NewEmployeeForm />
    </div>
  )
}
