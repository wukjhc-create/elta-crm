/**
 * Read-only audit: koer det NYE noise-filter mod alle eksisterende
 * incoming_emails for at se hvor mange flere der ville blive markeret
 * som ignored og hvilke. Roerer INTET.
 *
 * Koer: npx tsx scripts/audit-mail-noise.ts
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

// ---- Mirror af filtret fra email-intelligence.ts ----
const IGNORE_DOMAIN_SUFFIXES = [
  'instagram.com', 'facebook.com', 'facebookmail.com', 'meta.com',
  'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'snapchat.com',
  'pinterest.com', 'reddit.com', 'formsubmit.co',
  'mailchimp.com', 'mailchimpapp.com', 'sendgrid.net', 'mailerlite.com',
  'klaviyo.com', 'klaviyo-mail.com', 'convertkit.com', 'substack.com',
  'mailerlite-mail.com', 'mailgun.org', 'github.com', 'notion.so',
  'slack.com', 'zoom.us', 'atlassian.com', 'asana.com', 'trello.com',
  'monday.com', 'tldr.tech', 'beehiiv.com', 'buttondown.email',
]

const IGNORE_SENDER_SUBSTRINGS = [
  'no-reply', 'noreply', 'do-not-reply', 'donotreply', 'mailer-daemon',
  'postmaster@', 'bounce@', 'bounces@', 'notifications@', 'notification@',
  'alerts@', 'submissions@', 'newsletter@', 'newsletters@', 'marketing@',
  'marketing-', 'kampagne-', 'nyhedsbrev@', 'nyhedsbrev-', 'broadcast@',
  'email-broadcast', 'unsubscribe-', 'reply.facebookmail.com',
  'reply.linkedin.com',
]

const IGNORE_SUBJECT_KEYWORDS = [
  'activate', 'aktivér', 'aktiver', 'verify', 'verifikation',
  'verifikationskode', 'confirm', 'bekræft', 'notification',
  'notifikation', 'welcome', 'velkommen', 'reset password',
  'nulstil adgangskode', 'password reset', 'unsubscribe', 'afmeld',
  'undelivered mail', 'mail delivery failed', 'out of office',
  'fraværende', 'fravær', 'nyhedsbrev', 'kampagne', 'marketing',
  'follow us on', 'følg os på',
]

function isIgnoredDomain(domain: string): boolean {
  if (!domain) return false
  const d = domain.toLowerCase().trim()
  for (const suffix of IGNORE_DOMAIN_SUFFIXES) {
    if (d === suffix) return true
    if (d.endsWith('.' + suffix)) return true
  }
  return false
}

function getPriorityDomains(): string[] {
  const raw = (process.env.MAIL_PRIORITY_DOMAINS || '').trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
}

function isPrioritySender(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.toLowerCase().split('@')[1] || ''
  if (!domain) return false
  for (const allow of getPriorityDomains()) {
    if (domain === allow) return true
    if (domain.endsWith('.' + allow)) return true
  }
  return false
}

interface Email {
  id: string
  subject: string | null
  sender_email: string | null
  sender_name: string | null
  link_status: string
  received_at: string
}

function classifyWithNewFilter(e: Email): { newStatus: 'ignored' | 'unchanged'; reason: string | null } {
  const senderEmail = (e.sender_email || '').toLowerCase()
  const senderDomain = senderEmail.split('@')[1] || ''
  const subject = (e.subject || '').toLowerCase()

  if (isPrioritySender(senderEmail)) {
    return { newStatus: 'unchanged', reason: 'priority sender (allowlist)' }
  }
  if (isIgnoredDomain(senderDomain)) {
    return { newStatus: 'ignored', reason: `domain suffix-match: ${senderDomain}` }
  }
  const substr = IGNORE_SENDER_SUBSTRINGS.find((s) => senderEmail.includes(s))
  if (substr) {
    return { newStatus: 'ignored', reason: `sender substring: ${substr}` }
  }
  const subj = IGNORE_SUBJECT_KEYWORDS.find((kw) => subject.includes(kw))
  if (subj) {
    return { newStatus: 'ignored', reason: `subject keyword: ${subj}` }
  }
  return { newStatus: 'unchanged', reason: null }
}

async function main() {
  console.log('\n=== AUDIT: NYT NOISE-FILTER ===')
  console.log('Priority domains:', getPriorityDomains())
  console.log('(set MAIL_PRIORITY_DOMAINS i .env.local for at teste allowlist)\n')

  const { data, error } = await supabase
    .from('incoming_emails')
    .select('id, subject, sender_email, sender_name, link_status, received_at')
    .eq('is_archived', false)
    .order('received_at', { ascending: false })
    .limit(5000)

  if (error || !data) { console.error('Query failed:', error?.message); process.exit(1) }

  console.log(`Total ikke-arkiverede mails: ${data.length}`)
  const byStatus = new Map<string, number>()
  for (const e of data) byStatus.set(e.link_status, (byStatus.get(e.link_status) ?? 0) + 1)
  console.log('Nuvaerende fordeling:', Object.fromEntries(byStatus))
  console.log()

  let newlyIgnored = 0
  let alreadyIgnored = 0
  let falsePositiveCandidates = 0
  const samples: { email: Email; reason: string }[] = []
  const candidates: Email[] = []

  for (const e of data as Email[]) {
    const result = classifyWithNewFilter(e)
    if (result.newStatus === 'ignored') {
      if (e.link_status === 'ignored') {
        alreadyIgnored++
      } else if (e.link_status === 'linked') {
        // VARSKO: var koblet til kunde, men ville nu blive ignored
        falsePositiveCandidates++
        candidates.push(e)
      } else {
        newlyIgnored++
        if (samples.length < 20) samples.push({ email: e, reason: result.reason || '' })
      }
    }
  }

  console.log('--- Resultat ---')
  console.log(`Allerede ignored der STADIG matcher: ${alreadyIgnored}`)
  console.log(`Ekstra mails der ville blive ignored (var pending/unidentified): ${newlyIgnored}`)
  console.log(`POTENTIELLE FALSE POSITIVES (var linked, ville blive ignored): ${falsePositiveCandidates}`)

  if (samples.length > 0) {
    console.log('\nSample (ekstra ignored):')
    for (const s of samples) {
      console.log(`  [${s.email.link_status}] "${(s.email.subject || '').slice(0, 60)}" <${s.email.sender_email}> — ${s.reason}`)
    }
  }

  if (candidates.length > 0) {
    console.log('\n⚠️  FALSE POSITIVES (var linked, ville blive ignored):')
    for (const e of candidates) {
      console.log(`  [linked] "${(e.subject || '').slice(0, 60)}" <${e.sender_email}>`)
    }
  } else {
    console.log('\n✓ Ingen false positives — alle linked mails forbliver linked')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
