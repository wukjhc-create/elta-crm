'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_PRIORITY_COLORS,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_TYPE_LABELS,
  type ServiceCaseWithRelations,
} from '@/types/service-cases.types'

const TABS = [
  { id: 'overblik',     label: 'Overblik',           ready: true },
  { id: 'timer',        label: 'Timer',              ready: false },
  { id: 'materialer',   label: 'Materialer',         ready: false },
  { id: 'oevrige',      label: 'Øvrige omkostninger', ready: false },
  { id: 'oekonomi',     label: 'Økonomi',            ready: false },
  { id: 'aktivitet',    label: 'Aktivitet',          ready: false },
  { id: 'dokumentation',label: 'Dokumentation',      ready: false },
  { id: 'fakturakladde',label: 'Fakturakladde',      ready: false },
  { id: 'handlinger',   label: 'Handlinger',         ready: false },
] as const

type TabId = (typeof TABS)[number]['id']

const fmtAmount = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK',
        maximumFractionDigits: 0,
      }).format(Number(n))

const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')

export function OrderDetailClient({
  sag,
  formand,
  creator,
}: {
  sag: ServiceCaseWithRelations
  formand: { id: string; name: string } | null
  creator: { id: string; full_name: string | null } | null
}) {
  const [active, setActive] = useState<TabId>('overblik')

  const customerName =
    sag.customer?.company_name || sag.customer?.contact_person || '—'

  const fullAddress = [sag.address, sag.floor_door, sag.postal_code, sag.city]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div>
        <Link
          href="/dashboard/orders"
          className="text-xs text-emerald-700 hover:underline"
        >
          ← Sager / Ordrer
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <span>{sag.case_number}</span>
              {sag.os_case_id && (
                <span className="text-gray-400">· OS: {sag.os_case_id}</span>
              )}
            </div>
            <h1 className="text-2xl font-semibold leading-tight">
              {sag.project_name || sag.title}
            </h1>
            {sag.project_name && sag.title !== sag.project_name && (
              <p className="text-sm text-gray-500">{sag.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-3 py-1 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sag.status]}`}
            >
              {SERVICE_CASE_STATUS_LABELS[sag.status]}
            </span>
            <span
              className={`inline-block px-3 py-1 rounded text-xs font-medium ${SERVICE_CASE_PRIORITY_COLORS[sag.priority]}`}
            >
              {SERVICE_CASE_PRIORITY_LABELS[sag.priority]}
            </span>
            {sag.low_profit && (
              <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                Lav DB
              </span>
            )}
          </div>
        </div>

        {/* Quick info row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t text-sm">
          <Stat label="Type" value={sag.type ? SERVICE_CASE_TYPE_LABELS[sag.type] : '—'} />
          <Stat label="Kunde" value={customerName} />
          <Stat label="Ansvarlig" value={creator?.full_name ?? '—'} />
          <Stat label="Formand" value={formand?.name ?? '—'} />
          <Stat label="Tilbudt beløb" value={fmtAmount(sag.contract_sum)} />
          <Stat label="Revideret" value={fmtAmount(sag.revised_sum)} />
          <Stat label="Planlagt timer" value={sag.planned_hours == null ? '—' : `${sag.planned_hours}`} />
          <Stat
            label="Planlagt tid"
            value={
              sag.start_date || sag.end_date
                ? `${fmtDate(sag.start_date)} → ${fmtDate(sag.end_date)}`
                : '—'
            }
          />
        </div>
      </div>

      {/* Tabs nav */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
        <div className="flex border-b min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                active === t.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
              {!t.ready && (
                <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  kommer
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {active === 'overblik' && (
            <OverblikTab
              sag={sag}
              customerName={customerName}
              fullAddress={fullAddress}
              formand={formand}
              creator={creator}
            />
          )}
          {active !== 'overblik' && (
            <Placeholder tabLabel={TABS.find((t) => t.id === active)?.label ?? ''} />
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// Overblik (real data)
// =====================================================

function OverblikTab({
  sag,
  customerName,
  fullAddress,
  formand,
  creator,
}: {
  sag: ServiceCaseWithRelations
  customerName: string
  fullAddress: string
  formand: { id: string; name: string } | null
  creator: { id: string; full_name: string | null } | null
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Sag side */}
      <Panel title="Sagsoplysninger">
        <Row label="Sag/Ordre nr" value={<code className="text-xs">{sag.case_number}</code>} />
        <Row label="Status" value={
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sag.status]}`}>
            {SERVICE_CASE_STATUS_LABELS[sag.status]}
          </span>
        } />
        <Row label="Prioritet" value={
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SERVICE_CASE_PRIORITY_COLORS[sag.priority]}`}>
            {SERVICE_CASE_PRIORITY_LABELS[sag.priority]}
          </span>
        } />
        <Row label="Type" value={sag.type ? SERVICE_CASE_TYPE_LABELS[sag.type] : '—'} />
        <Row label="Projektnavn" value={sag.project_name ?? '—'} />
        <Row label="Titel" value={sag.title} />
        <Row label="Reference" value={sag.reference ?? '—'} />
        <Row label="Rekvirent" value={sag.requisition ?? '—'} />
        <Row label="Kilde" value={sag.source} />
        {sag.os_case_id && <Row label="Ordrestyring ID" value={<code className="text-xs">{sag.os_case_id}</code>} />}
        <Row label="Oprettet" value={fmtDateLong(sag.created_at)} />
        {sag.closed_at && <Row label="Lukket" value={fmtDateLong(sag.closed_at)} />}
      </Panel>

      {/* Kunde side */}
      <Panel title="Kunde og kontakt">
        <Row label="Kunde" value={
          sag.customer?.id ? (
            <Link href={`/dashboard/customers/${sag.customer.id}`} className="text-emerald-700 hover:underline">
              {customerName}
            </Link>
          ) : customerName
        } />
        <Row label="Kontaktperson" value={sag.customer?.contact_person ?? '—'} />
        <Row label="Email" value={sag.customer?.email ?? '—'} />
        <Row label="Telefon (kunde)" value={sag.customer?.phone ?? '—'} />
        <Row label="Telefon (sag)" value={sag.contact_phone ?? '—'} />
        <Row label="Adresse" value={fullAddress || '—'} />
        {sag.latitude != null && sag.longitude != null && (
          <Row
            label="GPS"
            value={
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.google.com/maps?q=${sag.latitude},${sag.longitude}`}
                className="text-emerald-700 hover:underline"
              >
                {sag.latitude.toFixed(5)}, {sag.longitude.toFixed(5)}
              </a>
            }
          />
        )}
        <Row label="KSR-nummer" value={sag.ksr_number ?? '—'} />
        <Row label="EAN-nummer" value={sag.ean_number ?? '—'} />
      </Panel>

      {/* Ansvar */}
      <Panel title="Ansvar">
        <Row label="Ansvarlig (sælger)" value={creator?.full_name ?? '—'} />
        <Row label="Tildelt" value={sag.assignee?.full_name ?? '—'} />
        <Row label="Formand" value={formand?.name ?? '—'} />
        <Row label="Auto-faktura ved afsluttet" value={sag.auto_invoice_on_done ? 'JA' : 'nej'} />
      </Panel>

      {/* Økonomi */}
      <Panel title="Økonomi">
        <Row label="Tilbudt beløb" value={fmtAmount(sag.contract_sum)} />
        <Row label="Revideret beløb" value={fmtAmount(sag.revised_sum)} />
        <Row label="Internt budget" value={fmtAmount(sag.budget)} />
        <Row label="Planlagt timer" value={sag.planned_hours == null ? '—' : `${sag.planned_hours}`} />
        <Row label="Lav DB markeret" value={sag.low_profit ? 'JA' : 'nej'} />
        {sag.source_offer_id && (
          <Row label="Fra tilbud" value={
            <Link href={`/dashboard/offers/${sag.source_offer_id}`} className="text-emerald-700 hover:underline font-mono text-xs">
              {sag.source_offer_id.slice(0, 8)}…
            </Link>
          } />
        )}
      </Panel>

      {/* Planlagt tid */}
      <Panel title="Planlagt tid">
        <Row label="Start" value={fmtDate(sag.start_date)} />
        <Row label="Slut" value={fmtDate(sag.end_date)} />
        {sag.signed_at && (
          <Row label="Underskrevet af kunde" value={
            <span>
              {sag.customer_signature_name ?? 'kunde'} · {fmtDateLong(sag.signed_at)}
            </span>
          } />
        )}
      </Panel>

      {/* Beskrivelse */}
      <Panel title="Beskrivelse" full>
        {sag.description ? (
          <p className="text-sm whitespace-pre-wrap text-gray-800">{sag.description}</p>
        ) : (
          <p className="text-sm text-gray-400">Ingen beskrivelse.</p>
        )}
      </Panel>

      {/* Status note / bemærkninger */}
      {sag.status_note && (
        <Panel title="Bemærkninger" full>
          <p className="text-sm whitespace-pre-wrap text-gray-800">{sag.status_note}</p>
        </Panel>
      )}
    </div>
  )
}

function Placeholder({ tabLabel }: { tabLabel: string }) {
  return (
    <div className="text-center py-12">
      <h3 className="text-base font-medium text-gray-700">{tabLabel}</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        Denne fane bygges i et kommende sprint. Strukturen er på plads, men data og handlinger
        er ikke wired op endnu.
      </p>
      <p className="text-xs text-gray-400 mt-4">
        Sprint 4: Timer · Sprint 5: Materialer + Øvrige · Sprint 6: Faktura ·
        Sprint 8: Økonomi · Sprint 9: Dokumentation
      </p>
    </div>
  )
}

function Panel({
  title,
  children,
  full,
}: {
  title: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={`bg-gray-50 rounded ring-1 ring-gray-200 p-4 ${full ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-right text-gray-900 max-w-[60%] truncate" title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900 truncate">{value}</div>
    </div>
  )
}

function fmtDateLong(s: string | null | undefined) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('da-DK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
