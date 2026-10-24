/**
 * PRODUCTION read-only: kildetekst-kendetegn for én funktion (længde, md5 med/uden CR, linjeskift-type, normaliseret md5)
 * — til at afgøre om en hash-forskel mod staging kun er CRLF/whitespace. Udskriver aldrig selve koden.
 *   npx tsx scripts/prod-fn-source-diff.ts <funktionsnavn>
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const fn = process.argv[2] ?? ''
if (!/^[a-z_0-9]+$/.test(fn)) { console.error('brug: prod-fn-source-diff.ts <funktionsnavn>'); process.exit(2) }

withProdReadOnly('prod-fn-source-diff', async (run, masked) => {
  const r = (await run(`SELECT length(p.prosrc) len, md5(p.prosrc) raw_md5, (position(chr(13) in p.prosrc) > 0) has_cr,
      md5(replace(p.prosrc, chr(13), '')) nocr_md5, md5(regexp_replace(p.prosrc, '\\s+', ' ', 'g')) ws_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${fn}'`))[0]
  console.log(JSON.stringify({ target: `prod:${masked}`, fn, ...r }))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
