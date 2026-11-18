/**
 * Kundeportalens eksplicitte projektioner (portal-sikkerhedsreview 2026-11-18). Bevidst IKKE 'use server' — ren logik
 * og konstanter, så de kan testes og genbruges af portal-actions, portal-PDF og tests.
 *
 * Regel: portalen læser med service_role (anon har ingen adgang til tabellerne) og er derfor selv grænsen. Den vælger
 * KUN kolonner fra de lister herunder og bygger svaret felt for felt — aldrig select('*') eller {...række} mod kunden.
 * Interne felter må ikke sendes til browseren for blot at blive skjult i React.
 */

/** Server-side kolonner for et tilbud i portalen (ingen interne noter, kilder, rykker-/afvisnings-metadata, IP'er). */
export const PORTAL_OFFER_COLUMNS = [
  'id', 'offer_number', 'title', 'description', 'status',
  'total_amount', 'discount_percentage', 'discount_amount', 'tax_percentage', 'tax_amount', 'final_amount', 'currency',
  'valid_until', 'terms_and_conditions', 'sent_at', 'viewed_at', 'accepted_at', 'rejected_at', 'created_at',
  // kun server-side: tilbuddets sælger (navn + arbejdskontakt slås op separat) — sendes aldrig som felt
  'created_by',
].join(', ')

/** Kunde-sikre tilbudslinjefelter (= PortalOfferLineItem): salgspris, rabat, linjetotal — ALDRIG kost/margin/noter. */
export const PORTAL_LINE_ITEM_COLUMNS = 'id, offer_id, position, line_type, description, quantity, unit, unit_price, discount_percentage, total'

/** Linjefelter som portal-PDF'en tegner (offer-pdf-template: billede + linjetype ud over portal-felterne). */
export const PORTAL_PDF_LINE_COLUMNS = `${PORTAL_LINE_ITEM_COLUMNS}, image_url`

/** Serverens læsning af en kundeopgave til portalen (klassifikation + kundesynlighed). */
export const PORTAL_TASK_COLUMNS = 'id, title, description, due_date, status, created_at, auto_rule, customer_visible'

/**
 * Felter der ALDRIG må forekomme i et portal-svar (kostpris, avance, leverandørkost, interne noter, medarbejder-/
 * system-metadata). Bruges af tests og som sidste værn (assertPortalSafe) på svar der bygges dynamisk.
 */
export const PORTAL_FORBIDDEN_KEYS = [
  'cost_price', 'unit_cost', 'supplier_cost_price_at_creation', 'supplier_margin_applied', 'margin_percentage',
  'margin', 'profit', 'db_amount', 'contribution_margin', 'purchase_price', 'supplier_price', 'hourly_cost', 'cost_rate',
  'internal_notes', 'notes', 'status_note', 'auto_rule', 'assigned_to', 'created_by', 'signer_ip', 'rejected_by_ip',
  'rejected_by_user_agent', 'customer_visible', 'source_email_id', 'calculation_id', 'supplier_product_id',
  'supplier_name_at_creation', 'material_id', 'budget', 'contract_sum', 'planned_hours', 'low_profit',
] as const

/** Dybdesøgning: returnerer stier til forbudte nøgler i et portal-svar (tom liste = sikkert). */
export function findForbiddenPortalKeys(value: unknown, path = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => findForbiddenPortalKeys(v, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((PORTAL_FORBIDDEN_KEYS as readonly string[]).includes(k)) out.push(`${path}.${k}`)
      findForbiddenPortalKeys(v, `${path}.${k}`, out)
    }
  }
  return out
}

export interface PortalTaskRow {
  id: string
  title: string | null
  description: string | null
  due_date: string | null
  status: string | null
  created_at: string | null
  auto_rule?: string | null
  customer_visible?: boolean | null
}

/** Det kunden må se om en kundevendt opgave (besigtigelse): fast titel, kun tidspunkt-linjen, dato og status. */
export interface PortalTaskView {
  id: string
  title: string
  description: string | null
  due_date: string
  status: string
  created_at: string
}

export function toPortalTask(t: PortalTaskRow): PortalTaskView {
  const time = t.description?.match(/Tidspunkt:\s*(.+)/i)?.[1] ?? t.description?.match(/kl\.\s*(\S+)/)?.[1] ?? null
  return {
    id: t.id,
    title: 'Besigtigelse',
    description: time ? `Tidspunkt: ${time.trim()}` : null,
    due_date: t.due_date ?? '',
    status: t.status ?? 'pending',
    created_at: t.created_at ?? '',
  }
}
