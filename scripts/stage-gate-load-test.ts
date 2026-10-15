/** Rate og slutfaktura oprettes ikke naar et vaern ikke kan laeses. Procent og beloeb bliver. Koer: npx tsx scripts/stage-gate-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/services/invoice-stage.ts', 'utf8')
const stage = src.slice(src.indexOf('export async function createStageInvoiceForCase'), src.indexOf('export async function createFinalInvoiceForCase'))
const fin = src.slice(src.indexOf('export async function createFinalInvoiceForCase'), src.indexOf('async function creditedByInvoice'))
const credit = src.slice(src.indexOf('async function creditedByInvoice'), src.indexOf('export async function listStageInvoicesForCase'))
const list = src.slice(src.indexOf('export async function listStageInvoicesForCase'))

eq('rate: sag siger fejl', stage.includes("if (sagError) return { ...empty, message: 'Kunne ikke hente sagen' }"), true)
eq('rate: manglende sag bliver', stage.includes("message: 'Sag ikke fundet'"), true)
eq('rate: moms siger fejl', stage.includes('Kunne ikke tjekke tilbuddets moms. Det tælles ikke som ekskl. moms.'), true)
eq('rate: moms-tjek bliver', stage.includes('Math.abs(Number(src.final_amount) - basisValue) < 0.005'), true)
eq('rate: slut siger fejl', stage.includes('Kunne ikke tælle slutfakturaer. Det tælles ikke som 0.'), true)
eq('rate: slut findes bliver', stage.includes('Slutfaktura findes allerede på sagen — ny deposit/progress er ikke tilladt'), true)
eq('rate: aekte nul kan fortsaette', stage.includes('if ((finalCount ?? 0) > 0)'), true)
eq('rate: rater siger fejl', stage.includes('Kunne ikke hente eksisterende rater. Det tælles ikke som 0 %.'), true)
eq('rate: kredit siger fejl', stage.includes('Kunne ikke hente kreditnotaer. Det tælles ikke som 0 kr.'), true)
eq('rate: procent bliver', stage.includes('netStagePercentage(r.billing_percentage, r.total_amount, stageCredits.get(r.id as string))'), true)
eq('rate: efterkontrol ruller tilbage', stage.indexOf('if (stagesNowError)') < stage.indexOf('netStagePercentage(r.billing_percentage, r.total_amount, creditsNow.get(r.id))'), true)
eq('rate: efterkontrol siger fejl', stage.includes('Kunne ikke tjekke den samlede procent. Raten blev ikke gemt. Det tælles ikke som 0 %.'), true)

eq('slut: sag siger fejl', fin.includes("if (sagError) return { ...empty, message: 'Kunne ikke hente sagen' }"), true)
eq('slut: manglende sag bliver', fin.includes("message: 'Sag ikke fundet'"), true)
eq('slut: opslag siger fejl', fin.includes('Kunne ikke tjekke slutfaktura. Det tælles ikke som at der ingen er.'), true)
eq('slut: findes bliver', fin.includes('Slutfaktura findes allerede på sagen'), true)
eq('slut: forgængere siger fejl', fin.includes('Kunne ikke hente forskud og rater. De tælles ikke som 0 kr.'), true)
eq('slut: kladde bliver', fin.includes('en ikke-udstedt forudbetaling kan ikke trækkes fra slutfakturaen'), true)
eq('slut: kreditkladde siger fejl', fin.includes('Kunne ikke tjekke kreditnota-kladder. De tælles ikke som ingen.'), true)
eq('slut: kreditkladde bliver', fin.includes('Send eller slet kreditnota-kladden først'), true)
eq('slut: arbejdsordrer siger fejl', fin.includes('Kunne ikke hente arbejdsordrer. Timer tælles ikke som 0.'), true)
eq('slut: afviste timer bliver', fin.includes(".neq('approval_status', 'rejected')"), true)
eq('slut: tom tekst bliver', fin.includes('Ingen ufakturerede linjer og ingen forgængere — slutfaktura ville være tom'), true)

eq('kredit: fejl er ikke 0', credit.includes("return { credits: out, error: 'Kunne ikke hente kreditnotaer' }"), true)
eq('kredit: fortegn bliver', credit.includes('Math.abs(Number(c.total_amount ?? 0))'), true)
eq('kredit: tom liste bliver', credit.includes('if (invoiceIds.length === 0) return { credits: out, error: null }'), true)
eq('liste: kredit siger fejl', list.includes("if (creditedRes.error) return { ok: false, message: 'Kunne ikke hente kreditnotaer' }"), true)

console.log(fail ? `\n${fail} fejl` : '\nstage-gate-load-test OK')
process.exitCode = fail ? 1 : 0
