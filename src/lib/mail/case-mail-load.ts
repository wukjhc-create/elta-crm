/** Skelner en fejlet sags-mailhentning fra en tom liste. Ingen I/O. */

export const CASE_MAIL_LOAD_ERROR = 'Kunne ikke hente mails på sagen'

export function caseEmailsOrThrow<T>(error: unknown, rows: readonly T[] | null): T[] {
  if (error) throw new Error(CASE_MAIL_LOAD_ERROR)
  return rows ? [...rows] : []
}
