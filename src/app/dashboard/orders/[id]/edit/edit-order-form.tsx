'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createServiceCaseSchema,
  type CreateServiceCaseInput,
} from '@/lib/validations/service-cases'
import {
  updateServiceCase,
  getOffersForOrderSelect,
} from '@/lib/actions/service-cases'
import {
  SERVICE_CASE_STATUSES,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_PRIORITIES,
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_TYPES,
  SERVICE_CASE_TYPE_LABELS,
  type ServiceCaseWithRelations,
} from '@/types/service-cases.types'

interface CustomerOption {
  id: string
  company_name: string
  customer_number: string | null
}
interface ProfileOption {
  id: string
  full_name: string | null
  email: string
}
interface EmployeeOption {
  id: string
  name: string
}

const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : '')

export function EditOrderForm({
  sag,
  customers,
  profiles,
  employees,
}: {
  sag: ServiceCaseWithRelations
  customers: CustomerOption[]
  profiles: ProfileOption[]
  employees: EmployeeOption[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [offers, setOffers] = useState<{ id: string; offer_number: string | null; title: string }[]>([])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = useForm<CreateServiceCaseInput>({
    resolver: zodResolver(createServiceCaseSchema),
    defaultValues: {
      title: sag.title,
      project_name: sag.project_name ?? null,
      type: sag.type ?? null,
      status: sag.status,
      priority: sag.priority,
      source: sag.source,
      customer_id: sag.customer_id ?? null,
      reference: sag.reference ?? null,
      requisition: sag.requisition ?? null,
      description: sag.description ?? null,
      status_note: sag.status_note ?? null,
      assigned_to: sag.assigned_to ?? null,
      formand_id: sag.formand_id ?? null,
      start_date: dateOnly(sag.start_date),
      end_date: dateOnly(sag.end_date),
      planned_hours: sag.planned_hours ?? null,
      contract_sum: sag.contract_sum ?? null,
      revised_sum: sag.revised_sum ?? null,
      budget: sag.budget ?? null,
    },
  })

  const customerId = watch('customer_id')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!customerId) {
        setOffers([])
        return
      }
      const res = await getOffersForOrderSelect(customerId)
      if (!cancelled && res.success && res.data) setOffers(res.data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [customerId])

  const onSubmit = async (data: CreateServiceCaseInput) => {
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await updateServiceCase(sag.id, {
        title: data.title,
        project_name: data.project_name,
        type: data.type ?? null,
        status: data.status,
        priority: data.priority,
        customer_id: data.customer_id,
        reference: data.reference,
        requisition: data.requisition,
        description: data.description,
        status_note: data.status_note,
        assigned_to: data.assigned_to,
        formand_id: data.formand_id,
        start_date: data.start_date,
        end_date: data.end_date,
        planned_hours: data.planned_hours,
        contract_sum: data.contract_sum,
        revised_sum: data.revised_sum,
        budget: data.budget,
      })

      if (!result.success || !result.data) {
        setError(result.error || 'Kunne ikke gemme ændringer')
        return
      }

      router.push(`/dashboard/orders/${result.data.case_number}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uventet fejl ved opdatering')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white rounded-lg border p-4 sm:p-6">
      {error && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Identifikation</legend>

        <Field label="Titel *" error={errors.title?.message}>
          <input
            {...register('title')}
            type="text"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isSubmitting}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Projektnavn" error={errors.project_name?.message}>
            <input
              {...register('project_name')}
              type="text"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Type">
            <select
              {...register('type')}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting}
            >
              <option value="">— Vælg type —</option>
              {SERVICE_CASE_TYPES.map((t) => (
                <option key={t} value={t}>{SERVICE_CASE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Status">
            <select
              {...register('status')}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting}
            >
              {SERVICE_CASE_STATUSES.map((s) => (
                <option key={s} value={s}>{SERVICE_CASE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>

          <Field label="Prioritet">
            <select
              {...register('priority')}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting}
            >
              {SERVICE_CASE_PRIORITIES.map((p) => (
                <option key={p} value={p}>{SERVICE_CASE_PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </Field>

          <Field label="Reference" error={errors.reference?.message}>
            <input
              {...register('reference')}
              type="text"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Kunde</legend>

        <Field label="Kunde" error={errors.customer_id?.message}>
          <select
            {...register('customer_id')}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            disabled={isSubmitting}
          >
            <option value="">— Ingen kunde —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}{c.customer_number ? ` (${c.customer_number})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Rekvirent" error={errors.requisition?.message}>
          <input
            {...register('requisition')}
            type="text"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isSubmitting}
          />
        </Field>

        {customerId && offers.length > 0 && (
          <Field label="Knyt til tilbud (valgfrit)">
            <select
              defaultValue={sag.source_offer_id ?? ''}
              {...register('source_offer_id' as any)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting}
            >
              <option value="">— Intet tilbud —</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.offer_number ? `${o.offer_number} — ` : ''}{o.title}
                </option>
              ))}
            </select>
          </Field>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Ansvar</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Ansvarlig (sagsbehandler)">
            <select
              {...register('assigned_to')}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting}
            >
              <option value="">— Ingen ansvarlig —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Formand (på pladsen)">
            <select
              {...register('formand_id')}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              disabled={isSubmitting || employees.length === 0}
            >
              <option value="">— Ingen formand —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Planlægning</legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Planlagt start">
            <input
              {...register('start_date')}
              type="date"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Planlagt slut">
            <input
              {...register('end_date')}
              type="date"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Planlagte timer">
            <input
              {...register('planned_hours')}
              type="number"
              min="0"
              step="0.25"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Økonomi (DKK)</legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Tilbudt beløb">
            <input
              {...register('contract_sum')}
              type="number"
              min="0"
              step="100"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Revideret beløb">
            <input
              {...register('revised_sum')}
              type="number"
              min="0"
              step="100"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Budget (intern)">
            <input
              {...register('budget')}
              type="number"
              min="0"
              step="100"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">Beskrivelse</legend>

        <Field label="Beskrivelse" error={errors.description?.message}>
          <textarea
            {...register('description')}
            rows={4}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="Bemærkninger (interne)" error={errors.status_note?.message}>
          <textarea
            {...register('status_note')}
            rows={2}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            disabled={isSubmitting}
          />
        </Field>
      </fieldset>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/orders/${sag.case_number}`)}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
          disabled={isSubmitting}
        >
          Annuller
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Gemmer…' : 'Gem ændringer'}
        </button>
      </div>
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
