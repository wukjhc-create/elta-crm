'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
} from '@/types/company-settings.types'
import type { ActionResult } from '@/types/common.types'
import { MAX_IMAGE_SIZE } from '@/lib/constants'
import type { Profile, UpdateProfileInput, TeamInvitation, NotificationPreferences } from '@/types/settings.types'
import { logger } from '@/lib/utils/logger'
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import { setProfileLoginActive } from '@/lib/auth/login-access'
import {
  parseInvoiceEmailConfig,
  type InvoiceEmailConfig,
} from '@/lib/email/invoice-email-config'
import {
  parsePaymentReportConfig,
  REPORT_EVENT_LABEL,
  REPORT_SKIP_REASON_LABEL,
  type PaymentReportConfig,
} from '@/lib/invoices/payment-report-config'

// Get company settings (singleton)
export async function getCompanySettings(): Promise<ActionResult<CompanySettings>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return { success: false, error: 'Manglende tilladelse: settings.view' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .maybeSingle()

    if (error) {
      logger.error('Error fetching company settings', { error: error })
      return { success: false, error: 'Kunne ikke hente virksomhedsindstillinger' }
    }

    if (!data) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    return { success: true, data: data as CompanySettings }
  } catch (error) {
    logger.error('Error in getCompanySettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update company settings
export async function updateCompanySettings(
  input: UpdateCompanySettingsInput
): Promise<ActionResult<CompanySettings>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    // Get existing settings ID (+ nuværende kostbasis til audit).
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, time_cost_basis, time_cost_rate')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Kunne ikke finde virksomhedsindstillinger' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .update(input)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      logger.error('Error updating company settings', { error: error })
      return { success: false, error: 'Kunne ikke opdatere virksomhedsindstillinger' }
    }

    // Sprint Ø2.11 — audit kostbasis-ændring (påvirker kun nye/ændrede timer).
    const basisChanged =
      input.time_cost_basis !== undefined && input.time_cost_basis !== existing.time_cost_basis
    const rateChanged =
      input.time_cost_rate !== undefined && Number(input.time_cost_rate) !== Number(existing.time_cost_rate)
    if (basisChanged || rateChanged) {
      try {
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'company_settings',
          entity_id: existing.id,
          entity_name: 'Timeøkonomi',
          action: 'time_cost_basis_changed',
          action_description: `Kostbasis ændret: ${existing.time_cost_basis ?? '—'} → ${input.time_cost_basis ?? existing.time_cost_basis}${rateChanged ? ` (standardkost ${existing.time_cost_rate ?? '—'} → ${input.time_cost_rate ?? '—'})` : ''}`,
          changes: {
            time_cost_basis: { from: existing.time_cost_basis, to: input.time_cost_basis ?? existing.time_cost_basis },
            time_cost_rate: { from: existing.time_cost_rate, to: input.time_cost_rate ?? existing.time_cost_rate },
          },
          metadata: { note: 'Påvirker kun nye/ændrede time_logs — ikke historiske snapshots.' },
        })
      } catch (e) {
        logger.error('audit time_cost_basis failed', { error: e })
      }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: data as CompanySettings }
  } catch (error) {
    logger.error('Error in updateCompanySettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Sprint Ø3.7 — Redigerbare faktura-/rykkertekster + afsender
// =====================================================

export async function getInvoiceEmailConfig(): Promise<ActionResult<InvoiceEmailConfig>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return { success: false, error: 'Manglende tilladelse: settings.view' }
    }
    const { data, error } = await supabase
      .from('company_settings')
      .select('invoice_email_config')
      .maybeSingle()
    if (error) {
      logger.error('getInvoiceEmailConfig failed', { error })
      return { success: false, error: 'Kunne ikke hente faktura-mailindstillinger' }
    }
    return { success: true, data: parseInvoiceEmailConfig(data?.invoice_email_config) }
  } catch (error) {
    logger.error('Error in getInvoiceEmailConfig', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updateInvoiceEmailConfig(
  input: InvoiceEmailConfig
): Promise<ActionResult<InvoiceEmailConfig>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id')
      .maybeSingle()
    if (!existing) {
      return { success: false, error: 'Kunne ikke finde virksomhedsindstillinger' }
    }

    // Saml til en ren config (kun kendte felter) før vi gemmer.
    const clean = parseInvoiceEmailConfig(input)
    const { error } = await supabase
      .from('company_settings')
      .update({ invoice_email_config: clean })
      .eq('id', existing.id)
    if (error) {
      logger.error('updateInvoiceEmailConfig failed', { error })
      return { success: false, error: 'Kunne ikke gemme faktura-mailindstillinger' }
    }

    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        entity_type: 'company_settings',
        entity_id: existing.id,
        entity_name: 'Faktura-/rykkertekster',
        action: 'invoice_email_config_updated',
        action_description: 'Faktura- og rykkertekster / afsenderidentitet opdateret',
        changes: {
          sender_name_set: !!clean.sender_name,
          reply_to_set: !!clean.reply_to,
          invoice_override: !!(clean.invoice?.subject || clean.invoice?.body),
          reminder1_override: !!(clean.reminder1?.subject || clean.reminder1?.body),
          reminder2_override: !!(clean.reminder2?.subject || clean.reminder2?.body),
          reminder3_override: !!(clean.reminder3?.subject || clean.reminder3?.body),
        },
        metadata: { note: 'Tomme felter falder tilbage til kodestandard-template.' },
      })
    } catch (e) {
      logger.error('audit invoice_email_config failed', { error: e })
    }

    revalidatePath('/dashboard/settings/invoice-email')
    return { success: true, data: clean }
  } catch (error) {
    logger.error('Error in updateInvoiceEmailConfig', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Sprint Ø3.8 — Send testmail af faktura-/rykkertekst
//
// Renderer MED SAMME produktions-renderere (build*Subject/Html + cfg) og
// sender til den indloggede bruger / testmodtager — ALDRIG kundens email.
// Ingen faktura-/rykker-mutationer, intet invoice_reminder_log. Subject
// markeres med [TEST]. Best-effort audit som test-event.
// =====================================================

export type InvoiceTestTemplate = 'invoice' | 'reminder1' | 'reminder2' | 'reminder3'

export interface SendInvoiceTestResult {
  ok: boolean
  message: string
}

const TEST_TEMPLATE_NAMES: Record<InvoiceTestTemplate, string> = {
  invoice: 'Faktura-mail',
  reminder1: 'Betalingspåmindelse niveau 1',
  reminder2: 'Betalingspåmindelse niveau 2',
  reminder3: 'Betalingspåmindelse niveau 3',
}

export async function sendInvoiceEmailTestAction(input: {
  template: InvoiceTestTemplate
  recipient?: string | null
}): Promise<SendInvoiceTestResult> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { ok: false, message: 'Manglende tilladelse: settings.manage' }
    }
    if (!TEST_TEMPLATE_NAMES[input.template]) {
      return { ok: false, message: 'Ukendt template' }
    }

    // Modtager: eksplicit testmodtager ELLER den indloggede brugers email.
    // ALDRIG kundens email.
    let recipient = (input.recipient ?? '').trim()
    if (!recipient) {
      const { data: me } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle()
      recipient = ((me?.email as string | null) ?? '').trim()
    }
    if (!recipient || !recipient.includes('@')) {
      return {
        ok: false,
        message: 'Angiv en gyldig modtager-email til testmailen (din egen email blev ikke fundet).',
      }
    }

    // Firmainfo + redigerbar config (samme kilde som produktion).
    const { data: companyRow } = await supabase
      .from('company_settings')
      .select('id, company_name, company_email, company_phone, invoice_email_config')
      .maybeSingle()
    const cfg = parseInvoiceEmailConfig(companyRow?.invoice_email_config)

    // Realistiske eksempeldata — kræver INGEN rigtig faktura.
    const company = {
      companyName: (companyRow?.company_name as string | null) ?? null,
      companyEmail: (companyRow?.company_email as string | null) ?? null,
      companyPhone: (companyRow?.company_phone as string | null) ?? null,
    }
    const base = {
      customerName: 'Jens Hansen',
      invoiceNumber: 'FAK-2026-0042',
      finalAmountFormatted: '24.500,00 kr.',
      dueDateFormatted: '27. juni 2026',
      paymentReference: '0042',
      caseNumber: 'SAG-1043',
      ...company,
    }

    // Render MED produktions-renderere.
    const {
      buildInvoiceEmailSubject,
      buildInvoiceEmailHtml,
    } = await import('@/lib/email/templates/invoice-email')
    const {
      buildInvoiceReminderSubject,
      buildInvoiceReminderHtml,
    } = await import('@/lib/email/templates/invoice-reminder-email')

    let subject: string
    let html: string
    if (input.template === 'invoice') {
      subject = buildInvoiceEmailSubject(base, cfg)
      html = buildInvoiceEmailHtml(base, cfg)
    } else {
      const level = (input.template === 'reminder1' ? 1 : input.template === 'reminder2' ? 2 : 3) as 1 | 2 | 3
      const rp = { ...base, daysOverdue: 8, level }
      subject = buildInvoiceReminderSubject(rp, cfg)
      html = buildInvoiceReminderHtml(rp, cfg)
    }
    const testSubject = `[TEST] ${subject}`

    const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
    if (!isGraphConfigured()) {
      return { ok: false, message: 'Mailafsendelse er ikke opsat korrekt endnu.' }
    }

    const senderName = cfg.sender_name?.trim() || undefined
    const replyTo = cfg.reply_to?.trim() || undefined
    const result = await sendEmailViaGraph({
      to: recipient,
      subject: testSubject,
      html,
      senderName,
      replyTo,
    })

    if (!result.success) {
      const raw = result.error ?? ''
      const human = raw.includes('modtager')
        ? 'Ugyldig modtager-email — tjek adressen og prøv igen.'
        : raw
          ? `Kunne ikke sende testmail: ${raw}`
          : 'Kunne ikke sende testmail. Tjek mailopsætningen og prøv igen.'
      return { ok: false, message: human }
    }

    // Best-effort audit som TEST-event (ingen faktura-mutationer).
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        entity_type: 'company_settings',
        entity_id: (companyRow?.id as string | null) ?? null,
        entity_name: TEST_TEMPLATE_NAMES[input.template],
        action: input.template === 'invoice' ? 'invoice_email_test_sent' : 'invoice_reminder_test_sent',
        action_description: `Testmail (${TEST_TEMPLATE_NAMES[input.template]}) sendt til ${recipient}`,
        changes: {},
        metadata: {
          template: input.template,
          recipient,
          subject: testSubject,
          sender_name: senderName ?? null,
          reply_to: replyTo ?? null,
          is_test: true,
        },
      })
    } catch (e) {
      logger.error('audit invoice email test failed', { error: e })
    }

    return {
      ok: true,
      message: `Testmail sendt til ${recipient}. Tjek indbakken og spamfilteret.`,
    }
  } catch (error) {
    logger.error('Error in sendInvoiceEmailTestAction', { error })
    return { ok: false, message: 'Der opstod en uventet fejl ved afsendelse af testmail.' }
  }
}

