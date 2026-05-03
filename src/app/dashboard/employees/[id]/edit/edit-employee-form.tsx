'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateEmployeeAction,
  setEmployeeCompensationAction,
} from '@/lib/actions/employees'
import {
  EmployeeIdentitySchema,
  EmployeeCompensationSchema,
  type EmployeeIdentityInput,
  type EmployeeCompensationInput,
} from '@/lib/validations/employees'
import {
  EMPLOYEE_ROLE_OPTIONS,
  type EmployeeWithCompensation,
} from '@/types/employees.types'

export function EditEmployeeForm({
  employee,
}: {
  employee: EmployeeWithCompensation
}) {
  return (
    <div className="space-y-6">
      <IdentitySection employee={employee} />
      <CompensationSection employee={employee} />
    </div>
  )
}

// =====================================================
// Identity
// =====================================================

function IdentitySection({ employee }: { employee: EmployeeWithCompensation }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EmployeeIdentityInput>({
    resolver: zodResolver(EmployeeIdentitySchema),
    defaultValues: {
      first_name: employee.first_name ?? '',
      last_name: employee.last_name ?? '',
      email: employee.email,
      role: (employee.role as any) ?? 'elektriker',
      active: employee.active,
      employee_number: employee.employee_number ?? '',
      phone: employee.phone ?? '',
      address: employee.address ?? '',
      postal_code: employee.postal_code ?? '',
      city: employee.city ?? '',
      hire_date: employee.hire_date ?? '',
      termination_date: employee.termination_date ?? '',
      notes: employee.notes ?? '',
    },
  })

  const onSubmit = async (data: EmployeeIdentityInput) => {
    setError(null)
    setInfo(null)
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const res = await updateEmployeeAction(employee.id, data)
      if (!res.ok) {
        setError(res.message)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      setInfo(res.message)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
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
      className="space-y-4 bg-white rounded-lg border p-4 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Stamdata og kontakt</h2>
        {info && <span className="text-sm text-emerald-700">{info}</span>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Fornavn *" error={fieldError('first_name')}>
          <input {...register('first_name')} type="text" disabled={isSubmitting} className={input} />
        </Field>
        <Field label="Efternavn *" error={fieldError('last_name')}>
          <input {...register('last_name')} type="text" disabled={isSubmitting} className={input} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Medarbejdernr." error={fieldError('employee_number')}>
          <input {...register('employee_number')} type="text" disabled={isSubmitting} className={input} />
        </Field>
        <Field label="Rolle *" error={fieldError('role')}>
          <select {...register('role')} disabled={isSubmitting} className={`${input} bg-white`}>
            {EMPLOYEE_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <label className="flex items-center gap-2 mt-2">
            <input {...register('active')} type="checkbox" disabled={isSubmitting} className="rounded border-gray-300" />
            <span className="text-sm">Aktiv</span>
          </label>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="E-mail *" error={fieldError('email')}>
          <input {...register('email')} type="email" disabled={isSubmitting} className={input} />
        </Field>
        <Field label="Telefon" error={fieldError('phone')}>
          <input {...register('phone')} type="tel" disabled={isSubmitting} className={input} />
        </Field>
      </div>

      <Field label="Adresse" error={fieldError('address')}>
        <input {...register('address')} type="text" disabled={isSubmitting} className={input} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Postnummer" error={fieldError('postal_code')}>
          <input {...register('postal_code')} type="text" disabled={isSubmitting} className={input} />
        </Field>
        <Field label="By" error={fieldError('city')}>
          <input {...register('city')} type="text" disabled={isSubmitting} className={input} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Ansættelsesdato" error={fieldError('hire_date')}>
          <input {...register('hire_date')} type="date" disabled={isSubmitting} className={input} />
        </Field>
        <Field label="Fratrædelsesdato" error={fieldError('termination_date')}>
          <input {...register('termination_date')} type="date" disabled={isSubmitting} className={input} />
        </Field>
      </div>

      <Field label="Noter" error={fieldError('notes')}>
        <textarea {...register('notes')} rows={2} disabled={isSubmitting} className={`${input} resize-none`} />
      </Field>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/employees/${employee.id}`)}
          disabled={isSubmitting}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
        >
          Tilbage
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Gemmer…' : 'Gem stamdata'}
        </button>
      </div>
    </form>
  )
}

// =====================================================
// Compensation
// =====================================================

function CompensationSection({ employee }: { employee: EmployeeWithCompensation }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const comp = employee.compensation

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EmployeeCompensationInput>({
    resolver: zodResolver(EmployeeCompensationSchema),
    defaultValues: {
      hourly_wage: comp?.hourly_wage ?? null,
      internal_cost_rate: comp?.internal_cost_rate ?? null,
      sales_rate: comp?.sales_rate ?? null,
      pension_pct: comp?.pension_pct ?? 0,
      free_choice_pct: comp?.free_choice_pct ?? 0,
      vacation_pct: comp?.vacation_pct ?? 0,
      sh_pct: comp?.sh_pct ?? 0,
      social_costs: comp?.social_costs ?? 0,
      overhead_pct: comp?.overhead_pct ?? 0,
      overtime_rate: comp?.overtime_rate ?? null,
      mileage_rate: comp?.mileage_rate ?? null,
      notes: comp?.notes ?? '',
      change_reason: '',
    },
  })

  const onSubmit = async (data: EmployeeCompensationInput) => {
    setError(null)
    setInfo(null)
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const res = await setEmployeeCompensationAction(employee.id, data)
      if (!res.ok) {
        setError(res.message)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      setInfo(
        res.data?.realHourlyCost != null
          ? `Satser gemt. Reel timekost: ${new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(res.data.realHourlyCost)}.`
          : res.message
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl')
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
      className="space-y-4 bg-white rounded-lg border p-4 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Satser og økonomi (DKK / %)</h2>
        {info && <span className="text-sm text-emerald-700">{info}</span>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Reel timekost beregnes automatisk:
        <code className="mx-1 px-1 bg-gray-100 rounded text-[11px]">
          timeløn × (1 + pension+fritvalg+ferie+sh+overhead %) + sociale omkostninger
        </code>
        og spejles ned i medarbejderens cost_rate (bruges af time_logs.cost_amount-trigger).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Timeløn" error={fieldError('hourly_wage')}>
          <input
            {...register('hourly_wage')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Intern kostpris / time" error={fieldError('internal_cost_rate')}>
          <input
            {...register('internal_cost_rate')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Salgspris / time" error={fieldError('sales_rate')}>
          <input
            {...register('sales_rate')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Field label="Pension %" error={fieldError('pension_pct')}>
          <input
            {...register('pension_pct')}
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Fritvalg %" error={fieldError('free_choice_pct')}>
          <input
            {...register('free_choice_pct')}
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Feriepenge %" error={fieldError('vacation_pct')}>
          <input
            {...register('vacation_pct')}
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="SH %" error={fieldError('sh_pct')}>
          <input
            {...register('sh_pct')}
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Overhead %" error={fieldError('overhead_pct')}>
          <input
            {...register('overhead_pct')}
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Sociale omkostninger / time" error={fieldError('social_costs')}>
          <input
            {...register('social_costs')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Overtidssats / time" error={fieldError('overtime_rate')}>
          <input
            {...register('overtime_rate')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
        <Field label="Kørselssats / km" error={fieldError('mileage_rate')}>
          <input
            {...register('mileage_rate')}
            type="number"
            step="0.01"
            min="0"
            disabled={isSubmitting}
            className={input}
          />
        </Field>
      </div>

      <Field label="Noter (interne)" error={fieldError('notes')}>
        <textarea
          {...register('notes')}
          rows={2}
          disabled={isSubmitting}
          className={`${input} resize-none`}
        />
      </Field>

      <Field label="Begrundelse for ændring (valgfri — gemmes i historik)" error={fieldError('change_reason')}>
        <input
          {...register('change_reason')}
          type="text"
          placeholder="fx 'Lønforhandling Q2 2026'"
          disabled={isSubmitting}
          className={input}
        />
      </Field>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Gemmer…' : 'Gem satser'}
        </button>
      </div>
    </form>
  )
}

// =====================================================
// Helpers
// =====================================================

const input =
  'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary'

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
