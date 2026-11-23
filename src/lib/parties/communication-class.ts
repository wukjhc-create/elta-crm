/**
 * Kommunikationsklasse (00254, 2026-11-23). Ren logik — IKKE 'use server', ingen DB.
 *
 * Klassen beskriver HVAD en henvendelse handler om, uafhængigt af hvem parten er, og bestemmer ALDRIG ekstern synlighed
 * (det gør kun en eksplicit offentliggørelse — se ./audience.ts).
 *
 * Deterministisk evidens vinder: den afgør en FAMILIE af tilladte klasser. AI'en må kun forfine inden for familien; et
 * AI-forslag uden for familien ignoreres. Uden deterministisk evidens bruges AI'ens forslag (kilde 'ai'), men AI kan
 * aldrig påstå 'internal' (kræver ELTA-afsender). Uden noget → 'unknown'.
 */

export const COMMUNICATION_CLASSES = [
  'customer_request', 'lead', 'partner_order', 'supplier_correspondence', 'purchase_material', 'supplier_invoice',
  'technical_support', 'subcontractor', 'internal', 'automated_system', 'newsletter', 'unknown',
] as const
export type CommunicationClass = (typeof COMMUNICATION_CLASSES)[number]
export type CommunicationClassSource = 'none' | 'ai' | 'deterministic' | 'manual'

export function isCommunicationClass(v: unknown): v is CommunicationClass {
  return typeof v === 'string' && (COMMUNICATION_CLASSES as readonly string[]).includes(v)
}

/** Deterministiske fakta om kilden (alle valgfri — kun det der er kendt med sikkerhed) */
export interface CommunicationEvidence {
  /** Kildetabel: incoming_invoices = leverandørfaktura uanset afsender */
  sourceTable?: string | null
  /** Afsender er ELTA selv (eget domæne) */
  internalSender?: boolean
  /** Leverandør-værnets afgørelse (lib/email/supplier-senders) */
  supplierSender?: boolean
  /** Web-formular (FormSubmit) */
  webForm?: boolean
  /** Automatisk afsender (noreply/mailer-daemon/postmaster) */
  automatedSender?: boolean
  /** Mailen er manuelt koblet til en kunde af et menneske */
  confirmedCustomer?: boolean
  /** Aktive, menneskeligt bekræftede relationer for afsenderens part */
  partyRelationships?: readonly string[]
}

export interface CommunicationClassDecision {
  communicationClass: CommunicationClass
  source: CommunicationClassSource
  /** Den deterministiske familie (tom = ingen deterministisk evidens) */
  family: readonly CommunicationClass[]
}

const SUPPLIER_FAMILY = ['supplier_correspondence', 'purchase_material', 'supplier_invoice'] as const
const AUTOMATED_FAMILY = ['automated_system', 'newsletter'] as const

const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce[s]?)([+._-].*)?$/i

export function isAutomatedSender(email: string | null | undefined): boolean {
  const local = String(email ?? '').trim().toLowerCase().split('@')[0]
  return !!local && AUTOMATED_LOCAL.test(local)
}

/** Den deterministiske familie (første match vinder; rækkefølgen er bevidst: internt > faktura > leverandør > …) */
export function deterministicFamily(ev: CommunicationEvidence): readonly CommunicationClass[] {
  const rel = new Set(ev.partyRelationships ?? [])
  if (ev.internalSender) return ['internal']
  if (ev.sourceTable === 'incoming_invoices') return ['supplier_invoice']
  if (ev.supplierSender || rel.has('supplier')) return SUPPLIER_FAMILY
  if (ev.automatedSender) return AUTOMATED_FAMILY
  if (rel.has('cooperation_partner')) return ['partner_order']
  if (rel.has('subcontractor')) return ['subcontractor']
  if (rel.has('manufacturer')) return ['technical_support']
  if (ev.webForm) return ['customer_request', 'lead']
  if (ev.confirmedCustomer || rel.has('customer')) return ['customer_request']
  return []
}

/** Afgør klassen: deterministisk familie + (valgfrit) AI-forslag. Ren og total. */
export function decideCommunicationClass(ev: CommunicationEvidence, aiSuggestion?: string | null): CommunicationClassDecision {
  const family = deterministicFamily(ev)
  const ai = isCommunicationClass(aiSuggestion) ? aiSuggestion : null
  if (family.length) {
    const communicationClass = ai && family.includes(ai) ? ai : family[0]
    return { communicationClass, source: 'deterministic', family }
  }
  if (ai && ai !== 'internal' && ai !== 'unknown') return { communicationClass: ai, source: 'ai', family }
  return { communicationClass: 'unknown', source: 'none', family }
}

const RANK: Record<CommunicationClassSource, number> = { none: 0, ai: 1, deterministic: 2, manual: 3 }

/** Må en ny (server-)afgørelse erstatte den gemte? (= DB-værnet trg_conversations_party_guard) */
export function mayOverwriteClass(current: CommunicationClassSource, next: CommunicationClassSource): boolean {
  if (next === 'manual') return false // kun et menneske via UI — aldrig serveren
  return RANK[next] >= RANK[current]
}
