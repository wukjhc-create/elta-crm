'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { MailRoute } from '@/lib/services/mail-routing'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import { BRAND } from '@/lib/brand'

/**
 * Sprint 9F Phase 6a — shadow-preview wrapper for besigtigelse.
 *
 * Read-only. Aldrig blokerende. Returnerer null hvis flag er off
 * eller preview fejler.
 */
async function maybeBuildBesigtigelseShadowMeta(
  customerId: string,
  serviceCaseId: string | null,
  actualRoute: MailRoute
): Promise<Record<string, unknown> | null> {
  try {
    const { isShadowLogEnabled, getBesigtigelseRoutePreview, buildShadowLogMeta } =
      await import('@/lib/actions/service-case-route-preview')
    if (!(await isShadowLogEnabled())) return null

    const preview = await getBesigtigelseRoutePreview(customerId, serviceCaseId, actualRoute)
    if (!preview) return null
    return buildShadowLogMeta(preview) as unknown as Record<string, unknown>
  } catch (err) {
    logger.warn('Besigtigelse shadow-log preview failed (non-fatal)', {
      error: err,
      entityId: customerId,
    })
    return null
  }
}

export interface BesigtigelsesNotatInput {
  customerId: string
  // Sprint 9H Phase A — forward-looking: hvis besigtigelse oprettes fra
  // en sag/ordre, persisteres service_case_id paa customer_documents.
  // Eksisterende kundekort-flow saetter ikke feltet (NULL) — Send-dialog
  // haandterer fallback med manuel sag-valg.
  serviceCaseId?: string | null
  formData: {
    tagType: string
    tagHaeldning: string
    tagAreal: string
    tagRetning: string
    tagStand: string
    skyggeforhold: string
    eltavleStatus: string
    eltavlePlads: string
    inverterPlacering: string
    kabelvej: string
    acKabelvej: string
    dcKabelvej: string
    internetSignal: string
    netvaerkSSID: string
    netvaerkPassword: string
    malerNr: string
    sikringsstoerrelse: string
    jordingStatus: string
    saerligeAftaler: string
    signatureData: string | null
    signerName: string
  }
  images: { category: string; base64: string; name: string }[]
  sendToCustomer?: boolean
}

/**
 * Save besigtigelsesrapport, upload images, generate PDF, store as customer document.
 * Auto-completes any besigtigelse customer_task for this customer.
 */
