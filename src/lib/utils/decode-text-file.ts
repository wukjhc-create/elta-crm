/**
 * Dekod en tekstfil (CSV fra grossister) uden at miste æ/ø/å. Ren funktion — virker i browser og Node.
 *
 * Fund: import-guiden brugte FileReader.readAsText (= UTF-8). AO leverer ISO-8859-1 → "Indkøbspris" blev
 * "Indk�bspris" i browseren, før serveren så filen; kolonnen matchede ikke og varenavne blev ødelagt. Serverens
 * encoding-fallback kan ikke redde tekst der allerede er tabt.
 *
 * Regel: gyldig UTF-8 (strict) → UTF-8 (BOM fjernes); ellers windows-1252 (supersæt af ISO-8859-1 for tegn, inkl. €).
 */
export function decodeTextFile(bytes: ArrayBuffer | Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u8)
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'windows-1252' }
  }
}
