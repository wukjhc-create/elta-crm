/**
 * LC-7 (review 2026-10-17, GDPR): emner og afsenderadresser indeholder ofte navne/adresser og må ikke i Vercel-logs
 * eller helbredsloggen. Log kun længde (emne) og domæne (adresse). Ren funktion — bevidst IKKE 'use server'.
 */
export function redactSubject(subject: string | null | undefined): string {
  return subject ? `[emne ${String(subject).length} tegn]` : '[intet emne]'
}

export function redactEmail(email: string | null | undefined): string {
  const e = String(email ?? '')
  const at = e.lastIndexOf('@')
  return at > 0 ? `*@${e.slice(at + 1).toLowerCase()}` : e ? '[adresse]' : '[ingen]'
}
