'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEmployeeAction } from '@/lib/actions/employees'
import {
  EmployeeIdentitySchema,
  type EmployeeIdentityInput,
} from '@/lib/validations/employees'
import { EMPLOYEE_ROLE_OPTIONS } from '@/types/employees.types'

export function NewEmployeeForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployeeIdentityInput>({
    resolver: zodResolver(EmployeeIdentitySchema),
    defaultValues: {
      role: 'elektriker',
      active: true,
    },
  })

  const onSubmit = async (data: EmployeeIdentityInput) => {
    setError(null)
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const result = await createEmployeeAction(data)
      if (!result.ok || !result.data) {
        setError(result.message)
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
        return
      }
      router.push(`/dashboard/employees/${result.data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl ved oprettelse')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldError = (key: string) =>
    (errors[key as keyof typeof errors]?.message as string | undefined) ??
    fieldErrors[key]?.[0]

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 bg-white rounded-lg border p-4 sm:p-6"
    >
      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Stamdata</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fornavn *" error={fieldError('first_name')}>
            <input
              {...register('first_name')}
              type="text"
              autoFocus
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="Efternavn *" error={fieldError('last_name')}>
            <input
              {...register('last_name')}
              type="text"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Medarbejdernr." error={fieldError('employee_number')}>
            <input
              {...register('employee_number')}
              type="text"
              placeholder="fx 1042"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="Rolle *" error={fieldError('role')}>
            <select
              {...register('role')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {EMPLOYEE_ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <label className="flex items-center gap-2 mt-2">
              <input
                {...register('active')}
                type="checkbox"
                disabled={isSubmitting}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Aktiv</span>
            </label>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Kontakt</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="E-mail *" error={fieldError('email')}>
            <input
              {...register('email')}
              type="email"
              placeholder="navn@eltasolar.dk"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="Telefon" error={fieldError('phone')}>
            <input
              {...register('phone')}
              type="tel"
              placeholder="+45 …"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>

        <Field label="Adresse" error={fieldError('address')}>
          <input
            {...register('address')}
            type="text"
            disabled={isSubmitting}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Postnummer" error={fieldError('postal_code')}>
            <input
              {...register('postal_code')}
              type="text"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="By" error={fieldError('city')}>
            <input
              {...register('city')}
              type="text"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Ansættelse</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Ansættelsesdato" error={fieldError('hire_date')}>
            <input
              {...register('hire_date')}
              type="date"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>

          <Field label="Fratrædelsesdato" error={fieldError('termination_date')}>
            <input
              {...register('termination_date')}
              type="date"
              disabled={isSubmitting}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
        </div>

        <Field label="Noter" error={fieldError('notes')}>
          <textarea
            {...register('notes')}
            rows={2}
            disabled={isSubmitting}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </Field>
      </fieldset>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={() => router.push('/dashboard/employees')}
          disabled={isSubmitting}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
        >
          Annullér
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Opretter…' : 'Opret medarbejder'}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Satser (timeløn, intern kost, salgspris, %-tillæg) sættes på medarbejderens detaljeside efter oprettelse.
      </p>
    </form>
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
