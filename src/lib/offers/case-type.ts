/**
 * Eksplicit sagstype på tilbud (00244, Henrik 2026-11-01). Sælgeren vælger én af to typer; sagen fra tilbuddet arver
 * typen 1:1 og dermed den rigtige aflevering-tjekliste (lib/cases/handover-checklist). Typen udledes ALDRIG af titel,
 * tekst, varenavne eller AI — kun af sælgerens valg eller en manuelt valgt pakkes strukturerede `job_type`.
 * Historiske tilbud (NULL) giver en el-installationssag som før. Ren logik (scripts/offer-case-type-test.ts).
 */

export const OFFER_CASE_TYPES = ['solar', 'installation'] as const
export type OfferCaseType = (typeof OFFER_CASE_TYPES)[number]

export const OFFER_CASE_TYPE_LABELS: Record<OfferCaseType, string> = {
  solar: 'Solceller / batteri',
  installation: 'Elinstallation / service',
}

export function isOfferCaseType(v: unknown): v is OfferCaseType {
  return typeof v === 'string' && (OFFER_CASE_TYPES as readonly string[]).includes(v)
}

/** service_cases.type for en sag oprettet fra tilbuddet (NULL/ukendt → installation = adfærden før 00244) */
export function serviceCaseTypeForOffer(caseType: unknown): OfferCaseType {
  return isOfferCaseType(caseType) ? caseType : 'installation'
}

/** Pakkens strukturerede job_type → tilbuddets sagstype (offer_packages: solar | installation | service); ukendt → null */
export function offerCaseTypeFromPackageJobType(jobType: unknown): OfferCaseType | null {
  if (jobType === 'solar') return 'solar'
  if (jobType === 'installation' || jobType === 'service') return 'installation'
  return null
}

/** Tekst til forhåndsvisning af tilbud → sag */
export function offerCaseTypePreviewLabel(caseType: unknown): string {
  return isOfferCaseType(caseType) ? OFFER_CASE_TYPE_LABELS[caseType] : `${OFFER_CASE_TYPE_LABELS.installation} (ikke valgt på tilbuddet)`
}
