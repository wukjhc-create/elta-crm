/**
 * Heuristisk audit: simulerer den NYE AI-classify-prompts regler mod
 * eksisterende incoming_emails for at se hvilke der ville blive flyttet
 * til newsletter — og om nogen LINKED kunde-mails er i fare for at blive
 * fejlagtigt klassificeret.
 *
 * Bemaerk: dette er IKKE en koersel mod OpenAI. Det er en konservativ
 * "ville denne mail udloese newsletter-svar fra prompten?"-tjek baseret
 * paa de eksplicitte regler i prompten.
 *
 * Roerer INTET.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnv(file: string) {
  try {
    const raw = readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const k = m[1]
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnv(resolve(__dirname, '..', '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

// ---- Regler fra den nye prompt (heuristisk simulation) ----
const SOCIAL_MEDIA_DOMAINS = [
  'instagram.com', 'facebook.com', 'meta.com', 'linkedin.com',
  'twitter.com', 'x.com', 'tiktok.com', 'snapchat.com', 'pinterest.com',
]

const RABAT_KEYWORDS = [
  '% rabat', '%rabat', 'spar ', 'tilbud kun', 'black friday',
  'cyber monday', 'udsalg', 'kampagne', 'vind ', 'konkurrence',
  'discount', 'sale', 'limited time', 'flash sale',
]

const RABAT_EMOJIS = ['🔥', '💥', '🎉', '🛒', '⭐', '💰', '🎁']

const NEWSLETTER_FOOTER_MARKERS = [
  'afmeld', 'unsubscribe', 'manage preferences', 'view in browser',
  'se i browser', 'list-unsubscribe', 'vi har sendt dette',
  'klik her for at se', 'manage your subscription',
]

const SYSTEM_TRANSACTION_MARKERS = [
  'bekraeft din konto', 'aktiver', 'verify your email',
  'password reset', 'nulstil adgangskode', 'welcome to', 'velkommen til',
  'din booking', 'din tilmelding', 'confirmation code', 'bekraeftelseskode',
]

const BOT_PLATFORMS = [
  'github.com', 'slack.com', 'notion.so', 'zoom.us',
  'atlassian.com', 'asana.com', 'trello.com', 'monday.com',
]

interface Email {
  id: string
  subject: string | null
  sender_email: string | null
  body_preview: string | null
  link_status: string
}

function wouldBeNewsletter(e: Email): { match: boolean; rule: string } {
  const senderEmail = (e.sender_email || '').toLowerCase()
  const senderDomain = senderEmail.split('@')[1] || ''
  const subject = (e.subject || '').toLowerCase()
  const body = (e.body_preview || '').toLowerCase()
  const fullText = subject + ' ' + body

  // Rule 1: social media domains (exact or subdomain)
  for (const d of SOCIAL_MEDIA_DOMAINS) {
    if (senderDomain === d || senderDomain.endsWith('.' + d)) {
      return { match: true, rule: `social media domain: ${d}` }
    }
  }
  for (const d of BOT_PLATFORMS) {
    if (senderDomain === d || senderDomain.endsWith('.' + d)) {
      return { match: true, rule: `bot/SaaS platform: ${d}` }
    }
  }

  // Rule 2: rabat-emoji + marketing word
  const hasEmoji = RABAT_EMOJIS.some((e) => subject.includes(e))
  const hasRabat = RABAT_KEYWORDS.some((k) => fullText.includes(k))
  if (hasEmoji && hasRabat) return { match: true, rule: 'emoji + rabat-keyword' }
  if (hasRabat && /%\s*rabat|spar\s+\d/i.test(fullText)) {
    return { match: true, rule: 'eksplicit rabat-procent' }
  }

  // Rule 3: newsletter footer markers
  const hasFooter = NEWSLETTER_FOOTER_MARKERS.some((m) => body.includes(m))
  if (hasFooter) return { match: true, rule: 'newsletter footer/unsubscribe' }

  // Rule 4: system/transaction marker (uden personlig henvendelse)
  const hasSystem = SYSTEM_TRANSACTION_MARKERS.some((m) => subject.includes(m) || body.includes(m))
  if (hasSystem) return { match: true, rule: 'system/transaction marker' }

  return { match: false, rule: '' }
}

async function main() {
  console.log('\n=== AUDIT: NY AI-PROMPT (heuristisk simulation) ===\n')

  const { data, error } = await supabase
    .from('incoming_emails')
    .select('id, subject, sender_email, body_preview, link_status')
    .eq('is_archived', false)
    .order('received_at', { ascending: false })
    .limit(5000)
  if (error || !data) { console.error(error?.message); process.exit(1) }

  let total = 0
  let alreadyIgnored = 0
  let wouldNewLinked = 0
  let wouldNewUnidentified = 0
  let wouldNewIgnoredAlready = 0
  const linkedCandidates: { e: Email; rule: string }[] = []
  const unidentifiedSamples: { e: Email; rule: string }[] = []

  for (const e of data as Email[]) {
    total++
    const r = wouldBeNewsletter(e)
    if (!r.match) continue
    if (e.link_status === 'linked') {
      wouldNewLinked++
      linkedCandidates.push({ e, rule: r.rule })
    } else if (e.link_status === 'unidentified') {
      wouldNewUnidentified++
      if (unidentifiedSamples.length < 8) unidentifiedSamples.push({ e, rule: r.rule })
    } else if (e.link_status === 'ignored') {
      wouldNewIgnoredAlready++
    }
  }

  console.log(`Scannet ${total} mails`)
  console.log(`Allerede ignored der MATCHER ny regel:    ${wouldNewIgnoredAlready}`)
  console.log(`Unidentified der ville blive newsletter:  ${wouldNewUnidentified}`)
  console.log(`POTENTIELLE FALSE POSITIVES (linked):     ${wouldNewLinked}`)

  if (unidentifiedSamples.length > 0) {
    console.log('\nSample (unidentified → ville blive newsletter):')
    for (const s of unidentifiedSamples) {
      console.log(`  "${(s.e.subject || '').slice(0, 70)}" <${s.e.sender_email}> — ${s.rule}`)
    }
  }

  if (linkedCandidates.length > 0) {
    console.log('\n⚠️  FALSE POSITIVES (linked kunde-mails der ville blive newsletter):')
    for (const c of linkedCandidates) {
      console.log(`  "${(c.e.subject || '').slice(0, 70)}" <${c.e.sender_email}> — ${c.rule}`)
    }
    console.log('\n⚠️  Disse mails er i fare. Tjek dem manuelt foer commit.')
  } else {
    console.log('\n✓ Ingen false positives — alle 78 linked-mails er sikre.')
  }

  console.log('\nBemaerk: dette er heuristik. Den faktiske AI vil baade fange mere (kontekst-forstaaelse) og mindre (mere konservativ). Brug som indikator, ikke som facit.')
}

main().catch((e) => { console.error(e); process.exit(1) })
