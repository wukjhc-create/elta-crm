/**
 * PRODUCTION read-only: feltnavne i FormSubmit-tabellerne. Udskriver KUN korte tokens der optræder i ≥ 5 forskellige
 * henvendelser (feltnavne gentages; personværdier gør ikke) — ingen personoplysninger.
 *   npx tsx scripts/prod-webform-labels.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-webform-labels', async (run) => {
  const rows = (await run(`SELECT json_agg(coalesce(body_text, '') || chr(10) || coalesce(body_html, '')) j FROM incoming_emails WHERE sender_email ILIKE '%@formsubmit.co' AND subject ILIKE '%henvendelse%'`))[0].j as string[] | null
  const freq = new Map<string, number>()
  for (const body of rows ?? []) {
    const seen = new Set<string>()
    const text = body.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    for (const raw of text.split('\n')) {
      const l = raw.trim().replace(/[:：]\s*$/, '')
      if (l.length < 2 || l.length > 30 || /\d|@/.test(l)) continue
      seen.add(l.toLowerCase())
    }
    for (const t of seen) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  const out = [...freq.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 40)
  console.log(JSON.stringify(out))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