// =====================================================
// Sprint Ø5.0 — Planlagt betalingsrapport-mail (settings + testudsendelse)
// =====================================================

export async function getPaymentReportConfig(): Promise<ActionResult<PaymentReportConfig>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return { success: false, error: 'Manglende tilladelse: settings.view' }
    }
    const { data, error } = await supabase
      .from('company_settings')
      .select('payment_report_config')
      .maybeSingle()
    if (error) {
      logger.error('getPaymentReportConfig failed', { error })
      return { success: false, error: 'Kunne ikke hente rapportindstillinger' }
    }
    return { success: true, data: parsePaymentReportConfig(data?.payment_report_config) }
  } catch (error) {
    logger.error('Error in getPaymentReportConfig', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function updatePaymentReportConfig(
  input: PaymentReportConfig
): Promise<ActionResult<PaymentReportConfig>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }
    const { data: existing } = await supabase.from('company_settings').select('id').maybeSingle()
    if (!existing) {
      return { success: false, error: 'Kunne ikke finde virksomhedsindstillinger' }
    }
    const clean = parsePaymentReportConfig(input)
    const { error } = await supabase
      .from('company_settings')
      .update({ payment_report_config: clean })
      .eq('id', existing.id)
    if (error) {
      logger.error('updatePaymentReportConfig failed', { error })
      return { success: false, error: 'Kunne ikke gemme rapportindstillinger' }
    }
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        entity_type: 'company_settings',
        entity_id: existing.id,
        entity_name: 'Betalingsrapport',
        action: 'payment_report_config_updated',
        action_description: `Betalingsrapport ${clean.enabled ? 'aktiveret' : 'deaktiveret'} (filter: ${clean.filter}, ${clean.recipients.length} modtager(e))`,
        changes: {
          enabled: clean.enabled,
          filter: clean.filter,
          recipient_count: clean.recipients.length,
          skip_if_empty: clean.skip_if_empty,
        },
        metadata: { note: 'Cost-free — kun modtagere + filtervalg.' },
      })
    } catch (e) {
      logger.error('audit payment_report_config failed', { error: e })
    }
    revalidatePath('/dashboard/settings/invoice-email')
    return { success: true, data: clean }
  } catch (error) {
    logger.error('Error in updatePaymentReportConfig', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export interface PaymentReportHistoryEntry {
  id: string
  created_at: string
  action: string
  label: string
  description: string | null
  row_count: number | null
  recipient_count: number | null
  skip_reason_label: string | null
  format: string | null
}

export interface PaymentReportHistory {
  entries: PaymentReportHistoryEntry[]
  last_sent_at: string | null
  last_test_at: string | null
  last_skip_at: string | null
  last_skip_reason: string | null
}

const REPORT_HISTORY_ACTIONS = [
  'payment_report_sent',
  'payment_report_test_sent',
  'payment_report_skipped',
  'payment_report_config_updated',
]

export async function getPaymentReportHistoryAction(): Promise<ActionResult<PaymentReportHistory>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return { success: false, error: 'Manglende tilladelse: settings.view' }
    }
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, created_at, action, action_description, metadata')
      .in('action', REPORT_HISTORY_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) {
      logger.error('getPaymentReportHistoryAction failed', { error })
      return { success: false, error: 'Kunne ikke hente rapporthistorik' }
    }

    const list = data ?? []
    const entries: PaymentReportHistoryEntry[] = list.map((e) => {
      const md = (e.metadata ?? {}) as Record<string, unknown>
      const action = e.action as string
      const reason = typeof md.reason === 'string' ? md.reason : null
      return {
        id: e.id as string,
        created_at: e.created_at as string,
        action,
        label: REPORT_EVENT_LABEL[action] ?? action,
        description: (e.action_description as string | null) ?? null,
        row_count: typeof md.row_count === 'number' ? md.row_count : null,
        recipient_count: typeof md.recipient_count === 'number' ? md.recipient_count : null,
        skip_reason_label: reason ? REPORT_SKIP_REASON_LABEL[reason] ?? reason : null,
        format: typeof md.format === 'string' ? md.format : null,
      }
    })

    const findAt = (a: string) => entries.find((e) => e.action === a)?.created_at ?? null
    const lastSkip = entries.find((e) => e.action === 'payment_report_skipped')
    return {
      success: true,
      data: {
        entries,
        last_sent_at: findAt('payment_report_sent'),
        last_test_at: findAt('payment_report_test_sent'),
        last_skip_at: lastSkip?.created_at ?? null,
        last_skip_reason: lastSkip?.skip_reason_label ?? null,
      },
    }
  } catch (error) {
    logger.error('Error in getPaymentReportHistoryAction', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

export async function sendPaymentReportTestAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { ok: false, message: 'Manglende tilladelse: settings.manage' }
    }
    const { data } = await supabase
      .from('company_settings')
      .select('payment_report_config')
      .maybeSingle()
    const config = parsePaymentReportConfig(data?.payment_report_config)
    if (config.recipients.length === 0) {
      return { ok: false, message: 'Tilføj mindst én modtager-email før du sender en testrapport.' }
    }
    const { sendPaymentReport } = await import('@/lib/services/payment-report')
    // Testrapport: send altid (skipIfEmpty=false) så opsætningen kan verificeres.
    const res = await sendPaymentReport({
      trigger: 'test',
      recipients: config.recipients,
      filter: config.filter,
      skipIfEmpty: false,
      format: config.format,
      actorUserId: userId,
    })
    if (res.status === 'sent') {
      return { ok: true, message: `Testrapport sendt til ${res.recipients.join(', ')} (${res.row_count} kunde(r)).` }
    }
    if (res.status === 'failed' && res.reason === 'graph_not_configured') {
      return { ok: false, message: 'Mailafsendelse er ikke opsat korrekt endnu.' }
    }
    return { ok: false, message: `Testrapport kunne ikke sendes: ${res.reason ?? res.status}` }
  } catch (error) {
    logger.error('Error in sendPaymentReportTestAction', { error })
    return { ok: false, message: 'Der opstod en uventet fejl ved afsendelse af testrapport.' }
  }
}

