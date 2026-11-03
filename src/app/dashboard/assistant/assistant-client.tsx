'use client'

import { useState } from 'react'
import Link from 'next/link'
import { answerCrmQuestion, confirmAssistantProposal, type CrmAnswer } from '@/lib/actions/crm-assistant'

const EXAMPLES = [
  'Hvem har vi ikke ringet tilbage til?',
  'Jobs i morgen',
  'Ubesvarede mails og opkald',
  'Hvilke sager mangler en fuldmagt?',
]

const CONFIRM: Record<NonNullable<CrmAnswer['proposal']>['kind'], string> = {
  create_task: 'Bekræft og opret opgaven',
  move_inspection: 'Bekræft og flyt besigtigelsen',
  assign_task: 'Bekræft og tildel opgaven',
  add_note: 'Bekræft og gem noten',
  link_mail: 'Bekræft og knyt mailen',
}

export function AssistantClient() {
  const [question, setQuestion] = useState(EXAMPLES[0])
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<CrmAnswer | null>(null)

  async function ask(text: string) {
    setBusy(true)
    try {
      setAnswer(await answerCrmQuestion(text))
    } catch {
      setAnswer({ ok: false, text: 'Spørgsmålet kunne ikke besvares. Intet er ændret.', items: [], sends: false, proposal: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <label htmlFor="crm-question" className="block text-sm font-medium text-gray-800">Spørgsmål</label>
        <textarea id="crm-question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="w-full rounded-md border p-3 text-sm" />
        <button type="submit" disabled={busy || !question.trim()} className="min-h-11 rounded-md bg-green-700 px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Leder…' : 'Spørg'}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="rounded-full border px-3 py-1 text-xs text-gray-700" onClick={() => { setQuestion(example); void ask(example) }}>
            {example}
          </button>
        ))}
      </div>
      {answer && (
        <section className="rounded-lg border bg-white p-4">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{answer.text}</p>
          {answer.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {answer.items.map((item, i) => (
                <li key={`${item.title}-${i}`} className="text-sm">
                  {item.href ? <Link href={item.href} className="font-medium text-blue-700 hover:underline">{item.title}</Link> : <span className="font-medium">{item.title}</span>}
                  <span className="text-gray-500"> — {item.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {answer.proposal && (
            <button
              type="button"
              disabled={busy}
              className="mt-3 min-h-11 rounded-md border border-green-700 px-4 text-sm font-medium text-green-800 disabled:opacity-50"
              onClick={() => {
                const proposal = answer.proposal
                if (!proposal) return
                setBusy(true)
                void confirmAssistantProposal({ confirmed: true, proposal }).then((res) => {
                  setAnswer({ ok: res.success, text: res.message, items: [], sends: false, proposal: null })
                }).catch(() => {
                  setAnswer({ ok: false, text: 'Handlingen kunne ikke udføres. Intet er ændret.', items: [], sends: false, proposal: null })
                }).finally(() => setBusy(false))
              }}
            >
              {CONFIRM[answer.proposal.kind]}
            </button>
          )}
          <p className="mt-3 text-xs text-gray-500">{answer.proposal ? 'Forslaget er ikke udført.' : 'Intet er sendt.'}</p>
        </section>
      )}
    </div>
  )
}
