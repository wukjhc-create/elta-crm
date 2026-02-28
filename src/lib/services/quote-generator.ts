/**
 * Quote Generator Service — "Den Gyldne Knap"
 *
 * Bulletproof service: generates PDF, uploads to storage, sends email.
 * Database logging is OPTIONAL — the system always works even without tables.
 *
 * Fallback chain for quote numbers:
 * 1. Try DB sequence (ELS-YYYY-NNN)
 * 2. Fallback to timestamp-based (ELS-YYYY-MMDD-XXXX)
 *
 * Auto-shares to customer portal if customer has active portal session.
 */

import { createClient } from '@supabase/supabase-js'
import type { GenerateQuoteInput, GenerateQuoteResult } from '@/types/quote-templates.types'
import { getCompanySettings } from '@/lib/actions/settings'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { generateQuoteEmailHtml, generateQuoteEmailText } from '@/lib/email/templates/quote-email'
import { logger } from '@/lib/utils/logger'

// Service role client for storage + DB operations
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase configuration for quote generator')
  }
  return createClient(url, key)
}

// Calculate financials from line items
function calculateFinancials(input: GenerateQuoteInput) {
  const subtotal = input.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  )
  const discountAmount = subtotal * (input.discountPercentage / 100)
  const afterDiscount = subtotal - discountAmount
  const taxAmount = afterDiscount * (input.taxPercentage / 100)
  const total = afterDiscount + taxAmount

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  }
}

/**
 * Generate quote reference — NEVER fails.
 * Tries DB first, falls back to timestamp-based.
 */
async function generateQuoteReference(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `ELS-${year}-`

  try {
    // Try to get next number from existing quotes
    const { data: latest, error } = await supabase
      .from('sent_quotes')
      .select('quote_reference')
      .like('quote_reference', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error) {
      let nextNum = 1
      if (latest?.quote_reference) {
        const match = latest.quote_reference.match(/ELS-\d{4}-(\d+)/)
        if (match) {
          nextNum = parseInt(match[1], 10) + 1
        }
      }
      return `${prefix}${String(nextNum).padStart(3, '0')}`
    }
  } catch {
    // DB not available — use fallback
  }

  // Fallback: timestamp-based reference (always unique)
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ELS-${year}-${mmdd}-${rand}`
}

/**
 * Try to auto-create tables if they don't exist.
 * Calls the setup-db API endpoint internally.
 */
async function ensureTablesExist(): Promise<void> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await fetch(`${appUrl}/api/admin/setup-db`, {
      method: 'POST',
      headers: {
        'x-internal-call': 'true',
        'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
      },
    })
  } catch {
    // Non-critical — tables may already exist or setup may not be possible
  }
}

// Track whether we've attempted setup (once per process lifetime)
let setupAttempted = false

export async function generateAndSendQuote(
  input: GenerateQuoteInput,
  userId: string,
  incomingEmailId?: string
): Promise<GenerateQuoteResult> {
  const supabase = getServiceClient()

  // Auto-setup on first call
  if (!setupAttempted) {
    setupAttempted = true
    ensureTablesExist().catch(() => {})
  }

  try {
    // 1. Get company settings
    const settingsResult = await getCompanySettings()
    if (!settingsResult.success || !settingsResult.data) {
      return { success: false, pdfUrl: '', quoteReference: '', error: 'Kunne ikke hente virksomhedsindstillinger' }
    }
    const companySettings = settingsResult.data

    // 2. Calculate financials
    const financials = calculateFinancials(input)

    // 3. Generate quote reference (NEVER fails)
    const quoteReference = await generateQuoteReference(supabase)

    // 4. Calculate validity date
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + input.validityDays)

    // 5. Render PDF
    const { renderToBuffer } = await import('@react-pdf/renderer')
    let pdfDocument: React.ReactElement

    if (input.templateType === 'sales') {
      const { SalesOfferPdfDocument } = await import('@/lib/pdf/templates/sales-offer-pdf')
      pdfDocument = SalesOfferPdfDocument({
        quote: input,
        quoteReference,
        validUntil,
        financials,
        companySettings,
      }) as any
    } else {
      const { InstallationOfferPdfDocument } = await import('@/lib/pdf/templates/installation-offer-pdf')
      pdfDocument = InstallationOfferPdfDocument({
        quote: input,
        quoteReference,
        validUntil,
        financials,
        companySettings,
      }) as any
    }

    const pdfBuffer = await renderToBuffer(pdfDocument as any)

    // 6. Upload to Supabase Storage
    const year = new Date().getFullYear()
    const storagePath = `quotes/${year}/${quoteReference}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      logger.error('Failed to upload quote PDF', { error: uploadError })
      return { success: false, pdfUrl: '', quoteReference, error: 'Kunne ikke uploade PDF' }
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(storagePath)
    const pdfPublicUrl = urlData.publicUrl

    // 7. Send email with PDF via Microsoft Graph API (no SMTP needed)
    const templateLabel = input.templateType === 'sales' ? 'Salgstilbud' : 'Monteringstilbud'
    const emailSubject = `${templateLabel}: ${input.title} (${quoteReference})`

    const emailHtml = generateQuoteEmailHtml({
      quoteReference,
      title: input.title,
      customerName: input.customer.contactPerson,
      companyName: input.customer.companyName,
      total: financials.total,
      validUntil,
      companySettings,
      templateType: input.templateType,
    })

    let emailResult: { success: boolean; error?: string }

    if (!isGraphConfigured()) {
      logger.error('Microsoft Graph not configured — cannot send email')
      emailResult = { success: false, error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET.' }
    } else {
      emailResult = await sendEmailViaGraph({
        to: input.customer.email,
        subject: emailSubject,
        html: emailHtml,
        senderName: input.senderName,
        replyTo: companySettings.company_email || undefined,
        attachments: [
          {
            filename: `${quoteReference}.pdf`,
            content: Buffer.from(pdfBuffer),
            contentType: 'application/pdf',
          },
        ],
      })
    }

    if (!emailResult.success) {
      logger.error('Failed to send quote email via Graph', { error: emailResult.error })
    }

    // 9. Try to log in sent_quotes table (non-critical)
    let sentQuoteId: string | undefined
    try {
      const { data: insertedQuote, error: insertError } = await supabase
        .from('sent_quotes')
        .insert({
          quote_reference: quoteReference,
          template_type: input.templateType,
          customer_id: input.customerId || null,
          customer_email: input.customer.email,
          customer_name: input.customer.contactPerson,
          customer_company: input.customer.companyName,
          incoming_email_id: incomingEmailId || null,
          title: input.title,
          description: input.description || null,
          line_items: input.lineItems,
          solar_data: input.solarData || null,
          notes: input.notes || null,
          subtotal: financials.subtotal,
          discount_percentage: input.discountPercentage,
          discount_amount: financials.discountAmount,
          tax_percentage: input.taxPercentage,
          tax_amount: financials.taxAmount,
          total: financials.total,
          validity_days: input.validityDays,
          valid_until: validUntil.toISOString().split('T')[0],
          pdf_storage_path: storagePath,
          pdf_public_url: pdfPublicUrl,
          sent_by: userId,
          sender_name: input.senderName,
        })
        .select('id')
        .single()

      if (!insertError && insertedQuote) {
        sentQuoteId = insertedQuote.id
      } else {
        logger.warn('Could not log quote to sent_quotes (table may not exist)', { error: insertError })
      }
    } catch (dbErr) {
      logger.warn('sent_quotes table not available — skipping DB logging', { error: dbErr })
    }

    // 10. Auto-opret opfølgningsopgave (3 dages påmindelse)
    if (emailResult.success && input.customerId) {
      try {
        const reminderDate = new Date()
        reminderDate.setDate(reminderDate.getDate() + 3)

        await supabase.from('customer_tasks').insert({
          customer_id: input.customerId,
          offer_id: null,
          title: `Følg op: ${input.title} (${quoteReference}) — intet svar modtaget`,
          description: `Automatisk opfølgning oprettet ved afsendelse af tilbud ${quoteReference} til ${input.customer.email}.`,
          priority: 'normal',
          assigned_to: userId,
          reminder_at: reminderDate.toISOString(),
          created_by: userId,
        })
      } catch (taskErr) {
        logger.warn('Failed to create follow-up task for quote', { error: taskErr })
      }
    }

    // 11. Auto-share to portal + chat notification (non-critical)
    if (input.customerId) {
      autoShareToPortal(supabase, {
        customerId: input.customerId,
        sentQuoteId,
        quoteReference,
        title: input.title,
        pdfPublicUrl,
        storagePath,
        total: financials.total,
        senderName: input.senderName,
        userId,
      }).catch((err) => {
        logger.warn('Portal auto-share failed (non-critical)', { error: err })
      })
    }

    return {
      success: emailResult.success,
      pdfUrl: pdfPublicUrl,
      quoteReference,
      sentQuoteId,
      error: emailResult.success ? undefined : emailResult.error,
    }
  } catch (error) {
    logger.error('Quote generation failed', { error })
    return {
      success: false,
      pdfUrl: '',
      quoteReference: '',
      error: error instanceof Error ? error.message : 'Ukendt fejl ved tilbudsgenerering',
    }
  }
}

