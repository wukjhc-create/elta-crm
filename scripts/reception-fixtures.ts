/**
 * Fiktive CRM-fixtures + falske engine-porte til AI-receptionist-tests og -simulator (ingen DB, intet netværk).
 * Alle navne/numre er opdigtede.
 */
import { classifyIdentity, type IdentityRows } from '../src/lib/reception/identity-match'
import type { EnginePorts, OpenCase, PortResult, LlmClassification } from '../src/lib/reception/engine'
import type { CandidateFacts } from '../src/lib/reception/disclosure'

export const ID = {
  hansen: '00000000-0000-4000-8000-000000000001',
  jensen: '00000000-0000-4000-8000-000000000002',
  nielsen: '00000000-0000-4000-8000-000000000003',
  delt1: '00000000-0000-4000-8000-000000000004',
  delt2: '00000000-0000-4000-8000-000000000005',
  hansenContact: '00000000-0000-4000-8000-0000000000c1',
  case1824: '00000000-0000-4000-8000-00000000a824',
  case1900: '00000000-0000-4000-8000-00000000a900',
  case1901: '00000000-0000-4000-8000-00000000a901',
}

export const ROWS: IdentityRows = {
  customers: [
    { id: ID.hansen, customer_number: 'K-1001', email: 'hansen@example.dk', phone: '20 30 40 50', mobile: null },
    { id: ID.jensen, customer_number: 'K-1002', email: 'jensen@example.dk', phone: '+45 21212121', mobile: null },
    { id: ID.nielsen, customer_number: 'K-1003', email: 'auto+1003@elta-crm.local', phone: '22222222', mobile: null },
    { id: ID.delt1, customer_number: 'K-1004', email: null, phone: '30303030', mobile: null },
    { id: ID.delt2, customer_number: 'K-1005', email: null, phone: null, mobile: '0045 30 30 30 30' },
  ],
  contacts: [{ id: ID.hansenContact, customer_id: ID.hansen, email: 'kontakt.hansen@example.dk', phone: null, mobile: '40404040' }],
  leads: [{ id: '00000000-0000-4000-8000-0000000000l1', phone: '50505050' }],
}

export const FACTS: Record<string, CandidateFacts> = {
  [ID.hansen]: { postalCodes: ['8000'], streetNames: ['solvej'], caseNumbers: ['SVC-01824'] },
  [ID.jensen]: { postalCodes: ['2100'], streetNames: ['strandvejen'], caseNumbers: ['SVC-01900', 'SVC-01901'] },
  [ID.nielsen]: { postalCodes: ['5000'], streetNames: ['nørregade'], caseNumbers: [] },
}

export const OPEN_CASES: Record<string, OpenCase[]> = {
  [ID.hansen]: [{ id: ID.case1824, caseNumber: 'SVC-01824', title: 'Batteri går offline', statusLabel: 'I gang' }],
  [ID.jensen]: [
    { id: ID.case1900, caseNumber: 'SVC-01900', title: 'Solcelleanlæg tag', statusLabel: 'Ny' },
    { id: ID.case1901, caseNumber: 'SVC-01901', title: 'Ladestander', statusLabel: 'Afventer' },
  ],
  [ID.nielsen]: [],
}

export function fakePorts(opts: { failIdentity?: boolean; failCases?: boolean; classify?: (t: string) => PortResult<LlmClassification> } = {}): EnginePorts {
  return {
    identify: async (input) => opts.failIdentity
      ? { state: 'read_error', candidates: [], leadIds: [], keysUsed: ['phone'], error: 'read:customers' }
      : classifyIdentity(input, ROWS),
    candidateFacts: async (id) => (FACTS[id] ? { ok: true, value: FACTS[id] } : { ok: false, error: 'read' }),
    openCases: async (id) => (opts.failCases ? { ok: false, error: 'read' } : { ok: true, value: OPEN_CASES[id] ?? [] }),
    ...(opts.classify ? { classify: async (t: string) => opts.classify!(t) } : {}),
  }
}

/** Simulator-scenarier (inkl. de fem fra fase 2-briefen) */
export const SCENARIOS: Array<{ name: string; text: string | null; phone?: string; email?: string; claimed?: { postalCode?: string; streetName?: string; caseNumber?: string } }> = [
  { name: 'Batteri offline (kendt kunde)', text: 'Mit batteri går offline.', phone: '20304050' },
  { name: 'Tilbud på solceller (ukendt)', text: 'Jeg vil gerne have et tilbud på solceller.', phone: '61616161' },
  { name: 'Hvornår kommer montøren (kun nummer)', text: 'Jeg har en sag hos jer, hvornår kommer montøren?', phone: '20304050' },
  { name: 'Hvornår kommer montøren (bekræftet)', text: 'Jeg har en sag hos jer, hvornår kommer montøren?', phone: '20304050', claimed: { postalCode: '8000', streetName: 'Solvej 4' } },
  { name: 'Ingen strøm i huset', text: 'Jeg har ingen strøm i huset.', phone: '22222222' },
  { name: 'Klage over faktura', text: 'Jeg vil klage over fakturaen.', phone: '21212121' },
  { name: 'Gnister fra tavlen (nød)', text: 'Det slår gnister fra eltavlen og lugter brændt!', phone: '20304050' },
  { name: 'Delt nummer (tvetydig)', text: 'Mit batteri går offline.', phone: '30303030' },
  { name: 'Vil tale med et menneske', text: 'Jeg vil gerne tale med en medarbejder.', phone: '20304050' },
  { name: 'Transskription mangler', text: null, phone: '20304050' },
  { name: 'Uklar besked (lav confidence)', text: 'Hej, det drejer sig om det der fra sidst.', phone: '20304050' },
  { name: 'Flere åbne sager', text: 'Mit anlæg virker ikke.', phone: '21212121' },
]