// Get SMTP settings (for internal use only)
export async function getSmtpSettings(): Promise<ActionResult<{
  host: string | null
  port: number | null
  user: string | null
  password: string | null
  fromEmail: string | null
  fromName: string | null
}>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // SMTP-data inkluderer plaintext password — krav settings.manage (admin).
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name')
      .maybeSingle()

    if (error) {
      logger.error('Error fetching SMTP settings', { error: error })
      return { success: false, error: 'Kunne ikke hente SMTP indstillinger' }
    }

    if (!data) {
      return { success: false, error: 'SMTP indstillinger ikke konfigureret' }
    }

    return {
      success: true,
      data: {
        host: data.smtp_host,
        port: data.smtp_port,
        user: data.smtp_user,
        password: data.smtp_password,
        fromEmail: data.smtp_from_email,
        fromName: data.smtp_from_name,
      },
    }
  } catch (error) {
    logger.error('Error in getSmtpSettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Profile Actions
// ============================================

// Get current user's profile
export async function getProfile(): Promise<ActionResult<Profile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching profile', { error: error })
      return { success: false, error: 'Kunne ikke hente profil' }
    }

    if (!data) {
      return { success: false, error: 'Profil ikke fundet' }
    }

    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in getProfile', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update current user's profile
export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult<Profile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      logger.error('Error updating profile', { error: error })
      return { success: false, error: 'Kunne ikke opdatere profil' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in updateProfile', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Profile Avatar Actions
// ============================================

export async function uploadProfileAvatar(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Kun PNG, JPEG og WebP er tilladt' }
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'Profilbillede må maksimalt være 2 MB' }
    }

    // Delete old avatar if exists
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (currentProfile?.avatar_url) {
      const oldPath = currentProfile.avatar_url.split('/attachments/')[1]
      if (oldPath) {
        await supabase.storage.from('attachments').remove([oldPath])
      }
    }

    const ext = file.name.split('.').pop() || 'png'
    const filePath = `avatars/${userId}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      return { success: false, error: formatError(uploadError, 'Kunne ikke uploade billede') }
    }

    // Phase β.2.2: signed URL (1 år) i stedet for public. Consumer
    // bør refreshe via helper hvis URL'en udloeber.
    const signedUrl = await getStorageSignedUrlOrNull('attachments', filePath, SIGNED_URL_TTL.YEAR)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: signedUrl ?? '', updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      return { success: false, error: 'Kunne ikke gemme profilbillede' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: { url: signedUrl ?? '' } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Upload af profilbillede fejlede') }
  }
}

export async function deleteProfileAvatar(): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (currentProfile?.avatar_url) {
      const filePath = currentProfile.avatar_url.split('/attachments/')[1]
      if (filePath) {
        await supabase.storage.from('attachments').remove([filePath])
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      return { success: false, error: 'Kunne ikke fjerne profilbillede' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sletning af profilbillede fejlede') }
  }
}

// ============================================
// Company Logo Actions
// ============================================

export async function uploadCompanyLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Kun PNG, JPEG, WebP og SVG er tilladt' }
    }

    // Validate file size (2MB max for logos)
    if (file.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'Logo må maksimalt være 2 MB' }
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png'
    const fileName = `company-logo-${Date.now()}.${ext}`
    const filePath = `logos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      return { success: false, error: formatError(uploadError, 'Kunne ikke uploade logo') }
    }

    // Phase β.2.2: signed URL (1 år) i stedet for public.
    const signedUrl = await getStorageSignedUrlOrNull('attachments', filePath, SIGNED_URL_TTL.YEAR)
    const logoUrl = signedUrl ?? ''

    // Update company_settings
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    // Delete old logo file if exists
    if (existing.company_logo_url) {
      const oldPath = existing.company_logo_url.split('/attachments/')[1]
      if (oldPath) {
        await supabase.storage.from('attachments').remove([oldPath])
      }
    }

    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ company_logo_url: logoUrl })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: 'Kunne ikke gemme logo URL' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: { url: logoUrl } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Logo upload fejlede') }
  }
}