export async function saveBesigtigelsesnotat(
  input: BesigtigelsesNotatInput
): Promise<ActionResult<{ id: string; pdfUrl: string }>> {
  // Sprint 9G besigtigelse-diagnostik (midlertidig) — direkte console.error
  // saa output ikke gaar gennem logger.ts. Fjernes naar root-cause er fundet.
  console.error('[BESIGTIGELSE-DIAG] start', {
    customerId: input.customerId,
    sendToCustomer: !!input.sendToCustomer,
    imageCount: input.images?.length ?? 0,
  })

  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Fetch customer data for PDF
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', input.customerId)
      .single()

    if (custErr || !customer) {
      console.error('[BESIGTIGELSE-DIAG] customer fetch failed', {
        customerId: input.customerId,
        custErr,
        customerExists: !!customer,
      })
      return { success: false, error: 'Kunde ikke fundet' }
    }

    console.error('[BESIGTIGELSE-DIAG] customer fetched', {
      customerId: customer.id,
      customerEmail: customer.email,
      customerNumber: customer.customer_number,
    })

    const now = new Date()
    const dateStr = now.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
    const fileDate = now.toISOString().slice(0, 10)
    const title = `Besigtigelsesrapport — ${customer.company_name} — ${dateStr}`

    // Upload images to storage and collect URLs
    const imageUrls: { category: string; url: string; name: string }[] = []
    for (const img of input.images) {
      const ext = img.name.split('.').pop() || 'jpg'
      const imgFileName = `besigtigelse-${img.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const imgPath = `customer-documents/${input.customerId}/besigtigelse-images/${imgFileName}`

      // Convert base64 data URI to buffer
      const base64Data = img.base64.split(',')[1] || img.base64
      const imgBuffer = Buffer.from(base64Data, 'base64')

      const mimeType = img.base64.startsWith('data:') ? img.base64.split(';')[0].split(':')[1] : 'image/jpeg'

      const { error: imgUploadErr } = await supabase.storage
        .from('attachments')
        .upload(imgPath, imgBuffer, {
          contentType: mimeType,
          upsert: true,
        })

      if (!imgUploadErr) {
        const { data: imgUrlData } = await supabase.storage
          .from('attachments')
          .createSignedUrl(imgPath, 86400) // 24h for PDF generation

        if (imgUrlData?.signedUrl) {
          imageUrls.push({ category: img.category, url: imgUrlData.signedUrl, name: img.name })
        }
      }
    }

    // Build the notat JSON (stored in description for retrieval)
    const notatJson = JSON.stringify({ formData: input.formData, imageUrls })

    // Generate PDF via API route
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const baseUrl = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`

    console.error('[BESIGTIGELSE-DIAG] before PDF generation fetch', {
      baseUrl,
      endpoint: `${baseUrl}/api/besigtigelse/pdf`,
      customerId: input.customerId,
      hasNextPublicAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      hasVercelUrl: !!process.env.VERCEL_URL,
    })

    const pdfRes = await fetch(`${baseUrl}/api/besigtigelse/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        formData: input.formData,
        date: dateStr,
        images: input.images, // Pass base64 images directly to PDF
      }),
    })

    console.error('[BESIGTIGELSE-DIAG] PDF generation response', {
      status: pdfRes.status,
      ok: pdfRes.ok,
      contentType: pdfRes.headers.get('content-type'),
      contentLength: pdfRes.headers.get('content-length'),
    })

    if (!pdfRes.ok) {
      const errText = await pdfRes.text()
      console.error('[BESIGTIGELSE-DIAG] PDF generation failed', {
        status: pdfRes.status,
        errText: errText?.slice(0, 500),
      })
      logger.error('PDF generation failed', { error: errText })
      return { success: false, error: 'Kunne ikke generere PDF' }
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    const fileName = `besigtigelse-${customer.customer_number}-${fileDate}.pdf`
    const storagePath = `customer-documents/${input.customerId}/${fileName}`

    console.error('[BESIGTIGELSE-DIAG] PDF buffer built', {
      pdfBufferSize: pdfBuffer.length,
      fileName,
      storagePath,
    })

    console.error('[BESIGTIGELSE-DIAG] before Supabase upload', {
      bucket: 'attachments',
      storagePath,
      pdfBufferSize: pdfBuffer.length,
      contentType: 'application/pdf',
    })

    // Upload PDF to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      // Sprint 9G besigtigelse-diagnostik — struktureret log saa root-cause
      // kan bestemmes uden ny deploy. Bemaerk: uploadErr kan have flere
      // shapes afhaengigt af supabase-js version, derfor defensiv read.
      const errAny = uploadErr as unknown as {
        message?: string
        statusCode?: string | number
        error?: string
        name?: string
      }
      console.error('[BESIGTIGELSE-DIAG] PDF upload failed', {
        uploadErr,
        storagePath,
        bufferSize: pdfBuffer.length,
      })
      logger.error('PDF upload failed', {
        error: uploadErr,
        entity: 'customers',
        entityId: input.customerId,
        metadata: {
          bucket: 'attachments',
          storage_path: storagePath,
          pdf_buffer_size: pdfBuffer.length,
          err_message: errAny.message,
          err_status_code: errAny.statusCode,
          err_error: errAny.error,
          err_name: errAny.name,
        },
      })

      // Sprint 9G besigtigelse-diagnostik (midlertidig) — naar
      // BESIGTIGELSE_DEBUG_UPLOAD=1 er sat, returnér detaljeret fejl-
      // streng til UI/toast saa vi kan diagnosticere uden Vercel Logs.
      // Default: uaendret bruger-besked. Flaget fjernes naar root-cause
      // er fundet.
      const debugUpload = (process.env.BESIGTIGELSE_DEBUG_UPLOAD || '').toLowerCase().trim()
      if (debugUpload === '1' || debugUpload === 'true' || debugUpload === 'yes' || debugUpload === 'on') {
        const debugMsg = `Kunne ikke uploade PDF — ${errAny.message || errAny.error || 'ukendt fejl'} — status: ${errAny.statusCode ?? 'ukendt'} — size: ${pdfBuffer.length} — path: ${storagePath}`
        return { success: false, error: debugMsg }
      }
      return { success: false, error: 'Kunne ikke uploade PDF' }
    }

    console.error('[BESIGTIGELSE-DIAG] PDF upload success', {
      storagePath,
      bufferSize: pdfBuffer.length,
    })

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 3600)

    const pdfUrl = urlData?.signedUrl || ''

    // Save as customer document
    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .insert({
        customer_id: input.customerId,
        // Sprint 9H Phase A — service_case_id er nullable FK; saettes
        // kun naar caller leverer den (fx fra service-case-flow).
        service_case_id: input.serviceCaseId ?? null,
        title,
        description: notatJson,
        document_type: 'besigtigelse',
        file_url: pdfUrl,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: 'application/pdf',
        file_size: pdfBuffer.length,
        shared_by: userId,
      })
      .select('id')
      .single()

    if (docErr || !doc) {
      console.error('[BESIGTIGELSE-DIAG] document insert failed', {
        docErr,
        customerId: input.customerId,
      })
      logger.error('Document save failed', { error: docErr })
      return { success: false, error: 'Kunne ikke gemme dokument' }
    }

    console.error('[BESIGTIGELSE-DIAG] document insert success', {
      documentId: doc.id,
      storagePath,
    })

    // Auto-complete besigtigelse task for this customer
    try {
      const { data: tasks } = await supabase
        .from('customer_tasks')
        .select('id, title')
        .eq('customer_id', input.customerId)
        .neq('status', 'done')
        .ilike('title', '%esigtigelse%')

      if (tasks && tasks.length > 0) {
        await supabase
          .from('customer_tasks')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .in('id', tasks.map((t) => t.id))
      }
    } catch {
      // Non-critical — don't fail the whole operation
    }

    // Send to customer if requested
    if (input.sendToCustomer && customer.email) {
      try {
        await sendBesigtigelsePdf(doc.id, input.customerId)
      } catch {
        // PDF saved but email failed — still success
      }
    }

    revalidatePath(`/dashboard/customers/${input.customerId}`)
    return { success: true, data: { id: doc.id, pdfUrl } }
  } catch (error) {
    console.error('[BESIGTIGELSE-DIAG] outer catch', error)
    logger.error('Error in saveBesigtigelsesnotat', { error })
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

/**
 * Send besigtigelse PDF to customer via email.
 */
export async function sendBesigtigelsePdf(
  documentId: string,
  customerId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get document
    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) {
      return { success: false, error: 'Dokument ikke fundet' }
    }

    // Get customer
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('company_name, contact_person, email')
      .eq('id', customerId)
      .single()

    if (custErr || !customer || !customer.email) {
      return { success: false, error: 'Kunde-email ikke fundet' }
    }

    // Download PDF from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('attachments')
      .download(doc.storage_path)

    if (dlErr || !fileData) {
      return { success: false, error: 'Kunne ikke hente PDF' }
    }

    const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

    // Send email
    if (!isGraphConfigured()) {
      return { success: false, error: 'E-mail er ikke konfigureret (Microsoft Graph)' }
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${BRAND.green}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Besigtigelsesrapport</h1>
        </div>
        <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111827;">Kære ${customer.contact_person || customer.company_name},</p>
          <p style="color: #374151;">Vedhæftet finder du besigtigelsesrapporten fra vores besøg.</p>
          <p style="color: #374151;">Dokumentet indeholder de tekniske noter, billeder og aftaler, vi gennemgik under besigtigelsen.</p>
          <p style="color: #374151;">Har du spørgsmål, er du velkommen til at kontakte os.</p>
          <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>${BRAND.companyName}</strong><br/>
          <span style="color: #6b7280; font-size: 13px;">${BRAND.email} &bull; ${BRAND.website}</span></p>
        </div>
      </div>
    `

    // Sprint 8H Phase 4: central mail-router (besigtigelse-intent).
    // Da besigtigelses-rapporten sendes fra kundekortet uden specifik
    // sag, falder routen tilbage paa customer.email (paying_customer)
    // saa adfaerden bibeholdes.
    const { resolveBesigtigelseMailRoute, logMailRoute } = await import(
      '@/lib/actions/mail-route-resolvers'
    )
    const routeResult = await resolveBesigtigelseMailRoute(customerId)
    if (!routeResult.ok || !routeResult.route) {
      logger.error('Besigtigelse mail-route failed', {
        error: routeResult.error,
        entityId: customerId,
      })
      return { success: false, error: routeResult.error || 'Kunne ikke bygge mail-route' }
    }
    const route = routeResult.route

    const sendResult = await sendEmailViaGraph({
      to: route.toEmail,
      subject: `Besigtigelsesrapport — ${customer.company_name}`,
      html: emailHtml,
      attachments: [
        {
          filename: doc.file_name,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })
    // Sprint 9F Phase 6a — shadow-preview (read-only). Aldrig
    // blokerende: hvis flag er off eller preview fejler, fortsaetter
    // vi med tom shadow-meta.
    const shadowMeta = await maybeBuildBesigtigelseShadowMeta(customerId, null, route)

    await logMailRoute(
      route,
      sendResult.success ? 'sent' : 'failed',
      { document_id: documentId, error: sendResult.error, ...(shadowMeta || {}) }
    )

    return { success: sendResult.success, error: sendResult.error }
  } catch (error) {
    logger.error('Error in sendBesigtigelsePdf', { error })
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

// =====================================================
// Sprint 9H Phase A — Send eksisterende besigtigelsesrapport
// med sagspartner-aware modtagervalg.
// =====================================================

/**
 * Sagspartner-context for Send-dialog. Henter den sag der scope'es
 * (enten document.service_case_id eller bruger-valgt override) med alle
 * parti-customer + site_contact joins.
 */
export interface BesigtigelseCaseParty {
  customerId: string
  email: string | null
  name: string
  role: 'orderer' | 'end_customer' | 'payer' | 'site_customer' | 'site_contact' | 'document_customer'
  roleLabel: string
  contactId?: string | null
}

export interface BesigtigelseRecipientOptions {
  documentId: string
  documentCustomer: {
    id: string
    company_name: string
    email: string | null
  } | null
  serviceCase: {
    id: string
    case_number: string | null
    title: string | null
  } | null
  parties: BesigtigelseCaseParty[]
  warning?: string
}

const ROLE_LABEL: Record<BesigtigelseCaseParty['role'], string> = {
  orderer: 'Bestiller / ordregiver',
  end_customer: 'Anlægsejer / leveringskunde',
  payer: 'Betaler',
  site_customer: 'Leveringskunde',
  site_contact: 'Kontaktperson på stedet',
  document_customer: 'Kunde på dokument',
}

function partyEntry(
  role: BesigtigelseCaseParty['role'],
  customer: { id?: string | null; company_name?: string | null; email?: string | null } | null,
  contactId?: string | null,
): BesigtigelseCaseParty | null {
  if (!customer || !customer.id) return null
  return {
    customerId: customer.id,
    email: customer.email || null,
    name: customer.company_name || '—',
    role,
    roleLabel: ROLE_LABEL[role],
    contactId: contactId || null,
  }
}

function siteContactEntry(
  contact: { id?: string | null; name?: string | null; email?: string | null; customer_id?: string | null } | null,
): BesigtigelseCaseParty | null {
  if (!contact || !contact.id) return null
  return {
    customerId: contact.customer_id || '',
    email: contact.email || null,
    name: contact.name || 'Kontakt på stedet',
    role: 'site_contact',
    roleLabel: ROLE_LABEL.site_contact,
    contactId: contact.id,
  }
}

/**
 * List af kundens service_cases til dropdown i Send-dialog (kun
 * relevant naar dokumentet ikke har service_case_id).
 */
export async function listCustomerServiceCasesForBesigtigelse(
  customerId: string,
): Promise<ActionResult<{ id: string; case_number: string | null; title: string | null; status: string | null }[]>> {
  try {
    validateUUID(customerId, 'customerId')
    const { supabase } = await getAuthenticatedClient()
    const { data, error } = await supabase
      .from('service_cases')
      .select('id, case_number, title, status')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      logger.error('listCustomerServiceCasesForBesigtigelse failed', { error, entityId: customerId })
      return { success: false, error: 'Kunne ikke hente sager' }
    }
    return { success: true, data: (data || []) as { id: string; case_number: string | null; title: string | null; status: string | null }[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sager') }
  }
}

/**
 * Hent kandidat-modtagere til Send-dialog. Loader dokumentet, evt.
 * scope-sag + customer-joins for alle parti-roller, og bygger en
 * dedupliceret liste til UI.
 */
export async function getBesigtigelseRecipientOptions(
  documentId: string,
  serviceCaseIdOverride?: string | null,
): Promise<ActionResult<BesigtigelseRecipientOptions>> {
  try {
    validateUUID(documentId, 'documentId')
    if (serviceCaseIdOverride) validateUUID(serviceCaseIdOverride, 'serviceCaseIdOverride')

    const { supabase } = await getAuthenticatedClient()

    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .select('id, customer_id, service_case_id, document_type, title, file_name')
      .eq('id', documentId)
      .single()
    if (docErr || !doc) {
      return { success: false, error: 'Dokument ikke fundet' }
    }
    if (!isBesigtigelseDocument(doc.document_type, doc.title)) {
      return { success: false, error: 'Dokumentet er ikke en besigtigelsesrapport' }
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, company_name, email')
      .eq('id', doc.customer_id)
      .maybeSingle()

    const scopeServiceCaseId = serviceCaseIdOverride || doc.service_case_id || null
    let serviceCaseRow: {
      id: string
      case_number: string | null
      title: string | null
      customer_id: string | null
    } | null = null
    const parties: BesigtigelseCaseParty[] = []
    let warning: string | undefined

    if (scopeServiceCaseId) {
      const { data: sc } = await supabase
        .from('service_cases')
        .select(`
          id, case_number, title, customer_id,
          orderer_customer:customers!service_cases_orderer_customer_id_fkey(id, company_name, email),
          end_customer:customers!service_cases_end_customer_id_fkey(id, company_name, email),
          payer_customer:customers!service_cases_payer_customer_id_fkey(id, company_name, email),
          site_customer:customers!service_cases_site_customer_id_fkey(id, company_name, email),
          site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, name, email, customer_id)
        `)
        .eq('id', scopeServiceCaseId)
        .maybeSingle()

      if (sc) {
        serviceCaseRow = {
          id: sc.id,
          case_number: sc.case_number,
          title: sc.title,
          customer_id: sc.customer_id,
        }
        const pick = <T,>(v: T | T[] | null | undefined): T | null =>
          Array.isArray(v) ? (v[0] || null) : (v || null)

        const orderer = partyEntry('orderer', pick(sc.orderer_customer as never))
        const endCust = partyEntry('end_customer', pick(sc.end_customer as never))
        const payer = partyEntry('payer', pick(sc.payer_customer as never))
        const siteCust = partyEntry('site_customer', pick(sc.site_customer as never))
        const siteCont = siteContactEntry(pick(sc.site_contact as never))
        for (const p of [orderer, endCust, payer, siteCust, siteCont]) {
          if (p) parties.push(p)
        }
      } else {
        warning = 'Den valgte sag kunne ikke findes.'
      }
    } else {
      warning = 'Rapporten er ikke koblet til en sag, så systemet kan ikke automatisk skelne mellem betaler og leveringskunde.'
    }

    // Fallback: tilfoej altid document.customer som sidste kandidat.
    if (customer) {
      const docCust = partyEntry('document_customer', customer)
      if (docCust && !parties.some((p) => p.customerId === docCust.customerId)) {
        parties.push(docCust)
      }
    }

    // Dedup paa (customerId + contactId) — hvis en customer optraeder i
    // flere roller, beholdes foerste forekomst (orderer > end_customer
    // > payer > site_customer > site_contact > document_customer).
    const seen = new Set<string>()
    const dedup = parties.filter((p) => {
      const key = `${p.customerId}:${p.contactId || ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      success: true,
      data: {
        documentId,
        documentCustomer: customer || null,
        serviceCase: serviceCaseRow
          ? { id: serviceCaseRow.id, case_number: serviceCaseRow.case_number, title: serviceCaseRow.title }
          : null,
        parties: dedup,
        warning,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente modtagere') }
  }
}

function isBesigtigelseDocument(documentType: string, title: string): boolean {
  if (documentType === 'besigtigelse') return true
  if (documentType === 'other' && typeof title === 'string' && title.toLowerCase().includes('besigtigelse')) return true
  return false
}

type SendRecipientType = 'customer' | 'contact' | 'manual'

export interface SendBesigtigelseRecipientInput {
  type: SendRecipientType
  customerId?: string | null
  contactId?: string | null
  email?: string | null
  roleLabel?: BesigtigelseCaseParty['role'] | 'manual'
}

export interface SendExistingBesigtigelseInput {
  documentId: string
  recipients: SendBesigtigelseRecipientInput[]
  serviceCaseIdOverride?: string | null
  message?: string | null
}

const RECIPIENT_ROLE_MAP: Record<BesigtigelseCaseParty['role'] | 'manual', { role: 'paying_customer' | 'site_customer' | 'site_contact' | 'ordering_contact' | 'manual'; intro: string }> = {
  orderer: {
    role: 'ordering_contact',
    intro: 'Du modtager besigtigelsesrapporten, fordi du står som bestiller/ordregiver på sagen.',
  },
  payer: {
    role: 'paying_customer',
    intro: 'Du modtager besigtigelsesrapporten, fordi du står som betaler på sagen.',
  },
  end_customer: {
    role: 'site_customer',
    intro: 'Du modtager besigtigelsesrapporten, fordi besigtigelsen vedrører anlægget/adressen hos dig.',
  },
  site_customer: {
    role: 'site_customer',
    intro: 'Du modtager besigtigelsesrapporten, fordi besigtigelsen vedrører anlægget/adressen hos dig.',
  },
  site_contact: {
    role: 'site_contact',
    intro: 'Du modtager besigtigelsesrapporten som kontaktperson på stedet.',
  },
  document_customer: {
    role: 'paying_customer',
    intro: 'Du modtager besigtigelsesrapporten som kunde paa sagen.',
  },
  manual: {
    role: 'manual',
    intro: 'Du modtager rapporten efter aftale.',
  },
}

/**
 * Send eksisterende besigtigelsesrapport-PDF til en eller flere
 * modtagere. PDF re-bruges fra Supabase Storage — re-genereres ALDRIG.
 *
 * En separat mail sendes per modtager (bedre audit, ingen leak af
 * andre modtageres email til hinanden).
 *
 * Sikkerhed:
 *  - Validerer document_type + title — kun besigtigelsesrapporter
 *  - Whitelist: modtager skal vaere document.customer, en sagspartner
 *    paa scope-sagen, en kontakt paa scope-sagen, ELLER en valid
 *    ekstern manuel email. Vilkaarlige customer-IDs afvises.
 *  - assertExternalRecipient blokerer interne @eltasolar.dk-modtagere
 *  - Bucket forbliver private (storage download via service-side client)
 */
export async function sendExistingBesigtigelsesreport(
  input: SendExistingBesigtigelseInput,
): Promise<ActionResult<{ sent: number; failed: number; errors: string[] }>> {
  try {
    validateUUID(input.documentId, 'documentId')
    if (input.serviceCaseIdOverride) validateUUID(input.serviceCaseIdOverride, 'serviceCaseIdOverride')
    if (!input.recipients || input.recipients.length === 0) {
      return { success: false, error: 'Ingen modtagere valgt' }
    }

    const { supabase } = await getAuthenticatedClient()

    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .select('id, customer_id, service_case_id, document_type, title, file_name, storage_path')
      .eq('id', input.documentId)
      .single()
    if (docErr || !doc) {
      return { success: false, error: 'Dokument ikke fundet' }
    }
    if (!isBesigtigelseDocument(doc.document_type, doc.title)) {
      return { success: false, error: 'Dokumentet er ikke en besigtigelsesrapport' }
    }
    if (!doc.storage_path) {
      return { success: false, error: 'Dokumentet mangler storage path' }
    }

    const { data: docCustomer } = await supabase
      .from('customers')
      .select('id, company_name, contact_person, email')
      .eq('id', doc.customer_id)
      .maybeSingle()
    if (!docCustomer) {
      return { success: false, error: 'Kunde paa dokumentet ikke fundet' }
    }

    // Build allowed sets fra scope-sagen (hvis nogen).
    const scopeServiceCaseId = input.serviceCaseIdOverride || doc.service_case_id || null
    const allowedCustomerIds = new Set<string>([docCustomer.id])
    const allowedContactIds = new Set<string>()
    let scopeServiceCase: {
      id: string
      case_number: string | null
      site_contact_customer_id: string | null
    } | null = null

    if (scopeServiceCaseId) {
      const { data: sc } = await supabase
        .from('service_cases')
        .select(`
          id, case_number, customer_id,
          orderer_customer_id, end_customer_id, payer_customer_id, site_customer_id,
          site_contact:customer_contacts!service_cases_site_contact_id_fkey(id, customer_id)
        `)
        .eq('id', scopeServiceCaseId)
        .maybeSingle()
      if (!sc) {
        return { success: false, error: 'Den valgte sag findes ikke' }
      }
      // Validér at sagens kunde matcher dokumentets kunde (eller en
      // af parti-rollerne) — modarbejder lateral movement til andre
      // kunders sager.
      const partyCustomerIds = [
        sc.customer_id,
        sc.orderer_customer_id,
        sc.end_customer_id,
        sc.payer_customer_id,
        sc.site_customer_id,
      ].filter((v): v is string => !!v)
      if (!partyCustomerIds.includes(docCustomer.id)) {
        return { success: false, error: 'Den valgte sag tilhører ikke dokumentets kunde' }
      }
      for (const cid of partyCustomerIds) allowedCustomerIds.add(cid)
      const siteContactRaw = sc.site_contact as unknown
      const siteContact = Array.isArray(siteContactRaw) ? siteContactRaw[0] : siteContactRaw
      if (siteContact && (siteContact as { id?: string }).id) {
        allowedContactIds.add((siteContact as { id: string }).id)
      }
      scopeServiceCase = {
        id: sc.id,
        case_number: sc.case_number,
        site_contact_customer_id: siteContact ? ((siteContact as { customer_id?: string }).customer_id || null) : null,
      }
    }

    // Hent eventuelle email/navn for hver authorized customer (én rundtur)
    const customerLookup = new Map<string, { id: string; company_name: string | null; email: string | null }>()
    const contactLookup = new Map<string, { id: string; name: string | null; email: string | null; customer_id: string | null }>()
    if (allowedCustomerIds.size > 1) {
      const { data: cs } = await supabase
        .from('customers')
        .select('id, company_name, email')
        .in('id', Array.from(allowedCustomerIds))
      for (const c of cs || []) customerLookup.set(c.id, c)
    } else {
      customerLookup.set(docCustomer.id, { id: docCustomer.id, company_name: docCustomer.company_name, email: docCustomer.email })
    }
    if (allowedContactIds.size > 0) {
      const { data: cts } = await supabase
        .from('customer_contacts')
        .select('id, name, email, customer_id')
        .in('id', Array.from(allowedContactIds))
      for (const ct of cts || []) contactLookup.set(ct.id, ct)
    }

    // Download PDF én gang — bucket forbliver private.
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('attachments')
      .download(doc.storage_path)
    if (dlErr || !fileData) {
      logger.error('sendExistingBesigtigelsesreport: download failed', { error: dlErr, entityId: input.documentId })
      return { success: false, error: 'Kunne ikke hente PDF fra storage' }
    }
    const pdfBuffer = Buffer.from(await fileData.arrayBuffer())

    if (!isGraphConfigured()) {
      return { success: false, error: 'E-mail er ikke konfigureret (Microsoft Graph)' }
    }

    // Lazy import af mail-router dele
    const {
      defaultFromMailbox,
      normalizeEmail,
      isValidEmail,
      isInternalEmail,
      buildRouteReason,
    } = await import('@/lib/services/mail-routing')
    const { logMailRoute } = await import('@/lib/actions/mail-route-resolvers')
    const fromMailbox = defaultFromMailbox()

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const r of input.recipients) {
      try {
        let toEmail: string | null = null
        let toName: string | null = null
        let resolvedCustomerId: string | null = null
        let resolvedContactId: string | null = null
        const roleLabel: BesigtigelseCaseParty['role'] | 'manual' = r.roleLabel || (r.type === 'manual' ? 'manual' : 'document_customer')

        if (r.type === 'customer') {
          if (!r.customerId || !allowedCustomerIds.has(r.customerId)) {
            failed++
            errors.push(`Modtager afvist (ikke i tilladt set): customer ${r.customerId || '(tom)'}`)
            continue
          }
          const c = customerLookup.get(r.customerId)
          if (!c || !c.email) {
            failed++
            errors.push(`${ROLE_LABEL[roleLabel === 'manual' ? 'document_customer' : roleLabel]} mangler email`)
            continue
          }
          toEmail = normalizeEmail(c.email)
          toName = c.company_name
          resolvedCustomerId = c.id
        } else if (r.type === 'contact') {
          if (!r.contactId || !allowedContactIds.has(r.contactId)) {
            failed++
            errors.push(`Kontakt afvist (ikke i tilladt set): ${r.contactId || '(tom)'}`)
            continue
          }
          const ct = contactLookup.get(r.contactId)
          if (!ct || !ct.email) {
            failed++
            errors.push('Kontakt mangler email')
            continue
          }
          toEmail = normalizeEmail(ct.email)
          toName = ct.name
          resolvedContactId = ct.id
          resolvedCustomerId = ct.customer_id
        } else if (r.type === 'manual') {
          if (!r.email) {
            failed++
            errors.push('Manuel email mangler')
            continue
          }
          if (!isValidEmail(r.email)) {
            failed++
            errors.push(`Ugyldig manuel email: ${r.email}`)
            continue
          }
          if (isInternalEmail(r.email)) {
            failed++
            errors.push(`Manuel email afvist — intern domæne: ${r.email}`)
            continue
          }
          toEmail = normalizeEmail(r.email)
        } else {
          failed++
          errors.push('Ukendt modtager-type')
          continue
        }

        if (!toEmail) {
          failed++
          continue
        }

        const mapping = RECIPIENT_ROLE_MAP[roleLabel] || RECIPIENT_ROLE_MAP.document_customer
        const route: MailRoute = {
          fromMailbox,
          toEmail,
          toName,
          recipientRole: mapping.role,
          intent: 'besigtigelse',
          customerId: resolvedCustomerId || docCustomer.id,
          serviceCaseId: scopeServiceCaseId,
          customerContactId: resolvedContactId,
          reason: buildRouteReason('besigtigelse', mapping.role, {
            contactName: toName,
            caseNumber: scopeServiceCase?.case_number || null,
            payerName: docCustomer.company_name,
            manualNote: roleLabel,
          }),
          isInternalAllowed: false,
        }

        // Final intern-guard (kaster paa intern recipient)
        const { assertExternalRecipient } = await import('@/lib/services/mail-routing')
        assertExternalRecipient(route)

        const greeting = toName || docCustomer.contact_person || docCustomer.company_name || 'kunde'
        const introLine = mapping.intro
        const customMessageBlock = input.message
          ? `<p style="color: #374151; padding: 12px 16px; background: #fefce8; border-left: 3px solid #facc15; border-radius: 4px; margin-top: 16px;">${escapeHtml(input.message)}</p>`
          : ''
        const html = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${BRAND.green}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px;">Besigtigelsesrapport</h1>
            </div>
            <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; color: #111827;">Kære ${escapeHtml(greeting)},</p>
              <p style="color: #374151;">${escapeHtml(introLine)}</p>
              <p style="color: #374151;">Vedhæftet finder du besigtigelsesrapporten med de tekniske noter, billeder og aftaler, vi gennemgik under besigtigelsen.</p>
              ${customMessageBlock}
              <p style="color: #374151;">Har du spørgsmål, er du velkommen til at kontakte os.</p>
              <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>${BRAND.companyName}</strong><br/>
              <span style="color: #6b7280; font-size: 13px;">${BRAND.email} &bull; ${BRAND.website}</span></p>
            </div>
          </div>
        `
        const subject = `Besigtigelsesrapport — ${docCustomer.company_name || 'Elta Solar'}`

        const sendResult = await sendEmailViaGraph({
          to: route.toEmail,
          subject,
          html,
          attachments: [
            {
              filename: doc.file_name,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        })

        const shadowMeta = await maybeBuildBesigtigelseShadowMeta(
          resolvedCustomerId || docCustomer.id,
          scopeServiceCaseId,
          route,
        )

        await logMailRoute(route, sendResult.success ? 'sent' : 'failed', {
          document_id: input.documentId,
          role_label: roleLabel,
          recipient_type: r.type,
          error: sendResult.error,
          ...(shadowMeta || {}),
        })

        if (sendResult.success) {
          sent++
        } else {
          failed++
          errors.push(`${toEmail}: ${sendResult.error || 'send fejlede'}`)
        }
      } catch (perRecipientErr) {
        failed++
        errors.push(`Fejl: ${perRecipientErr instanceof Error ? perRecipientErr.message : 'ukendt'}`)
        logger.error('sendExistingBesigtigelsesreport per-recipient error', {
          error: perRecipientErr,
          entityId: input.documentId,
        })
      }
    }

    return { success: sent > 0, data: { sent, failed, errors } }
  } catch (err) {
    logger.error('sendExistingBesigtigelsesreport top-level error', { error: err })
    return { success: false, error: formatError(err, 'Kunne ikke sende besigtigelsesrapport') }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
