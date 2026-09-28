/**
 * Unit-test af send_reply-produceren + live-gate (P2-rest B). Ingen DB, ingen afsendelse.
 *   npx tsx scripts/agent-send-producer-test.ts
 */
import { sendProposalBlocker, replySubject, TEMPLATE_PLACEHOLDER, type DraftActionLite } from '../src/lib/agents/send-reply-producer'
import { liveSendBlocked, isLiveSendEnabled } from '../src/lib/agents/live-gates'
import { actionControls, reviewerReason } from '../src/lib/agents/inbox-presentation'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }
const D = (extra: Partial<DraftActionLite> = {}): DraftActionLite => ({ id: 'd1', run_id: 'r1', task_id: 't1', capability: 'mail.draft_reply', status: 'executed',
  payload: { email_id: 'e1' }, result: { draft: 'Hej Anne,\n\nVi kommer tirsdag kl. 8.\n\nMvh Elta' }, ...extra })

assert(sendProposalBlocker(D()) === null, 'udført, udfyldt udkast -> kan forberedes')
assert(/Udfør/.test(sendProposalBlocker(D({ status: 'planned' })) ?? ''), 'ikke materialiseret -> afvist')
assert(/pladsholderen/.test(sendProposalBlocker(D({ result: { draft: `Hej\n${TEMPLATE_PLACEHOLDER}: konkret svar]` } })) ?? ''), 'skabelon-pladsholder -> afvist (ikke reviewet)')
assert(/tomt/.test(sendProposalBlocker(D({ result: { draft: '  ' } })) ?? ''), 'tomt udkast -> afvist')
assert(!!sendProposalBlocker(D({ capability: 'followup.draft_offer_reminder' })), 'andet udkast end svarudkast -> afvist')

assert(replySubject('Tilbud på solceller') === 'Re: Tilbud på solceller', 'emne får Re:')
assert(replySubject('RE: Tilbud') === 'RE: Tilbud' && replySubject('SV: x') === 'SV: x', 'eksisterende Re/SV bevares')
assert(replySubject('') === 'Re: Din henvendelse', 'tomt emne -> standard')

assert(!isLiveSendEnabled({}) && !isLiveSendEnabled({ AGENT_LIVE_SEND_ENABLED: '1' }) && isLiveSendEnabled({ AGENT_LIVE_SEND_ENABLED: 'true' }), 'live-send kun ved præcis "true"')
assert(liveSendBlocked('send_external', {}) && liveSendBlocked('push_external', {}) && !liveSendBlocked('create', {}), 'kun send/push gates')
assert(!liveSendBlocked('send_external', { AGENT_LIVE_SEND_ENABLED: 'true' }), 'åben når flaget er sat')

const send = { status: 'approved', side_effect_class: 'send_external', requires_approval: true }
const off = actionControls(send, true, Date.now(), { liveSendEnabled: false })
assert(!off.canExecute && /Live afsendelse/.test(off.executeHint ?? ''), 'Inbox: godkendt send + live off -> Udfør slået fra med forklaring')
assert(actionControls(send, true, Date.now(), { liveSendEnabled: true }).canExecute, 'Inbox: godkendt send + live on -> Udfør mulig')
assert(reviewerReason('Afvist: live afsendelse er slået fra (AGENT_LIVE_SEND_ENABLED) — intet sendt') === 'Live afsendelse er slået fra — intet er sendt.', 'årsag oversat')

console.log(`\n${fails === 0 ? '✅ ALLE SEND-PRODUCER-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