export async function deleteCompanyLogo(): Promise<ActionResult<void>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    // Delete file from storage
    if (existing.company_logo_url) {
      const filePath = existing.company_logo_url.split('/attachments/')[1]
      if (filePath) {
        await supabase.storage.from('attachments').remove([filePath])
      }
    }

    // Clear URL in settings
    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ company_logo_url: null })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: 'Kunne ikke fjerne logo' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sletning af logo fejlede') }
  }
}

// ============================================
// Security Actions
// ============================================

// Change password
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Supabase updateUser method for password change
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      logger.error('Error changing password', { error: error })
      if (error.message.includes('password')) {
        return { success: false, error: 'Adgangskoden opfylder ikke kravene' }
      }
      return { success: false, error: 'Kunne ikke ændre adgangskode' }
    }

    return { success: true, data: undefined }
  } catch (error) {
    logger.error('Error in changePassword', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Team Actions
// ============================================

// Get all team members
export async function getTeamMembers(): Promise<ActionResult<Profile[]>> {
  try {
    const { hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.view')) {
      return { success: false, error: 'Manglende tilladelse: users.view' }
    }

    // Sprint 7E fix — profiles RLS begraenser auth users til at se kun
    // egen profile. Brug admin-client (bypass RLS) for at vise alle
    // brugere i Brugerstyring. Service-role bruges KUN server-side.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('Error fetching team members', { error: error })
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    // Berig med auth.users.email naar profile.email er NULL.
    let authEmailMap = new Map<string, string>()
    try {
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 })
      authEmailMap = new Map(
        (users || []).map((u) => [u.id, u.email ?? ''] as const).filter((x) => x[1])
      )
    } catch {
      // ikke-kritisk
    }

    const enriched = (data ?? []).map((p) => ({
      ...p,
      email: (p.email as string | null) || authEmailMap.get(p.id as string) || null,
    }))

    return { success: true, data: enriched as Profile[] }
  } catch (error) {
    logger.error('Error in getTeamMembers', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update team member (admin only)
export async function updateTeamMember(
  memberId: string,
  input: { role?: string; department?: string; is_active?: boolean }
): Promise<ActionResult<Profile>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    // Sprint Ø2.2: is_active håndhæves via central helper (sætter flag OG
    // auth-ban) — ikke som et løst profil-felt. Resten (role/department)
    // opdateres normalt.
    if (input.is_active !== undefined) {
      const res = await setProfileLoginActive(memberId, input.is_active)
      if (!res.ok) {
        return { success: false, error: res.error ?? 'Kunne ikke ændre login-adgang' }
      }
    }

    const rest: { role?: string; department?: string } = {}
    if (input.role !== undefined) rest.role = input.role
    if (input.department !== undefined) rest.department = input.department

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...rest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single()

    if (error) {
      logger.error('Error updating team member', { error: error })
      return { success: false, error: 'Kunne ikke opdatere teammedlem' }
    }

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in updateTeamMember', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Team Invitations
// =====================================================

export async function inviteTeamMember(
  email: string,
  role: string = 'montør',
): Promise<ActionResult<{ email: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.create')) {
      return { success: false, error: 'Manglende tilladelse: users.create' }
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'Denne email er allerede registreret' }
    }

    // Check if there's already a pending invite
    const { data: pendingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingInvite) {
      return { success: false, error: 'Der er allerede en afventende invitation til denne email' }
    }

    // Send invite via Supabase Auth Admin
    const admin = createAdminClient()
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
      data: { role, invited_by: userId },
    })

    if (inviteError) {
      logger.error('Error inviting user', { error: inviteError })
      return { success: false, error: 'Kunne ikke sende invitation. Tjek at email er gyldig.' }
    }

    // Store invitation record
    await supabase.from('team_invitations').insert({
      email: email.toLowerCase(),
      role,
      invited_by: userId,
      status: 'pending',
    })

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: { email: email.toLowerCase() } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sende invitation') }
  }
}

