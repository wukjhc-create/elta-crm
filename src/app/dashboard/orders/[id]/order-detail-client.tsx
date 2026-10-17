'use client'

import { CaseWarningNotes } from './case-warning-notes'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { EditSiteInfoDialog } from '@/components/modules/orders/edit-site-info-dialog'
import { EditServiceCasePartiesDialog } from '@/components/modules/orders/edit-service-case-parties-dialog'
import {
  SERVICE_CASE_PRIORITY_LABELS,
  SERVICE_CASE_PRIORITY_COLORS,
  SERVICE_CASE_STATUS_LABELS,
  SERVICE_CASE_STATUS_COLORS,
  SERVICE_CASE_TYPE_LABELS,
  BILLING_MODE_LABELS,
  type ServiceCaseWithRelations,
} from '@/types/service-cases.types'
import {
  CUSTOMER_CONTACT_ROLE_LABELS,
  type CustomerContactRole,
} from '@/types/customers.types'
import { CaseBillingStatusCard } from '@/components/modules/orders/case-billing-status-card'
import { CaseProjectEconomyCard } from '@/components/modules/orders/case-project-economy-card'
import { CasePurchaseSummaryCard } from '@/components/modules/orders/case-purchase-summary-card'
import { CaseUnconvertedSupplierLinesCard } from '@/components/modules/orders/case-unconverted-supplier-lines-card'
import { InlineStatusChanger } from './inline-status-changer'
import { CaseCloseReadiness, CaseStartHint } from './case-close-readiness'
import { OfferAgentButton } from '@/components/modules/agents/offer-agent-button'
import { WeatherWidget } from '@/components/shared/weather-widget'
import dynamic from 'next/dynamic'

// PF-9 (performance-review 2026-10-16): fanerne indlæses først, når de åbnes (egne bundter) — før lå alle 13 faner
// (~8.000 linjer inkl. fakturakladde og økonomi) i sagsdetaljens første bundt. Stadig server-renderet.
function TabLoading() {
  return <div className="py-8 text-center text-sm text-gray-500">Henter …</div>
}
const OrderActionsTab = dynamic(() => import('./order-actions-tab').then((m) => m.OrderActionsTab), { loading: TabLoading })
const OrderActivityTab = dynamic(() => import('./order-activity-tab').then((m) => m.OrderActivityTab), { loading: TabLoading })
const OrderPlanningTab = dynamic(() => import('./order-planning-tab').then((m) => m.OrderPlanningTab), { loading: TabLoading })
const OrderHandoverTab = dynamic(() => import('./order-handover-tab').then((m) => m.OrderHandoverTab), { loading: TabLoading })
const OrderMaterialsTab = dynamic(() => import('./order-materials-tab').then((m) => m.OrderMaterialsTab), { loading: TabLoading })
const OrderOtherCostsTab = dynamic(() => import('./order-other-costs-tab').then((m) => m.OrderOtherCostsTab), { loading: TabLoading })
const OrderEconomyTab = dynamic(() => import('./order-economy-tab').then((m) => m.OrderEconomyTab), { loading: TabLoading })
const OrderBillingDraftTab = dynamic(() => import('./order-billing-draft-tab').then((m) => m.OrderBillingDraftTab), { loading: TabLoading })
const OrderMailsTab = dynamic(() => import('./order-mails-tab').then((m) => m.OrderMailsTab), { loading: TabLoading })
const OrderDocumentsTab = dynamic(() => import('./order-documents-tab').then((m) => m.OrderDocumentsTab), { loading: TabLoading })
const OrderInspectionTab = dynamic(() => import('./order-inspection-tab').then((m) => m.OrderInspectionTab), { loading: TabLoading })
const OrderNotesTab = dynamic(() => import('./order-notes-tab').then((m) => m.OrderNotesTab), { loading: TabLoading })
const OrderTasksTab = dynamic(() => import('./order-tasks-tab').then((m) => m.OrderTasksTab), { loading: TabLoading })

