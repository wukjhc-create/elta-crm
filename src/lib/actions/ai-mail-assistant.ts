'use server'

/**
 * Sprint 8E-3 — AI mail-assistant (forslag/rettelser, ALDRIG send).
 *
 * Phase 1 helpers (godkendt):
 * 1. suggestReplyToEmail(emailId)
 * 2. proofreadText(text)
 * 3. makeProfessional(text)
 * 4. makeShorter(text)
 *
 * Phase 2 helpers (denne sprint):
 * 5. generateDraftFromInstruction(emailId, instruction)
 * 6. translateText(text, targetLanguage)
 * 7. makeFriendlier(text)
 *
 * Sikkerhed:
 * - Bruger eksisterende OpenAI/budget setup (ai-budget.ts).
 * - 12s timeout, fallback til { ok:false, error } ved fejl.
 * - System-prompt forbyder eksplicit at opfinde priser, datoer, løfter.
 * - Markerer manglende info med [BRUGER UDFYLDER].
 * - Returnerer ALDRIG en sendt mail — kalder ALDRIG sendQuickReply.
 */

import { createClient } from '@/lib/supabase/server'
import { canSpendAi, recordAiCall } from '@/lib/services/ai-budget'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = 'gpt-4o-mini'
const OPENAI_TIMEOUT_MS = 12_000
const MAX_INPUT_CHARS = 8000
const MAX_TOKENS = 600

const SYSTEM_PROMPT = `Du er AI-assistent for Elta Solar — et dansk el- og solcelle-firma.
Din opgave er at hjælpe medarbejderen med at skrive bedre kunde-mails.

ABSOLUT FORBUDT:
- Opfind ALDRIG konkrete priser, beløb, rabatter eller procenter
- Opfind ALDRIG konkrete datoer eller tidspunkter (medmindre brugeren har skrevet dem)
- Opfind ALDRIG konkrete løfter ("vi installerer X", "vi sender X")
- Opfind ALDRIG juridiske garantier eller bindende udsagn
- Skriv ALDRIG noget der ikke fremgår af kontekst eller brugerens instruktion

PÅKRÆVET:
- Skriv altid på dansk medmindre noget andet er eksplicit bedt om
- Bevar professionel, varm og kort tone
- Brug el/solcelle-faglig terminologi når relevant
- Markér manglende information med [BRUGER UDFYLDER] (firkantede klammer)
- Skriv "vi vender tilbage" hvis du mangler konkrete oplysninger
- Underskrift: hvis du skal afslutte, brug "Med venlig hilsen,\\nElta Solar"

Output: KUN selve mailteksten — ingen forklaring, ingen markdown, ingen kommentarer.`

export interface AiTextResult {
  ok: boolean
  text: string | null
  error?: string
  /** Liste af [BRUGER UDFYLDER]-pladsholdere som AI har sat ind. */
  placeholders?: string[]
}

// =====================================================
// Internal: OpenAI call
// =====================================================

async function callAI(userPrompt: string): Promise<AiTextResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, text: null, error: 'AI er ikke konfigureret (OPENAI_API_KEY mangler)' }
  }

  // Daglig budget-tjek
  if (!(await canSpendAi())) {
    return { ok: false, text: null, error: 'AI dagligt budget er opbrugt — prøv igen i morgen' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!res.ok) {
      const body = (await res.text()).substring(0, 200)
      logger.warn('AI mail-assistant: OpenAI failed', {
        metadata: { status: res.status, body },
      })
      return { ok: false, text: null, error: `AI-tjeneste fejlede (${res.status})` }
    }

    void recordAiCall(1)

    const data = await res.json()
    const text = (data.choices?.[0]?.message?.content as string | undefined)?.trim() || null
    if (!text) {
      return { ok: false, text: null, error: 'AI returnerede tomt svar' }
    }

    const placeholders = extractPlaceholders(text)
    return { ok: true, text, placeholders }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    if (aborted) {
      return { ok: false, text: null, error: 'AI svarer ikke (timeout) — prøv igen' }
    }
    logger.warn('AI mail-assistant: unexpected error', { error: err })
    return { ok: false, text: null, error: 'Uventet fejl — prøv igen' }
  } finally {
    clearTimeout(timeout)
  }
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\[BRUGER UDFYLDER[^\]]*\]/g)
  return matches ? Array.from(new Set(matches)) : []
}