/**
 * Auto-share quote PDF to customer portal and send chat notification.
 * Completely non-critical — errors never block the main flow.
 */
async function autoShareToPortal(
  supabase: ReturnType<typeof getServiceClient>,
  params: {
    customerId: string
    sentQuoteId?: string
    quoteReference: string
    title: string
    pdfPublicUrl: string
    storagePath: string
    total: number
    senderName: string
    userId: string
  }
) {
  // Check if customer has an active portal
  const { data: portalToken } = await supabase
    .from('portal_access_tokens')
    .select('id')
    .eq('customer_id', params.customerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!portalToken) return

  // 1. Try to share PDF to customer_documents
  try {
    await supabase.from('customer_documents').insert({
      customer_id: params.customerId,
      title: params.title,
      description: `Tilbud ${params.quoteReference}`,
      document_type: 'quote',
      file_url: params.pdfPublicUrl,
      storage_path: params.storagePath,
      file_name: `${params.quoteReference}.pdf`,
      mime_type: 'application/pdf',
      sent_quote_id: params.sentQuoteId || null,
      shared_by: params.userId,
    })
  } catch {
    // customer_documents table may not exist — skip
  }

  // 2. Send portal chat notification
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', params.userId)
      .maybeSingle()

    const totalFormatted = new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
    }).format(params.total)

    await supabase.from('portal_messages').insert({
      customer_id: params.customerId,
      sender_type: 'employee',
      sender_id: params.userId,
      sender_name: profile?.full_name || params.senderName,
      message: `📄 Nyt tilbud: ${params.title} (${params.quoteReference})\nBeløb: ${totalFormatted}\n\nPDF'en er tilgængelig under Dokumenter.`,
      attachments: [],
    })
  } catch {
    // portal_messages insert failed — skip
  }
}
