/**
 * EC-T1: afgrænset timeout i economicFetch — global fetch er MOCKET (intet netværk, ingen e-conomic).
 *   npx tsx scripts/economic-timeout-test.ts
 * Kill-switchen sættes kun i DENNE testproces for at nå skrive-stien (fetch er mocket — intet kan sendes).
 */
import { economicFetchForTests, exportOutcomeUncertain, ECONOMIC_TIMEOUT_CODE, claimTimestamp, CLAIM_SENT_SUFFIX } from '../src/lib/services/economic-client'
import { ECONOMIC_PUSH_DISABLED_CODE } from '../src/lib/accounting/economic-push-flag'

let bad = 0
const t = (label: string, ok: boolean, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const settings = { api_token: 'test', agreement_grant_token: 'test' } as never
let calls = 0
const hang = (_u: unknown, init?: { signal?: AbortSignal }) => new Promise<Response>((_res, rej) => {
  calls++
  init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
})

async function main() {
  const realFetch = globalThis.fetch
  try {
    // 1. læse-timeout → normal fejl (ikke uvist-relevant for læsning), ingen genforsøg
    globalThis.fetch = hang as typeof fetch
    calls = 0
    const r1 = await economicFetchForTests(settings, '/self', { method: 'GET', timeoutMs: 50 })
    t('læse-timeout giver ECONOMIC_TIMEOUT', !r1.ok && r1.status === 0 && r1.error === ECONOMIC_TIMEOUT_CODE, `${r1.status}/${r1.error}`)
    t('læse-timeout: ét kald (intet genforsøg)', calls === 1, `kald=${calls}`)

    // 2. skrive-timeout → UVIST, ingen genforsøg
    process.env.ECONOMIC_PUSH_ENABLED = 'true'
    calls = 0
    const r2 = await economicFetchForTests(settings, '/invoices/drafts', { method: 'POST', body: {}, timeoutMs: 50 })
    t('skrive-timeout giver ECONOMIC_TIMEOUT (status 0)', !r2.ok && r2.status === 0 && r2.error === ECONOMIC_TIMEOUT_CODE, `${r2.status}/${r2.error}`)
    t('skrive-timeout klassificeres som UVIST', exportOutcomeUncertain(r2))
    t('skrive-timeout: ét kald (intet automatisk genforsøg)', calls === 1, `kald=${calls}`)

    // 3. svaret når frem, men brødteksten hænger → stadig timeout (kaldet kan være udført = uvist)
    calls = 0
    globalThis.fetch = (async (_u: unknown, init?: { signal?: AbortSignal }) => {
      calls++
      return { ok: true, status: 201, text: () => new Promise<string>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))) } as unknown as Response
    }) as typeof fetch
    const r3 = await economicFetchForTests(settings, '/invoices/drafts', { method: 'POST', body: {}, timeoutMs: 50 })
    t('hængende svar-krop → timeout = uvist', !r3.ok && r3.error === ECONOMIC_TIMEOUT_CODE && exportOutcomeUncertain(r3))

    // 4. netværksfejl (ikke timeout) → uvist ved skrivning
    globalThis.fetch = (async () => { throw new Error('fetch failed') }) as typeof fetch
    const r4 = await economicFetchForTests(settings, '/invoices/drafts', { method: 'POST', body: {}, timeoutMs: 50 })
    t('netværksfejl ved skrivning = uvist', !r4.ok && r4.status === 0 && r4.error === 'fetch failed' && exportOutcomeUncertain(r4))

    // 5. hurtigt svar påvirkes ikke
    globalThis.fetch = (async () => ({ ok: true, status: 201, text: async () => '{"draftInvoiceNumber":7}' }) as unknown as Response) as typeof fetch
    const r5 = await economicFetchForTests<{ draftInvoiceNumber: number }>(settings, '/invoices/drafts', { method: 'POST', body: {}, timeoutMs: 1000 })
    t('hurtigt svar = succes', r5.ok && r5.data?.draftInvoiceNumber === 7)

    // 6. kill-switch uændret: skrivning blokeres uden at fetch kaldes
    delete process.env.ECONOMIC_PUSH_ENABLED
    calls = 0
    globalThis.fetch = hang as typeof fetch
    const r6 = await economicFetchForTests(settings, '/invoices/drafts', { method: 'POST', body: {} })
    t('kill-switch: skrivning blokeret, intet kald', !r6.ok && r6.error === ECONOMIC_PUSH_DISABLED_CODE && calls === 0 && !exportOutcomeUncertain(r6))

    // 7. krav-tidsstempel tåler REQUEST_STARTED-markøren
    const ts = 1761400000000
    t('claimTimestamp(pending-<ms>)', claimTimestamp(`pending-${ts}`) === ts)
    t('claimTimestamp(pending-<ms>-sent)', claimTimestamp(`pending-${ts}${CLAIM_SENT_SUFFIX}`) === ts)
    t('claimTimestamp(ugyldig) = null', claimTimestamp('pending-abc') === null)
  } finally {
    globalThis.fetch = realFetch
    delete process.env.ECONOMIC_PUSH_ENABLED
  }
  console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ EC-T1 timeout-politik ok')
  process.exitCode = bad ? 1 : 0
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