const TABS = [
  { id: 'overblik',     label: 'Overblik',           ready: true },
  { id: 'planlaegning', label: 'Planlægning / Timer', ready: true },
  { id: 'aflevering',   label: 'Aflevering',         ready: true },
  { id: 'materialer',   label: 'Materialer',         ready: true },
  { id: 'oevrige',      label: 'Øvrige omkostninger', ready: true },
  // Sprint 8D-1: Mails + Dokumenter pr. sag
  { id: 'mails',        label: 'Mails',              ready: true },
  { id: 'dokumenter',   label: 'Dokumenter',         ready: true },
  { id: 'oekonomi',     label: 'Økonomi',            ready: true },
  { id: 'opgaver',      label: 'Opgaver',            ready: true },
  { id: 'noter',        label: 'Noter',              ready: true },
  { id: 'aktivitet',    label: 'Aktivitet',          ready: true },
  { id: 'dokumentation',label: 'Dokumentation',      ready: true },
  { id: 'fakturakladde',label: 'Fakturakladde',      ready: true },
  { id: 'handlinger',   label: 'Handlinger',         ready: true },
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
  plannedWorkOrderCount = 0,
  canSeeCost = false,
  canSeeLaborCostDetail = false,
  canSeeBilling = false,
  canCreateInvoice = false,
  canAddNote = false,
  canEditCase = false,
  materialPerms = { seePrices: false, add: false, edit: false, del: false, otherEdit: false, otherDel: false },
  canManageAllNotes = false,
}: {
  sag: ServiceCaseWithRelations
  formand: { id: string; name: string } | null
  creator: { id: string; full_name: string | null } | null
  plannedWorkOrderCount?: number
  /** Sprint Ø2.10 — economy.cost_prices: gate til intern kost / DB. */
  canSeeCost?: boolean
  /** D50 — employees.payroll.view: kost pr. timeregistrering (ellers kun aggregeret). */
  canSeeLaborCostDetail?: boolean
  /** Sprint Ø3.1 — invoices.view.own_cases: kost-fri faktureringsstatus + fakturakladde. */
  canSeeBilling?: boolean
  /** Sprint Ø3.4 — invoices.create: styrer om opret-knapper er aktive. */
  canCreateInvoice?: boolean
  /** Sprint Ø7.2 — cases.edit/edit.own: styrer om note-form vises. */
  canAddNote?: boolean
  /** cases.edit — Handlinger-fanen (status, afslut, DB-flag) */
  canEditCase?: boolean
  materialPerms?: { seePrices: boolean; add: boolean; edit: boolean; del: boolean; otherEdit?: boolean; otherDel?: boolean }
  /** Sprint Ø7.4 — cases.edit: må redigere/slette ALLE noter (ikke kun egne). */
  canManageAllNotes?: boolean
}) {
  // Deep-link ?tab=<id> (fx fra "Mine job" -> planlaegning)
  const tabParam = useSearchParams().get('tab')
  const [active, setActiveState] = useState<TabId>(
    TABS.some((t) => t.id === tabParam) && (tabParam !== 'oekonomi' || canSeeCost) ? (tabParam as TabId) : 'overblik'
  )
  // W-13 (pilot-review 2026-10-15): fanen skrives i URL'en (refresh/tilbage/del-link lander på samme fane)
  const setActive = (t: TabId) => {
    setActiveState(t)
    try {
      const url = new URL(window.location.href)
      if (t === 'overblik') url.searchParams.delete('tab')
      else url.searchParams.set('tab', t)
      window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* ignore */ }
  }

  const customerName =
    sag.customer?.company_name || sag.customer?.contact_person || '—'

  const fullAddress = [sag.address, sag.floor_door, sag.postal_code, sag.city]
    .filter(Boolean)
    .join(', ')

  return (
    // Q-9 (review 2026-10-16): layoutet har allerede padding — ingen ekstra p-6 på telefon (mere plads til indholdet)
    <div className="p-0 md:p-6 space-y-4 max-w-[1400px]">
      <nav className="text-sm text-gray-500 flex items-center gap-2">
        <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link href="/dashboard/orders" className="hover:text-gray-700">Sager / Ordrer</Link>
        <span>/</span>
        <span className="text-gray-900 font-mono">{sag.case_number}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
              <span>{sag.case_number}</span>
            </div>
            <h1 className="text-2xl font-semibold leading-tight">
              {sag.project_name || sag.title}
            </h1>
            {sag.project_name && sag.title !== sag.project_name && (
              <p className="text-sm text-gray-500">{sag.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* N9c: "Foreslå tilbud (agent)" — før kun i Service-modulet; knappen viser sig selv kun for admin */}
            <OfferAgentButton caseId={sag.id} />
            {/* W-5 (pilot-review 2026-10-15): statusskift og Rediger kun for dem der må (cases.edit) — montøren fik
                "Manglende tilladelse" / ingen-adgang-siden */}
            {canEditCase ? <InlineStatusChanger caseId={sag.id} current={sag.status} /> : <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sag.status]}`} data-testid="case-status-static">{SERVICE_CASE_STATUS_LABELS[sag.status]}</span>}
            <span
              className={`inline-block px-3 py-1 rounded text-xs font-medium ${SERVICE_CASE_PRIORITY_COLORS[sag.priority]}`}
            >
              {SERVICE_CASE_PRIORITY_LABELS[sag.priority]}
            </span>
            {canEditCase && (
              <Link
                href={`/dashboard/orders/${sag.case_number}/edit`}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
              >
                Rediger
              </Link>
            )}
          </div>
        </div>

        {/* Quick info row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t text-sm">
          <Stat label="Type" value={sag.type ? SERVICE_CASE_TYPE_LABELS[sag.type] : '—'} />
          <Stat label="Kunde" value={customerName} />
          {/* W-14: "Ansvarlig" = den tildelte (som i sagslisten), ikke opretteren */}
          <Stat label="Ansvarlig" value={sag.assignee?.full_name ?? creator?.full_name ?? '—'} />
          <Stat label="Formand" value={formand?.name ?? '—'} />
          {/* FW-1: beløb kun for roller med faktura-adgang (montør ser timer, ikke penge) */}
          {canSeeBilling && <Stat label="Tilbudt beløb" value={fmtAmount(sag.contract_sum)} />}
          {canSeeBilling && <Stat label="Revideret" value={fmtAmount(sag.revised_sum)} />}
          <Stat label="Planlagt timer" value={sag.planned_hours == null ? '—' : `${sag.planned_hours}`} />
          <Stat
            label="Planlagt tid"
            value={
              sag.start_date || sag.end_date
                ? `${fmtDate(sag.start_date)} → ${fmtDate(sag.end_date)}`
                : '—'
            }
          />
          <Stat
            label="Arbejdsordrer (åbne)"
            value={
              plannedWorkOrderCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setActive('planlaegning')}
                  className="text-emerald-700 hover:underline"
                >
                  {plannedWorkOrderCount}
                </button>
              ) : (
                '0'
              )
            }
          />
        </div>
      </div>

      {/* N23: sagen er klar til lukning (kun for cases.close) */}
      <CaseStartHint caseId={sag.id} status={sag.status} />
      <CaseCloseReadiness caseId={sag.id} status={sag.status} />

      {/* Tabs nav */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
        <div className="flex border-b min-w-max">
          {TABS.filter(
            (t) =>
              (t.id !== 'oekonomi' || canSeeCost) &&
              // Montør: ingen fakturering/kontorhandlinger (serveren afviser dem alligevel)
              (t.id !== 'fakturakladde' || canSeeBilling || canCreateInvoice) &&
              (t.id !== 'handlinger' || canEditCase)
          ).map((t) => (
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
              {t.id === 'planlaegning' && plannedWorkOrderCount > 0 && (
                <span className="ml-2 text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  {plannedWorkOrderCount}
                </span>
              )}
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
              canEditCase={canEditCase}
              onOpenNotes={() => setActive('noter')}
              sag={sag}
              customerName={customerName}
              fullAddress={fullAddress}
              formand={formand}
              creator={creator}
              canSeeBilling={canSeeBilling}
              onOpenFakturakladde={() => setActive('fakturakladde')}
            />
          )}
          {active === 'planlaegning' && (
            <OrderPlanningTab
              caseId={sag.id}
              caseTitle={sag.title}
              caseDefaultEmployeeId={sag.formand_id ?? null}
              canSeeCost={canSeeCost}
              canSeeLaborCostDetail={canSeeLaborCostDetail}
            />
          )}
          {active === 'aflevering' && <OrderHandoverTab caseId={sag.id} />}
          {active === 'materialer' && (
            <OrderMaterialsTab
              caseId={sag.id}
              canSeePrices={materialPerms.seePrices}
              canAdd={materialPerms.add}
              canEdit={materialPerms.edit}
              canDelete={materialPerms.del}
            />
          )}
          {active === 'oevrige' && <OrderOtherCostsTab caseId={sag.id} canSeeCost={materialPerms.seePrices} canEdit={materialPerms.otherEdit} canDelete={materialPerms.otherDel} />}
          {active === 'mails' && <OrderMailsTab caseId={sag.id} />}
          {active === 'dokumenter' && (
            <OrderDocumentsTab caseId={sag.id} customerId={sag.customer_id ?? null} />
          )}
          {/* Trin 1 — besigtigelse fra sagen (sag forudvalgt + låst) */}
          {active === 'dokumentation' && (
            <OrderInspectionTab caseId={sag.id} customerId={sag.customer_id ?? null} />
          )}
          {active === 'oekonomi' && canSeeCost && (
            <div className="space-y-5">
              <OrderEconomyTab
                caseId={sag.id}
                onSwitchTab={(t) => setActive(t)}
              />
              {/* Sprint Ø9.3 — intern indkøb-vs-budget (kun kost-gatet) */}
              <CasePurchaseSummaryCard caseId={sag.id} />
              {/* Sprint Ø9.4 — ukonverterede leverandørlinjer (kun kost-gatet) */}
              <CaseUnconvertedSupplierLinesCard caseId={sag.id} />
            </div>
          )}
          {active === 'fakturakladde' && (canSeeBilling || canCreateInvoice) && (
            <OrderBillingDraftTab caseId={sag.id} canCreate={canCreateInvoice} />
          )}
          {active === 'handlinger' && canEditCase && <OrderActionsTab sag={sag} />}
          {active === 'opgaver' && <OrderTasksTab caseId={sag.id} canComplete={canAddNote} />}
          {active === 'noter' && <OrderNotesTab caseId={sag.id} canAddNote={canAddNote} canManageAllNotes={canManageAllNotes} />}
          {active === 'aktivitet' && <OrderActivityTab caseId={sag.id} />}
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
  canSeeBilling = false,
  onOpenFakturakladde,
  canEditCase = false,
  onOpenNotes,
}: {
  canEditCase?: boolean
  onOpenNotes?: () => void
  sag: ServiceCaseWithRelations
  customerName: string
  fullAddress: string
  formand: { id: string; name: string } | null
  creator: { id: string; full_name: string | null } | null
  canSeeBilling?: boolean
  onOpenFakturakladde?: () => void
}) {
  const router = useRouter()
  const [editingSite, setEditingSite] = useState(false)
  const [editingParties, setEditingParties] = useState(false)

  return (
    <>
    {/* W-15: advarselsnoter øverst på Overblik */}
    <div className="mb-5 empty:hidden"><CaseWarningNotes caseId={sag.id} onOpenNotes={onOpenNotes} /></div>
    {/* Sprint Ø3.1 — kost-fri faktureringsstatus på overblik */}
    {canSeeBilling && (
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CaseBillingStatusCard
          caseId={sag.id}
          canOpenFakturakladde={canSeeBilling}
          onOpenFakturakladde={onOpenFakturakladde}
        />
        {/* Sprint Ø8.0 — cost-free projektøkonomi-overblik */}
        <CaseProjectEconomyCard caseId={sag.id} caseNumber={sag.case_number} />
      </div>
    )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Sag side */}
      <Panel title="Sagsoplysninger">
        <Row label="Sag/Ordre nr" value={<code className="text-xs">{sag.case_number}</code>} />
        <Row
          label="Status"
          value={canEditCase ? <InlineStatusChanger caseId={sag.id} current={sag.status} /> : <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${SERVICE_CASE_STATUS_COLORS[sag.status]}`} >{SERVICE_CASE_STATUS_LABELS[sag.status]}</span>}
        />
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
        <Row label="Oprettet" value={fmtDateLong(sag.created_at)} />
        {sag.closed_at && <Row label="Lukket" value={fmtDateLong(sag.closed_at)} />}
      </Panel>

      {/* Kunde side */}
      <Panel title="Betalende kunde / ordregiver">
        <Row label="Kunde" value={
          sag.customer?.id ? (
            <Link href={`/dashboard/customers/${sag.customer.id}`} className="text-emerald-700 hover:underline">
              {customerName}
            </Link>
          ) : customerName
        } />
        <Row label="Kontaktperson" value={sag.customer?.contact_person ?? '—'} />
        <Row
          label="Email"
          value={
            sag.customer?.email ? (
              <a href={`mailto:${sag.customer.email}`} className="text-emerald-700 hover:underline">
                {sag.customer.email}
              </a>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Telefon (kunde)"
          value={
            sag.customer?.phone ? (
              <a href={`tel:${sag.customer.phone}`} className="text-emerald-700 hover:underline">
                {sag.customer.phone}
              </a>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Telefon (sag)"
          value={
            sag.contact_phone ? (
              <a href={`tel:${sag.contact_phone}`} className="text-emerald-700 hover:underline">
                {sag.contact_phone}
              </a>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Adresse"
          value={
            fullAddress ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {fullAddress}
                {/* N9b: rutevejledning — koordinater hvis kendt, ellers adressen */}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    sag.latitude != null && sag.longitude != null ? `${sag.latitude},${sag.longitude}` : fullAddress
                  )}`}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  data-testid="order-navigate"
                >
                  Naviger
                </a>
              </span>
            ) : '—'
          }
        />
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
        {/* N9d: vejr på adressen (vind/regn ved montage) — før kun i Service-modulet */}
        {sag.latitude != null && sag.longitude != null && (
          <div className="py-2"><WeatherWidget latitude={sag.latitude} longitude={sag.longitude} compact /></div>
        )}
        <Row label="KSR-nummer" value={sag.ksr_number ?? '—'} />
        <Row label="EAN-nummer" value={sag.ean_number ?? '—'} />
      </Panel>

      {/* Sprint 9E Phase 2 — Sagspartner-overblik (Phase 3: redigerbar) */}
      <Panel
        title="Sagspartnere"
        action={canEditCase ? (
          <button
            type="button"
            onClick={() => setEditingParties(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
          >
            <Pencil className="w-3 h-3" />
            Rediger
          </button>
        ) : undefined
        }
      >
        <Row label="Ordregiver" value={renderPartyLink(sag.orderer_customer, 'Samme som nuværende kunde')} />
        <Row label="Kunde/anlægsejer" value={renderPartyLink(sag.end_customer, 'Samme som leveringskunde/kunde')} />
        <Row label="Betaler" value={renderPartyLink(sag.payer_customer, 'Samme som betaler/kunde')} />
        <Row
          label="Købssted/forhandler"
          value={
            sag.purchased_from_customer ? (
              <Link
                href={`/dashboard/customers/${sag.purchased_from_customer.id}`}
                className="text-emerald-700 hover:underline"
              >
                {sag.purchased_from_customer.company_name}
              </Link>
            ) : sag.purchase_source ? (
              <span className="text-gray-700">{sag.purchase_source}</span>
            ) : (
              <span className="text-gray-400">Ikke angivet</span>
            )
          }
        />
        <Row
          label="Billing mode"
          value={
            sag.billing_mode ? (
              <span className="text-gray-700">{BILLING_MODE_LABELS[sag.billing_mode]}</span>
            ) : (
              <span className="text-gray-400">—</span>
            )
          }
        />
        <div className="col-span-full mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Dette panel er foreløbig read-only. Tilbud/faktura sendes fortsat efter eksisterende routing indtil Phase 6.
        </div>
      </Panel>

      {/* Sprint 8G — Leveringskontakt / arbejdssted */}
      <Panel
        title="Leveringskontakt / arbejdssted"
        action={canEditCase ? (
          <button
            type="button"
            onClick={() => setEditingSite(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
            data-testid="edit-site-info"
          >
            <Pencil className="w-3 h-3" />
            Rediger
          </button>
        ) : undefined
        }
      >
        {sag.site_customer ? (
          <>
            <Row
              label="Leveringskunde"
              value={
                <Link
                  href={`/dashboard/customers/${sag.site_customer.id}`}
                  className="text-emerald-700 hover:underline"
                >
                  {sag.site_customer.company_name}
                </Link>
              }
            />
            {sag.site_customer.contact_person && (
              <Row label="Kontaktperson" value={sag.site_customer.contact_person} />
            )}
            {sag.site_customer.email && (
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${sag.site_customer.email}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {sag.site_customer.email}
                  </a>
                }
              />
            )}
            {sag.site_customer.phone && (
              <Row
                label="Telefon"
                value={
                  <a
                    href={`tel:${sag.site_customer.phone}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {sag.site_customer.phone}
                  </a>
                }
              />
            )}
          </>
        ) : (
          <Row
            label="Leveringskunde"
            value={<span className="text-gray-400">Ikke valgt — samme som betaler</span>}
          />
        )}

        {sag.site_contact ? (
          <>
            <Row
              label="Kontakt på stedet"
              value={
                <span>
                  {sag.site_contact.name}
                  {sag.site_contact.role && (
                    <span className="ml-1.5 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                      {CUSTOMER_CONTACT_ROLE_LABELS[
                        sag.site_contact.role as CustomerContactRole
                      ] || sag.site_contact.role}
                    </span>
                  )}
                </span>
              }
            />
            {sag.site_contact.email && (
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${sag.site_contact.email}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {sag.site_contact.email}
                  </a>
                }
              />
            )}
            {(sag.site_contact.mobile || sag.site_contact.phone) && (
              <Row
                label="Telefon"
                value={
                  <a
                    href={`tel:${sag.site_contact.mobile || sag.site_contact.phone}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {sag.site_contact.mobile || sag.site_contact.phone}
                  </a>
                }
              />
            )}
          </>
        ) : (
          <Row
            label="Kontakt på stedet"
            value={<span className="text-gray-400">Ikke valgt</span>}
          />
        )}

        <Row
          label="Adgangsnoter"
          value={
            sag.access_notes ? (
              <span className="whitespace-pre-wrap text-sm text-gray-700">{sag.access_notes}</span>
            ) : (
              <span className="text-gray-400">Ingen</span>
            )
          }
        />
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
        {canSeeBilling && <Row label="Tilbudt beløb" value={fmtAmount(sag.contract_sum)} />}
        {canSeeBilling && <Row label="Revideret beløb" value={fmtAmount(sag.revised_sum)} />}
        {/* Privacy (Henrik 2026-10-03): internt budget og lav-DB står ikke på overblikket — se fanen Økonomi */}
        <Row label="Planlagt timer" value={sag.planned_hours == null ? '—' : `${sag.planned_hours}`} />
        {sag.source_offer_id && (
          <Row label="Fra tilbud" value={
            <Link href={`/dashboard/offers/${sag.source_offer_id}`} className="text-emerald-700 hover:underline text-xs">
              {/* U-12: ikke et UUID-fragment */}
              Åbn tilbuddet →
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

    {editingSite && (
      <EditSiteInfoDialog
        caseId={sag.id}
        payingCustomerId={sag.customer_id}
        initial={{
          address: sag.address,
          postal_code: sag.postal_code,
          city: sag.city,
          floor_door: sag.floor_door,
          access_notes: sag.access_notes,
          contact_phone: sag.contact_phone,
          ksr_number: sag.ksr_number,
          ean_number: sag.ean_number,
          latitude: sag.latitude,
          longitude: sag.longitude,
          site_customer: sag.site_customer
            ? { id: sag.site_customer.id, company_name: sag.site_customer.company_name }
            : null,
          site_contact: sag.site_contact
            ? { id: sag.site_contact.id, name: sag.site_contact.name }
            : null,
        }}
        onClose={() => setEditingSite(false)}
        onSaved={() => router.refresh()}
      />
    )}

    {editingParties && (
      <EditServiceCasePartiesDialog
        caseId={sag.id}
        payingCustomerName={sag.customer?.company_name ?? null}
        initial={{
          orderer_customer: sag.orderer_customer
            ? { id: sag.orderer_customer.id, company_name: sag.orderer_customer.company_name }
            : null,
          end_customer: sag.end_customer
            ? { id: sag.end_customer.id, company_name: sag.end_customer.company_name }
            : null,
          payer_customer: sag.payer_customer
            ? { id: sag.payer_customer.id, company_name: sag.payer_customer.company_name }
            : null,
          purchased_from_customer: sag.purchased_from_customer
            ? { id: sag.purchased_from_customer.id, company_name: sag.purchased_from_customer.company_name }
            : null,
          purchase_source: sag.purchase_source,
          billing_mode: sag.billing_mode,
        }}
        onClose={() => setEditingParties(false)}
        onSaved={() => router.refresh()}
      />
    )}
    </>
  )
}

/**
 * Sprint 9E Phase 2 — render-helper for sagspartner-felter.
 * Returnerer link til kundekort hvis partneren er sat, ellers fallback-tekst.
 */
function renderPartyLink(
  party: { id: string; company_name: string } | null | undefined,
  fallback: string
): React.ReactNode {
  if (!party?.id) {
    return <span className="text-gray-400">{fallback}</span>
  }
  return (
    <Link
      href={`/dashboard/customers/${party.id}`}
      className="text-emerald-700 hover:underline"
    >
      {party.company_name}
    </Link>
  )
}

function Panel({
  title,
  children,
  full,
  action,
}: {
  title: string
  children: React.ReactNode
  full?: boolean
  /** Valgfri højre-stillet action (fx Rediger-knap). */
  action?: React.ReactNode
}) {
  return (
    <div className={`bg-gray-50 rounded ring-1 ring-gray-200 p-4 ${full ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className="text-right text-gray-900 max-w-[65%] truncate"
        title={typeof value === 'string' ? value : undefined}
      >
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
