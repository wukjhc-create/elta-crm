/**
 * LC-8 (review 2026-10-17): telefonnumre gemmes med mellemrum ("20 34 56 78"), men søges uden ("20345678" fra et
 * opkald). Er søgningen et telefonnummer (6+ cifre, evt. +45/mellemrum/bindestreg), gives et ilike-mønster med %
 * mellem cifrene, som matcher begge formater. Ellers null. Ren funktion — bevidst IKKE 'use server'.
 */
export function phoneDigitsPattern(search: string | null | undefined): string | null {
  const raw = String(search ?? '').trim()
  if (!/^[+\d][\d\s\-().]*$/.test(raw)) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.length > 8 && digits.startsWith('45')) digits = digits.slice(2)
  if (digits.length < 6 || digits.length > 12) return null
  return `%${digits.split('').join('%')}%`
}
