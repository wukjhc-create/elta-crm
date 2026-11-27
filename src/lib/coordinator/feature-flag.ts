/**
 * Phase C koordinator-flag (bevidst IKKE 'use server'). Alle standard FRA / uændret adfærd.
 *  - COORDINATOR_ENABLED          C2 afsendergenkendelse, C3 forslag, C5 sagens kommunikation, C7 arbejdskø, Stage A-visning
 *  - COORDINATOR_AI_ENABLED       C6 AI-assistent (kræver også COORDINATOR_ENABLED)
 *  - MAIL_CUSTOMER_AUTOCREATE_MODE  'auto' (standard = som i dag) | 'suggest' (C4-erstatning: mail-AI'en opretter ingen kunder;
 *                                 oprettelse sker som forslag med dubletkontrol i arbejdskøen)
 */
export function coordinatorEnabled(): boolean {
  return process.env.COORDINATOR_ENABLED === 'true'
}

export function coordinatorAiEnabled(): boolean {
  return coordinatorEnabled() && process.env.COORDINATOR_AI_ENABLED === 'true'
}

export type AutoCreateMode = 'auto' | 'suggest'
/** Kun den præcise værdi 'suggest' slår den automatiske kundeoprettelse fra — alt andet (inkl. tom) = 'auto' som i dag. */
export function mailCustomerAutoCreateMode(): AutoCreateMode {
  return process.env.MAIL_CUSTOMER_AUTOCREATE_MODE === 'suggest' ? 'suggest' : 'auto'
}

export const COORDINATOR_DISABLED_TEXT = 'Arbejdskøen og forslag er ikke slået til i dette miljø'
export const COORDINATOR_AI_DISABLED_TEXT = 'AI-assistenten er ikke slået til i dette miljø'

/** Arbejdskøens tidsvindue i dage (COORDINATOR_QUEUE_DAYS, standard 30, 1–365). Ældre åbne mails vises som efterslæb. */
export function coordinatorQueueDays(): number {
  const n = Number(process.env.COORDINATOR_QUEUE_DAYS)
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 30
}
