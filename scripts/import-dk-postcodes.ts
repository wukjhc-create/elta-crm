/**
 * ADDR-1 beslutning B (Henrik 2026-10-19): importér det OFFICIELLE DAR-postnummerdatasæt → src/lib/address/data/dk-postcodes.json
 * (kun postnummer + by, med kilde/version/hentetidspunkt). Ingen manuelt vedligeholdt liste; intet runtime-API.
 *
 * Kilde (standard): Datafordeleren DAR REST "postnummer" (anonym, officiel; udfases 15/1-2027 → skift til DAR Fildownload
 * eller GraphQL med API-nøgle og brug --from-file). Licens: CC BY 4.0, kreditering af Klimadatastyrelsen.
 *
 *   npx tsx scripts/import-dk-postcodes.ts                     (henter fra DAR REST)
 *   npx tsx scripts/import-dk-postcodes.ts --from-file x.json  (JSON-array med postnr/navn/status fra DAR)
 *   npx tsx scripts/import-dk-postcodes.ts --dry-run           (validerer, skriver intet)
 *
 * Sikker opdatering: validering (4 cifre, ikke-tomme navne, ingen modstridende navne, 500–2000 postnumre, højst 5 %
 * fjernede postnumre i forhold til den eksisterende fil uden --allow-shrink) før filen overskrives.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SOURCE_URL = 'https://services.datafordeler.dk/DAR/DAR/1/rest/postnummer'
const OUT = join(process.cwd(), 'src', 'lib', 'address', 'data', 'dk-postcodes.json')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const allowShrink = args.includes('--allow-shrink')
const fromFileIdx = args.indexOf('--from-file')
const fromFile = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null

type Row = { postnr?: string; navn?: string; status?: string | number; datafordelerOpdateringstid?: string }

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = []
  for (let page = 1; page <= 20; page++) {
    const url = `${SOURCE_URL}?format=json&pagesize=1000&page=${page}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`DAR svarede ${res.status} på side ${page}`)
    const rows = (await res.json()) as Row[]
    if (!Array.isArray(rows)) throw new Error('Uventet svarformat fra DAR')
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

async function main() {
  const rows: Row[] = fromFile ? (JSON.parse(readFileSync(fromFile, 'utf8')) as Row[]) : await fetchAll()
  const postcodes: Record<string, string> = {}
  let maxUpdated = ''
  let skipped = 0
  for (const r of rows) {
    if (String(r.status) !== '3') { skipped++; continue } // kun gældende (DAR livscyklus 3)
    const nr = String(r.postnr ?? '').trim()
    const navn = String(r.navn ?? '').trim()
    if (!/^\d{4}$/.test(nr) || !navn) throw new Error(`Ugyldig række: ${JSON.stringify({ nr, navn })}`)
    if (postcodes[nr] && postcodes[nr] !== navn) throw new Error(`Modstridende navne for ${nr}: "${postcodes[nr]}" / "${navn}"`)
    postcodes[nr] = navn
    if (r.datafordelerOpdateringstid && r.datafordelerOpdateringstid > maxUpdated) maxUpdated = r.datafordelerOpdateringstid
  }
  const count = Object.keys(postcodes).length
  if (count < 500 || count > 2000) throw new Error(`Usandsynligt antal postnumre: ${count}`)

  if (existsSync(OUT) && !allowShrink) {
    const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { postcodes?: Record<string, string> }
    const prevKeys = Object.keys(prev.postcodes ?? {})
    const removed = prevKeys.filter((k) => !(k in postcodes))
    if (prevKeys.length && removed.length / prevKeys.length > 0.05) {
      throw new Error(`${removed.length} af ${prevKeys.length} postnumre ville forsvinde — kør med --allow-shrink hvis det er korrekt`)
    }
  }

  const sorted = Object.fromEntries(Object.keys(postcodes).sort().map((k) => [k, postcodes[k]]))
  const dataset = {
    meta: {
      source: 'Danmarks Adresseregister (DAR) — postnummer, via Datafordeleren',
      sourceUrl: fromFile ? `fil: ${fromFile}` : SOURCE_URL,
      license: 'CC BY 4.0 — Indeholder data fra Danmarks Adresseregister (DAR), Klimadatastyrelsen',
      statusFilter: '3 (gældende)',
      sourceVersion: maxUpdated || null,
      fetchedAt: new Date().toISOString(),
      count,
    },
    postcodes: sorted,
  }
  console.log(`DAR-postnumre: ${count} gældende (${skipped} ikke-gældende sprunget over), kildeversion ${maxUpdated || 'ukendt'}`)
  if (dryRun) { console.log('--dry-run: intet skrevet'); return }
  writeFileSync(OUT, JSON.stringify(dataset, null, 1) + '\n', 'utf8')
  console.log(`Skrevet: ${OUT}`)
}

main().catch((err) => { console.error(`❌ ${err instanceof Error ? err.message : String(err)}`); process.exit(1) })
