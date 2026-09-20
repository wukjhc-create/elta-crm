/**
 * Test af Mailagent draft-fallback (fail-closed paa LLM-spend).
 * Uden OPENAI_API_KEY skal generateReplyDraft returnere den sikre template.
 *   npx tsx scripts/agent-draft-test.ts
 *
 * Rammer IKKE OpenAI (ingen noegle i test-processen) og ingen DB.
 */
delete process.env.OPENAI_API_KEY // tving fail-closed/template-stien

let fails = 0
const assert = (cond: boolean, label: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fails++ }

async function run() {
  const { generateReplyDraft } = await import('../src/lib/agents/mail-agent')
  const email = {
    id: 'e1', subject: 'Tilbud?', sender_email: 'kunde@x.dk', sender_name: 'Bo Hansen',
    body_text: 'Hej, hvad koster det?', body_preview: null, customer_id: null,
  }
  const r = await generateReplyDraft(email)
  assert(r.source === 'template', 'uden OPENAI_API_KEY => template (fail-closed)')
  assert(r.draft.includes('Med venlig hilsen'), 'template indeholder signatur')
  assert(r.draft.includes('[BRUGER UDFYLDER'), 'template markerer huller')

  console.log(`\n${fails === 0 ? '✅ ALLE DRAFT-TESTS PASS' : `❌ ${fails} FEJL`}`)
  process.exit(fails === 0 ? 0 : 1)
}
run()