function truncate(s: string | null | undefined, max = MAX_INPUT_CHARS): string {
  if (!s) return ''
  return s.length > max ? s.substring(0, max) + '…' : s
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// =====================================================
// 1. suggestReplyToEmail
// =====================================================

export async function suggestReplyToEmail(emailId: string): Promise<AiTextResult> {
  validateUUID(emailId, 'emailId')
  const supabase = await createClient()

  // Hent mail + customer
  const { data: email } = await supabase
    .from('incoming_emails')
    .select(
      `id, subject, sender_email, sender_name, body_text, body_html, body_preview,
       received_at, customer_id, service_case_id,
       customers ( id, company_name, contact_person, customer_number )`
    )
    .eq('id', emailId)
    .maybeSingle()

  if (!email) {
    return { ok: false, text: null, error: 'Mail ikke fundet' }
  }

  const customer = (email as { customers?: { company_name?: string; contact_person?: string | null; customer_number?: string } }).customers || null
  const senderLabel = email.sender_name || email.sender_email || 'Kunde'

  // Hent service case kontekst hvis tilknyttet
  let caseContext = ''
  if (email.service_case_id) {
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('case_number, title, status, description')
      .eq('id', email.service_case_id)
      .maybeSingle()
    if (caseRow) {
      caseContext = `\nSAGSREFERENCE: ${caseRow.case_number} — ${caseRow.title} (status: ${caseRow.status})`
      if (caseRow.description) {
        caseContext += `\nSagsbeskrivelse: ${truncate(caseRow.description, 500)}`
      }
    }
  }

  const bodyForAI = truncate(email.body_text || stripHtml(email.body_html || '') || email.body_preview || '')

  const customerLine = customer
    ? `KUNDE: ${customer.company_name}${customer.contact_person ? ` (kontakt: ${customer.contact_person})` : ''}${customer.customer_number ? ` — kundenr. ${customer.customer_number}` : ''}`
    : 'KUNDE: ikke koblet — vi kender kun afsenderen'

  const prompt = `Skriv et dansk svarforslag til denne mail.
Bevar professionel og venlig tone. Brug [BRUGER UDFYLDER] hvor du mangler konkrete oplysninger.

INDKOMMENDE MAIL:
Fra: ${senderLabel}
Emne: ${email.subject || '(intet emne)'}
Modtaget: ${email.received_at}

${customerLine}${caseContext}

MAILTEKST:
"""
${bodyForAI}
"""

INSTRUKTION: Skriv et passende svar. Ingen overskrift eller "Hej X" hvis det føles forceret. Hvis konkret information mangler (datoer, priser, leveringstid), skriv "vi vender tilbage" eller brug [BRUGER UDFYLDER].`

  return callAI(prompt)
}

// =====================================================
// 2. proofreadText
// =====================================================

export async function proofreadText(text: string): Promise<AiTextResult> {
  if (!text || text.trim().length === 0) {
    return { ok: false, text: null, error: 'Tom tekst — intet at rette' }
  }

  const prompt = `Ret følgende dansk tekst for stavefejl, komma, punktum og grammatik.
Bevar betydning, tone og længde. Tilføj IKKE noget nyt indhold.
Returnér KUN den rettede tekst.

TEKST:
"""
${truncate(text)}
"""`

  return callAI(prompt)
}

// =====================================================
// 3. makeProfessional
// =====================================================

export async function makeProfessional(text: string): Promise<AiTextResult> {
  if (!text || text.trim().length === 0) {
    return { ok: false, text: null, error: 'Tom tekst' }
  }

  const prompt = `Omskriv følgende danske tekst til en mere professionel og formel tone.
Bevar alt konkret indhold (navne, beløb, datoer, fakta) UÆNDRET.
Tilføj IKKE nye løfter eller information.

TEKST:
"""
${truncate(text)}
"""`

  return callAI(prompt)
}

// =====================================================
// 4. makeShorter
// =====================================================

export async function makeShorter(text: string): Promise<AiTextResult> {
  if (!text || text.trim().length === 0) {
    return { ok: false, text: null, error: 'Tom tekst' }
  }

  const prompt = `Forkort følgende danske tekst. Bevar alle vigtige fakta, navne, beløb og datoer.
Mål: cirka halv længde, men aldrig så kort at vigtige detaljer mistes.
Tilføj IKKE nyt indhold.

TEKST:
"""
${truncate(text)}
"""`

  return callAI(prompt)
}

// =====================================================
// 5. generateDraftFromInstruction (Phase 2)
// =====================================================

/**
 * Lav et udkast på baggrund af brugerens instruktion + mail-kontekst.
 * Eksempler på instruktioner:
 *  - "Skriv at vi vender tilbage i morgen"
 *  - "Bed kunden sende billeder af tavlen"
 *  - "Skriv at vi mangler fuldmagt før vi kan gå videre"
 *
 * AI får adgang til den indkommende mail, kunde og sag (hvis tilknyttet)
 * som kontekst — men brugerens instruktion er den primære retning.
 */
export async function generateDraftFromInstruction(
  emailId: string,
  instruction: string
): Promise<AiTextResult> {
  validateUUID(emailId, 'emailId')
  if (!instruction || instruction.trim().length === 0) {
    return { ok: false, text: null, error: 'Skriv en instruktion først' }
  }
  if (instruction.length > 1000) {
    return { ok: false, text: null, error: 'Instruktion må højst være 1000 tegn' }
  }

  const supabase = await createClient()
  const { data: email } = await supabase
    .from('incoming_emails')
    .select(
      `id, subject, sender_email, sender_name, body_text, body_html, body_preview,
       received_at, customer_id, service_case_id,
       customers ( id, company_name, contact_person, customer_number )`
    )
    .eq('id', emailId)
    .maybeSingle()

  if (!email) {
    return { ok: false, text: null, error: 'Mail ikke fundet' }
  }

  const customer = (email as { customers?: { company_name?: string; contact_person?: string | null; customer_number?: string } }).customers || null
  const senderLabel = email.sender_name || email.sender_email || 'Kunde'

  let caseContext = ''
  if (email.service_case_id) {
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('case_number, title, status, description')
      .eq('id', email.service_case_id)
      .maybeSingle()
    if (caseRow) {
      caseContext = `\nSAGSREFERENCE: ${caseRow.case_number} — ${caseRow.title} (status: ${caseRow.status})`
      if (caseRow.description) {
        caseContext += `\nSagsbeskrivelse: ${truncate(caseRow.description, 500)}`
      }
    }
  }

  const bodyForAI = truncate(email.body_text || stripHtml(email.body_html || '') || email.body_preview || '')

  const customerLine = customer
    ? `KUNDE: ${customer.company_name}${customer.contact_person ? ` (kontakt: ${customer.contact_person})` : ''}${customer.customer_number ? ` — kundenr. ${customer.customer_number}` : ''}`
    : 'KUNDE: ikke koblet'

  const prompt = `Skriv et dansk svar baseret på medarbejderens instruktion. Brug mailen + kundekontekst som baggrund.
Følg instruktionen præcist. Hvis instruktionen kræver konkrete oplysninger som du IKKE kan udlede, brug [BRUGER UDFYLDER].
Ingen overskrift som "Hej X" hvis det føles forceret. Underskrift kun hvis naturligt.

INDKOMMENDE MAIL:
Fra: ${senderLabel}
Emne: ${email.subject || '(intet emne)'}

${customerLine}${caseContext}

MAILTEKST:
"""
${bodyForAI}
"""

MEDARBEJDERENS INSTRUKTION:
"""
${instruction.trim()}
"""

Skriv KUN selve svarteksten — ingen forklaringer.`

  return callAI(prompt)
}

// =====================================================
// 6. translateText (Phase 2)
// =====================================================

const SUPPORTED_LANGS = ['da', 'en'] as const
export type SupportedLang = typeof SUPPORTED_LANGS[number]

const LANG_LABELS: Record<SupportedLang, string> = {
  da: 'dansk',
  en: 'engelsk',
}

export async function translateText(
  text: string,
  targetLanguage: SupportedLang
): Promise<AiTextResult> {
  if (!text || text.trim().length === 0) {
    return { ok: false, text: null, error: 'Tom tekst — intet at oversætte' }
  }
  if (!SUPPORTED_LANGS.includes(targetLanguage)) {
    return { ok: false, text: null, error: 'Ikke-understøttet sprog' }
  }

  const langLabel = LANG_LABELS[targetLanguage]

  const prompt = `Oversæt følgende tekst til ${langLabel}.
KRAV:
- Bevar alle navne, datoer, beløb, kundenumre og tekniske termer UÆNDREDE
- Bevar betydning og tone præcist
- Ændr IKKE indholdet — kun sproget
- Bevar afsnit og linjeskift
- Hvis teksten allerede er på ${langLabel}, returnér den uændret

TEKST:
"""
${truncate(text)}
"""

Returnér KUN selve oversættelsen.`

  return callAI(prompt)
}

// =====================================================
// 7. makeFriendlier (Phase 2)
// =====================================================

export async function makeFriendlier(text: string): Promise<AiTextResult> {
  if (!text || text.trim().length === 0) {
    return { ok: false, text: null, error: 'Tom tekst' }
  }

  const prompt = `Omskriv følgende danske tekst til en mere venlig, varm og kundevenlig tone.
KRAV:
- Bevar alt konkret indhold (navne, beløb, datoer, fakta) UÆNDRET
- Bevar professionel tone — ikke for kammeratlig
- Tilføj IKKE nye løfter eller information
- Brug venlige formuleringer som "tak", "gerne", "vi hjælper med..."

TEKST:
"""
${truncate(text)}
"""`

  return callAI(prompt)
}