export async function getTeamInvitations(): Promise<ActionResult<TeamInvitation[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.view')) {
      return { success: false, error: 'Manglende tilladelse: users.view' }
    }

    const { data, error } = await supabase
      .from('team_invitations')
      .select('*, inviter:profiles!invited_by(full_name)')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching invitations', { error: error })
      return { success: false, error: 'Kunne ikke hente invitationer' }
    }

    const invitations: TeamInvitation[] = (data || []).map((inv) => {
      const inviter = inv.inviter as unknown as { full_name: string | null } | null
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        invited_by: inv.invited_by,
        invited_by_name: inviter?.full_name || null,
        created_at: inv.created_at,
        status: inv.status,
      }
    })

    return { success: true, data: invitations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente invitationer') }
  }
}

export async function cancelInvitation(invitationId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    const { error } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId)

    if (error) {
      logger.error('Error canceling invitation', { error: error })
      return { success: false, error: 'Kunne ikke annullere invitation' }
    }

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke annullere invitation') }
  }
}

// ============================================
// Notification Preferences
// ============================================

export async function getNotificationPreferences(): Promise<ActionResult<NotificationPreferences>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      return { success: false, error: 'Kunne ikke hente notifikationspræferencer' }
    }

    if (!data) {
      return { success: false, error: 'Profil ikke fundet' }
    }

    return { success: true, data: (data.notification_preferences as NotificationPreferences) || {} }
  } catch (err) {
    return { success: false, error: formatError(err, 'Fejl ved hentning af notifikationer') }
  }
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('profiles')
      .update({
        notification_preferences: preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      return { success: false, error: 'Kunne ikke gemme notifikationspræferencer' }
    }

    revalidatePath('/dashboard/settings/notifications')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Fejl ved gemning af notifikationer') }
  }
}

export async function resendInvitation(invitationId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    // Get invitation
    const { data: invitation } = await supabase
      .from('team_invitations')
      .select('email, role')
      .eq('id', invitationId)
      .eq('status', 'pending')
      .maybeSingle()

    if (!invitation) {
      return { success: false, error: 'Invitation ikke fundet' }
    }

    // Resend via Supabase Auth Admin
    const admin = createAdminClient()
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
      data: { role: invitation.role, invited_by: userId },
    })

    if (inviteError) {
      logger.error('Error resending invitation', { error: inviteError })
      return { success: false, error: 'Kunne ikke gensende invitation' }
    }

    // Update timestamp
    await supabase
      .from('team_invitations')
      .update({ created_at: new Date().toISOString() })
      .eq('id', invitationId)

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gensende invitation') }
  }
}
