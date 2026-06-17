'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { OrderActionsTab } from './order-actions-tab'
import { OrderActivityTab } from './order-activity-tab'
import { OrderPlanningTab } from './order-planning-tab'
import { OrderMaterialsTab } from './order-materials-tab'
import { OrderOtherCostsTab } from './order-other-costs-tab'
import { OrderEconomyTab } from './order-economy-tab'
import { CaseBillingStatusCard } from '@/components/modules/orders/case-billing-status-card'
import { CaseProjectEconomyCard } from '@/components/modules/orders/case-project-economy-card'
import { OrderBillingDraftTab } from './order-billing-draft-tab'
import { OrderMailsTab } from './order-mails-tab'
import { OrderDocumentsTab } from './order-documents-tab'
import { OrderNotesTab } from './order-notes-tab'
import { OrderTasksTab } from './order-tasks-tab'
import { InlineStatusChanger } from './inline-status-changer'

const TABS = [
  { id: 'overblik',     label: 'Overblik',           ready: true },
  { id: 'planlaegning', label: 'Planlægning / Timer', ready: true },
  { id: 'materialer',   label: 'Materialer',         ready: true },
  { id: 'oevrige',      label: 'Øvrige omkostninger', ready: true },
  // Sprint 8D-1: Mails + Dokumenter pr. sag
  { id: 'mails',        label: 'Mails',              ready: true },
  { id: 'dokumenter',   label: 'Dokumenter',         ready: true },
  { id: 'oekonomi',     label: 'Økonomi',            ready: true },
  { id: 'opgaver',      label: 'Opgaver',            ready: true },
  { id: 'noter',        label: 'Noter',              ready: true },
  { id: 'aktivitet',    label: 'Aktivitet',          ready: true },
  { id: 'dokumentation',label: 'Dokumentation',      ready: false },
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
  canSeeBilling = false,
  canCreateInvoice = false,
  canAddNote = false,
  canManageAllNotes = false,
}: {
  sag: ServiceCaseWithRelations
  formand: { id: string; name: string } | null
  creator: { id: string; full_name: string | null } | null
  plannedWorkOrderCount?: number
  /** Sprint Ø2.10 — economy.cost_prices: gate til intern kost / DB. */
  canSeeCost?: boolean
  /** Sprint Ø3.1 — invoices.view.own_cases: kost-fri faktureringsstatus + fakturakladde. */
  canSeeBilling?: boolean
  /** Sprint Ø3.4 — invoices.create: styrer om opret-knapper er aktive. */
  canCreateInvoice?: boolean
  /** Sprint Ø7.2 — cases.edit/edit.own: styrer om note-form vises. */
  canAddNote?: boolean
  /** Sprint Ø7.4 — cases.edit: må redigere/slette ALLE noter (ikke kun egne). */
  canManageAllNotes?: boolean
}) {
  const [active, setActive] = useState<TabId>('overblik')

  const customerName =
    sag.customer?.company_name || sag.customer?.contact_person || '—'

  const fullAddress = [sag.address, sag.floor_door, sag.postal_code, sag.city]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
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
            <InlineStatusChanger caseId={sag.id} current={sag.status} />
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
            <Link
              href={`/dashboard/orders/${sag.case_number}/edit`}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
            >
              Rediger
            </Link>
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

      {/* Tabs nav */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
        <div className="flex border-b min-w-max">
          {TABS.filter((t) => t.id !== 'oekonomi' || canSeeCost).map((t) => (
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
            />
          )}
          {active === 'materialer' && <OrderMaterialsTab caseId={sag.id} />}
          {active === 'oevrige' && <OrderOtherCostsTab caseId={sag.id} />}
          {active === 'mails' && <OrderMailsTab caseId={sag.id} />}
          {active === 'dokumenter' && <OrderDocumentsTab caseId={sag.id} />}
          {active === 'oekonomi' && canSeeCost && (
            <OrderEconomyTab
              caseId={sag.id}
              onSwitchTab={(t) => setActive(t)}
            />
          )}
          {active === 'fakturakladde' && (
            <OrderBillingDraftTab caseId={sag.id} canCreate={canCreateInvoice} />
          )}
          {active === 'handlinger' && <OrderActionsTab sag={sag} />}
          {active === 'opgaver' && <OrderTasksTab caseId={sag.id} canComplete={canAddNote} />}
          {active === 'noter' && <OrderNotesTab caseId={sag.id} canAddNote={canAddNote} canManageAllNotes={canManageAllNotes} />}
          {active === 'aktivitet' && <OrderActivityTab caseId={sag.id} />}
          {active !== 'overblik' &&
            active !== 'planlaegning' &&
            active !== 'materialer' &&
            active !== 'oevrige' &&
            active !== 'mails' &&
            active !== 'dokumenter' &&
            active !== 'oekonomi' &&
            active !== 'fakturakladde' &&
            active !== 'handlinger' &&
            active !== 'opgaver' &&
            active !== 'noter' &&
            active !== 'aktivitet' && (
              <Placeholder
                tabId={active}
                tabLabel={TABS.find((t) => t.id === active)?.label ?? ''}
              />
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
  canSeeBilling = false,
  onOpenFakturakladde,
}: {
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
          value={<InlineStatusChanger caseId={sag.id} current={sag.status} />}
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
        {sag.os_case_id && <Row label="Ordrestyring ID" value={<code className="text-xs">{sag.os_case_id}</code>} />}
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

      {/* Sprint 9E Phase 2 — Sagspartner-overblik (Phase 3: redigerbar) */}
      <Panel
        title="Sagspartnere"
        action={
          <button
            type="button"
            onClick={() => setEditingParties(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
          >
            <Pencil className="w-3 h-3" />
            Rediger
          </button>
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
        action={
          <button
            type="button"
            onClick={() => setEditingSite(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border bg-white text-gray-700 border-gray-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
          >
            <Pencil className="w-3 h-3" />
            Rediger
          </button>
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

const PLACEHOLDER_INFO: Record<string, { headline: string; sprint: string; body: string }> = {
  materialer: {
    headline: 'Materialer på sagen',
    sprint: 'Sprint 5',
    body:
      'Materialer fra kalkulationen, samt manuelle linjer og leverandørordrer, vises her med kost-/salgspriser.',
  },
  oevrige: {
    headline: 'Øvrige omkostninger',
    sprint: 'Sprint 5',
    body:
      'Kørsel, underleverandører og andre omkostninger der ikke er materialer eller timer.',
  },
  oekonomi: {
    headline: 'Økonomisk overblik',
    sprint: 'Sprint 8',
    body:
      'DB-beregning, profit-snapshots, tilbudt vs. revideret vs. faktisk forbrug.',
  },
  dokumentation: {
    headline: 'Dokumentation og billeder',
    sprint: 'Sprint 9',
    body:
      'Vedhæftninger, før/efter-billeder, signeret afleveringsformular, KSR/EAN-dokumentation.',
  },
  fakturakladde: {
    headline: 'Fakturakladde',
    sprint: 'Sprint 6',
    body:
      'Faktura forberedes ud fra timer, materialer og øvrige omkostninger og kan sendes til e-conomic.',
  },
}

function Placeholder({ tabLabel, tabId }: { tabLabel: string; tabId?: string }) {
  const info = tabId ? PLACEHOLDER_INFO[tabId] : undefined
  return (
    <div className="text-center py-12">
      <h3 className="text-base font-medium text-gray-700">{info?.headline ?? tabLabel}</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        {info?.body ??
          'Denne fane bygges i et kommende sprint. Strukturen er på plads, men data og handlinger er ikke wired op endnu.'}
      </p>
      {info?.sprint && (
        <p className="text-xs text-gray-400 mt-4 uppercase tracking-wide">{info.sprint}</p>
      )}
    </div>
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
