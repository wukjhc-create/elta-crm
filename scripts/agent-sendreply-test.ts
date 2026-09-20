/**
 * Test af mail.send_reply med MOCKET transport (ingen rigtig Graph-mail).
 *   npx tsx scripts/agent-sendreply-test.ts
 */
import { prepareSendReply, executeSendReply, type MailTransport } from '../src/lib/agents/send-reply'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

const ctx = (payload: Record<string, unknown>) => ({ action: { payload }, run: {}, admin: {} } as never)
const validPayload = { email_id: 'e1', to: 'kunde@x.dk', subject: 'Svar', body: 'Hej, tak for din henvendelse. Vi vender tilbage.' }

async function run() {
  // prepareSendReply
  assert(prepareSendReply(validPayload).ok, 'prepare: gyldig => ok')
  assert(!prepareSendReply({ ...validPayload, to: 'ikke-en-email' }).ok, 'prepare: ugyldig modtager => afvist')
  assert(!prepareSendReply({ ...validPayload, subject: '' }).ok, 'prepare: tomt emne => afvist')
  assert(!prepareSendReply({ ...validPayload, body: '' }).ok, 'prepare: tomt draft => afvist')

  // executeSendReply — transport kaldes præcis én gang ved gyldigt send
  {
    let calls = 0
    const t: MailTransport = async () => { calls++; return { ok: true, messageId: 'm1' } }
    const r = await executeSendReply(ctx(validPayload), t)
    assert(r.ok && calls === 1, 'gyldigt send => transport kaldt PRAECIS én gang', `calls=${calls}`)
    assert(!r.uncertain, 'gyldigt send => ikke uncertain')
  }

  // invalid recipient => transport aldrig kaldt (intet sendt)
  {
    let calls = 0
    const t: MailTransport = async () => { calls++; return { ok: true } }
    const r = await executeSendReply(ctx({ ...validPayload, to: 'bad' }), t)
    assert(!r.ok && calls === 0, 'ugyldig modtager => transport IKKE kaldt', `calls=${calls}`)
  }

  // tomt draft => transport aldrig kaldt
  {
    let calls = 0
    const t: MailTransport = async () => { calls++; return { ok: true } }
    const r = await executeSendReply(ctx({ ...validPayload, body: '' }), t)
    assert(!r.ok && calls === 0, 'tomt draft => transport IKKE kaldt')
  }

  // transport returnerer eksplicit ikke-sendt => failed (ikke uncertain)
  {
    const t: MailTransport = async () => ({ ok: false })
    const r = await executeSendReply(ctx(validPayload), t)
    assert(!r.ok && !r.uncertain, 'transport eksplicit ikke-sendt => failed (definitivt)')
  }

  // transport KASTER => uncertain (uvist om sendt) => aldrig auto-retry
  {
    const t: MailTransport = async () => { throw new Error('timeout') }
    const r = await executeSendReply(ctx(validPayload), t)
    assert(!r.ok && r.uncertain === true, 'transport-exception => uncertain (needs_verification)')
  }

  console.log(`\n${fails === 0 ? '✅ ALLE SEND_REPLY-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
}
run()
