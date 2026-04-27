'use server'

/**
 * Server Action — Customer Flow Status
 *
 * Computes the 6-step flow status for a customer:
 * Lead → Besigtigelse → Rapport → Tilbud → Fuldmagt → Montage
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export type StepStatus = 'not_started' | 'awaiting' | 'done' | 'reminder_sent'

export interface FlowStep {
  key: string
  label: string
  status: StepStatus
  detail?: string
  linkTab?: 'oversigt' | 'besigtigelse' | 'dokumenter'
  date?: string | null
}

export interface CustomerFlowData {
  steps: FlowStep[]
  lastEmailDate?: string | null
  unreadEmailCount?: number
}

export async function getCustomerFlow(
  customerId: string,
  customerEmail: string
): Promise<CustomerFlowData> {
  const supabase = await createClient()

  try {
    // Fetch all data in parallel
    const emailLower = customerEmail.toLowerCase()
    const [leadsRes, tasksRes, docsRes, offersRes, projectsRes, emailsRes] = await Promise.all([
      supabase
        .from('leads')
        .select('id, status, created_at')
        .ilike('email', customerEmail)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('customer_tasks')
        .select('id, title, status, description, created_at, completed_at')
        .eq('customer_id', customerId)
        .ilike('title', '%esigtigelse%')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('customer_documents')
        .select('id, title, description, document_type, file_url, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('offers')
        .select('id, offer_number, status, sent_at, last_reminder_sent, reminder_count, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('projects')
        .select('id, status, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('incoming_emails')
        .select('id, is_read, received_at, sender_email')
        .eq('is_archived', false)
        .or(`sender_email.ilike.${emailLower},to_email.ilike.${emailLower}`)
        .order('received_at', { ascending: false })
        .limit(5),
    ])

    const leads = leadsRes.data || []
    const tasks = tasksRes.data || []
    const docs = docsRes.data || []
    const offers = offersRes.data || []
    const projects = projectsRes.data || []
    const recentEmails = emailsRes.data || []

    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    // ─── 1. LEAD ───
    const leadStep = computeLeadStep(leads)

    // ─── 2. BESIGTIGELSE ───
    const besigtigelseStep = computeBesigtigelseStep(tasks, threeDaysAgo)

    // ─── 3. RAPPORT ───
    const besigtigelseReports = docs.filter(
      (d) => d.document_type === 'other' && d.title?.includes('Besigtigelse')
    )
    const rapportStep = computeRapportStep(besigtigelseReports, tasks)

    // ─── 4. TILBUD ───
    const tilbudStep = computeTilbudStep(offers, threeDaysAgo)

    // ─── 5. FULDMAGT ───
    const fuldmagter = docs.filter((d) => {
      try {
        const desc = JSON.parse(d.description || '{}')
        return desc.type === 'fuldmagt'
      } catch { return false }
    })
    const fuldmagtStep = computeFuldmagtStep(fuldmagter, threeDaysAgo)

    // ─── 6. MONTAGE ───
    const montageStep = computeMontageStep(projects, offers)

    // Email stats
    const lastEmailDate = recentEmails.length > 0 ? recentEmails[0].received_at : null
    const unreadEmailCount = recentEmails.filter(
      (e) => !e.is_read && e.sender_email?.toLowerCase() === emailLower
    ).length

    return {
      steps: [leadStep, besigtigelseStep, rapportStep, tilbudStep, fuldmagtStep, montageStep],
      lastEmailDate,
      unreadEmailCount,
    }
  } catch (err) {
    logger.error('Failed to compute customer flow', { error: err, entityId: customerId })
    return {
      steps: [
        { key: 'lead', label: 'Lead', status: 'not_started' },
        { key: 'besigtigelse', label: 'Besigtigelse', status: 'not_started' },
        { key: 'rapport', label: 'Rapport', status: 'not_started' },
        { key: 'tilbud', label: 'Tilbud', status: 'not_started' },
        { key: 'fuldmagt', label: 'Fuldmagt', status: 'not_started' },
        { key: 'montage', label: 'Montage', status: 'not_started' },
      ],
    }
  }
}

function computeLeadStep(leads: { id: string; status: string; created_at: string }[]): FlowStep {
  if (leads.length === 0) {
    return { key: 'lead', label: 'Lead', status: 'not_started' }
  }
  const latest = leads[0]
  if (['converted', 'won'].includes(latest.status)) {
    return { key: 'lead', label: 'Lead', status: 'done', detail: 'Konverteret til kunde', date: latest.created_at }
  }
  if (['lost', 'rejected'].includes(latest.status)) {
    return { key: 'lead', label: 'Lead', status: 'done', detail: `Status: ${latest.status}`, date: latest.created_at }
  }
  return { key: 'lead', label: 'Lead', status: 'awaiting', detail: `Status: ${latest.status}`, date: latest.created_at }
}

function computeBesigtigelseStep(
  tasks: { id: string; status: string; description: string | null; created_at: string; completed_at: string | null }[],
  threeDaysAgo: Date
): FlowStep {
  if (tasks.length === 0) {
    return { key: 'besigtigelse', label: 'Besigtigelse', status: 'not_started', linkTab: 'besigtigelse' }
  }
  const latest = tasks[0]
  if (latest.status === 'completed' || latest.status === 'done') {
    return {
      key: 'besigtigelse', label: 'Besigtigelse', status: 'done',
      detail: 'Gennemført', date: latest.completed_at || latest.created_at, linkTab: 'besigtigelse',
    }
  }
  // Check if reminder was sent
  const descData = safeParseJSON(latest.description)
  if (descData.reminder_sent) {
    return {
      key: 'besigtigelse', label: 'Besigtigelse', status: 'reminder_sent',
      detail: 'Rykker sendt', date: latest.created_at, linkTab: 'besigtigelse',
    }
  }
  // Check if older than 3 days
  if (new Date(latest.created_at) < threeDaysAgo) {
    return {
      key: 'besigtigelse', label: 'Besigtigelse', status: 'awaiting',
      detail: 'Afventer bekræftelse (3+ dage)', date: latest.created_at, linkTab: 'besigtigelse',
    }
  }
  return {
    key: 'besigtigelse', label: 'Besigtigelse', status: 'awaiting',
    detail: 'Afventer bekræftelse', date: latest.created_at, linkTab: 'besigtigelse',
  }
}

function computeRapportStep(
  reports: { id: string; file_url: string | null; created_at: string }[],
  tasks: { id: string; status: string }[]
): FlowStep {
  if (reports.length > 0 && reports[0].file_url) {
    return {
      key: 'rapport', label: 'Rapport', status: 'done',
      detail: 'Rapport klar', date: reports[0].created_at, linkTab: 'dokumenter',
    }
  }
  // If besigtigelse is done but no report yet
  const hasDoneBesigtigelse = tasks.some((t) => t.status === 'completed' || t.status === 'done')
  if (hasDoneBesigtigelse) {
    return {
      key: 'rapport', label: 'Rapport', status: 'awaiting',
      detail: 'Afventer rapport', linkTab: 'dokumenter',
    }
  }
  return { key: 'rapport', label: 'Rapport', status: 'not_started', linkTab: 'dokumenter' }
}

function computeTilbudStep(
  offers: { id: string; status: string; sent_at: string | null; last_reminder_sent: string | null; reminder_count: number | null; created_at: string }[],
  threeDaysAgo: Date
): FlowStep {
  if (offers.length === 0) {
    return { key: 'tilbud', label: 'Tilbud', status: 'not_started' }
  }
  const latest = offers[0]
  if (latest.status === 'accepted') {
    return { key: 'tilbud', label: 'Tilbud', status: 'done', detail: 'Accepteret', date: latest.created_at }
  }
  if (latest.status === 'rejected') {
    return { key: 'tilbud', label: 'Tilbud', status: 'done', detail: 'Afvist', date: latest.created_at }
  }
  // Sent but not accepted
  if (latest.sent_at) {
    if ((latest.reminder_count || 0) > 0) {
      return {
        key: 'tilbud', label: 'Tilbud', status: 'reminder_sent',
        detail: `Rykker sendt (${latest.reminder_count}x)`, date: latest.sent_at,
      }
    }
    if (new Date(latest.sent_at) < threeDaysAgo) {
      return {
        key: 'tilbud', label: 'Tilbud', status: 'awaiting',
        detail: 'Afventer svar (3+ dage)', date: latest.sent_at,
      }
    }
    return { key: 'tilbud', label: 'Tilbud', status: 'awaiting', detail: 'Sendt — afventer svar', date: latest.sent_at }
  }
  return { key: 'tilbud', label: 'Tilbud', status: 'awaiting', detail: 'Under udarbejdelse', date: latest.created_at }
}

function computeFuldmagtStep(
  fuldmagter: { id: string; description: string | null; created_at: string }[],
  threeDaysAgo: Date
): FlowStep {
  if (fuldmagter.length === 0) {
    return { key: 'fuldmagt', label: 'Fuldmagt', status: 'not_started', linkTab: 'dokumenter' }
  }
  const latest = fuldmagter[0]
  const desc = safeParseJSON(latest.description)

  if (desc.status === 'signed') {
    return {
      key: 'fuldmagt', label: 'Fuldmagt', status: 'done',
      detail: 'Underskrevet', date: (desc.signed_at as string) || latest.created_at, linkTab: 'dokumenter',
    }
  }
  if (desc.reminder_sent) {
    return {
      key: 'fuldmagt', label: 'Fuldmagt', status: 'reminder_sent',
      detail: 'Rykker sendt', date: latest.created_at, linkTab: 'dokumenter',
    }
  }
  if (new Date(latest.created_at) < threeDaysAgo) {
    return {
      key: 'fuldmagt', label: 'Fuldmagt', status: 'awaiting',
      detail: 'Afventer underskrift (3+ dage)', date: latest.created_at, linkTab: 'dokumenter',
    }
  }
  return {
    key: 'fuldmagt', label: 'Fuldmagt', status: 'awaiting',
    detail: 'Afventer underskrift', date: latest.created_at, linkTab: 'dokumenter',
  }
}

function computeMontageStep(
  projects: { id: string; status: string; created_at: string }[],
  offers: { id: string; status: string }[]
): FlowStep {
  if (projects.length > 0) {
    const latest = projects[0]
    if (['completed', 'done', 'finished'].includes(latest.status)) {
      return { key: 'montage', label: 'Montage', status: 'done', detail: 'Afsluttet', date: latest.created_at }
    }
    if (['in_progress', 'active', 'started'].includes(latest.status)) {
      return { key: 'montage', label: 'Montage', status: 'awaiting', detail: 'I gang', date: latest.created_at }
    }
    return { key: 'montage', label: 'Montage', status: 'awaiting', detail: `Status: ${latest.status}`, date: latest.created_at }
  }
  // If at least one offer is accepted, montage is next
  const hasAccepted = offers.some((o) => o.status === 'accepted')
  if (hasAccepted) {
    return { key: 'montage', label: 'Montage', status: 'awaiting', detail: 'Klar til planlægning' }
  }
  return { key: 'montage', label: 'Montage', status: 'not_started' }
}

function safeParseJSON(str: string | null): Record<string, unknown> {
  try { return JSON.parse(str || '{}') } catch { return {} }
}
