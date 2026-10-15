/** Ikonknapper har et dansk navn. Handlingen er den samme. Kør: npx tsx scripts/icon-button-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const modal = fs.readFileSync('src/components/modules/service-cases/create-service-case-modal.tsx', 'utf8')
const kalkia = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/[id]/kalkia-node-detail-client.tsx', 'utf8')

eq('fjern kunde har navn', modal.includes('aria-label="Fjern valgt kunde"'), true)
eq('fjern kunde rydder valget', modal.includes('setSelectedCustomerId(null)') && modal.includes("setSelectedCustomerName('')"), true)
eq('luk har stadig navn', modal.includes('aria-label="Luk"'), true)
eq('kundenavn ombrydes', modal.includes('flex-1 min-w-0 break-words">{selectedCustomerName}'), true)
eq('fjern link har navn', kalkia.includes('aria-label="Fjern link"') && kalkia.includes('handleUnlink(material.id)'), true)
eq('link-titel bliver', kalkia.includes('title="Fjern link"'), true)

const toast = fs.readFileSync('src/components/ui/toast.tsx', 'utf8')
const mail = fs.readFileSync('src/components/mail/create-from-mail-dialog.tsx', 'utf8')
const compose = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')
const customers = fs.readFileSync('src/components/modules/customers/customers-page-client.tsx', 'utf8')
const contact = fs.readFileSync('src/components/modules/customers/contact-form.tsx', 'utf8')
const report = fs.readFileSync('src/components/modules/customers/send-besigtigelsesreport-dialog.tsx', 'utf8')
const note = fs.readFileSync('src/components/modules/customers/besigtigelse-notat.tsx', 'utf8')
const reminder = fs.readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')

eq('toast lukker med navn', toast.includes('aria-label="Luk"') && toast.includes('onRemove(toast.id)'), true)
eq('opret fra mail lukker med navn', mail.includes('aria-label="Luk"') && mail.includes('onClick={onClose}'), true)
eq('email lukkes med navn', compose.includes('aria-label="Luk email"') && compose.includes('setShowCompose(false)'), true)
eq('statusfilter ryddes med navn', customers.includes('aria-label="Ryd status"') && customers.includes("handleStatusFilter('')"), true)
eq('kontakt lukkes med navn', contact.includes('aria-label="Luk"') && contact.includes('onClick={onClose}'), true)
eq('rapport lukkes med navn', report.includes('aria-label="Luk"') && report.includes('disabled={isSending}'), true)
eq('billede fjernes med navn', note.includes('aria-label="Fjern billede"') && note.includes('removeImage(globalIdx)'), true)
eq('paamindelse minimeres med navn', reminder.includes('aria-label="Minimer"') && reminder.includes('setIsMinimized(true)'), true)

console.log(fail ? `\n${fail} fejl` : '\nicon-button-label-test OK')
process.exitCode = fail ? 1 : 0
