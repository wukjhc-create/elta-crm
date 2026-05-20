'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { MailRoute } from '@/lib/services/mail-routing'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'
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
        title,
        description: notatJson,
        document_type: 'other',
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
