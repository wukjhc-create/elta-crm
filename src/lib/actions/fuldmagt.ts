'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'
import { BRAND } from '@/lib/brand'
import { APP_URL } from '@/lib/constants'

export interface FuldmagtData {
  id: string
  customer_id: string
  customer_name: string
  customer_address: string
  customer_postal_city: string
  order_number: string
  foedselsdato_cvr: string | null
  marketing_samtykke: boolean | null
  signature_data: string | null
  signer_name: string | null
  signed_at: string | null
  pdf_storage_path: string | null
  pdf_url: string | null
  status: 'pending' | 'signed'
  created_at: string
}

// ─── Employee: create fuldmagt request for a customer ───

export async function createFuldmagt(
  customerId: string,
  orderNumber: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (custErr || !customer) {
      return { success: false, error: 'Kunde ikke fundet' }
    }

    const address = customer.shipping_address || customer.billing_address || ''
    const postalCity = [
      customer.shipping_postal_code || customer.billing_postal_code,
      customer.shipping_city || customer.billing_city,
    ].filter(Boolean).join(' ')

    const { data: fuldmagt, error: insertErr } = await supabase
      .from('customer_documents')
      .insert({
        customer_id: customerId,
        title: `Fuldmagt — ${customer.company_name}`,
        description: JSON.stringify({
          type: 'fuldmagt',
          customer_name: customer.contact_person || customer.company_name,
          customer_address: address,
          customer_postal_city: postalCity,
          order_number: orderNumber,
          foedselsdato_cvr: null,
          marketing_samtykke: null,
          signature_data: null,
          signer_name: null,
          signed_at: null,
          status: 'pending',
        }),
        document_type: 'contract',
        file_url: '',
        storage_path: '',
        file_name: `fuldmagt-${customer.customer_number}.pdf`,
        mime_type: 'application/pdf',
        file_size: 0,
        shared_by: userId,
      })
      .select('id')
      .single()

    if (insertErr || !fuldmagt) {
      logger.error('Fuldmagt creation failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke oprette fuldmagt' }
    }

    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true, data: { id: fuldmagt.id } }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

// ─── Portal: get pending fuldmagter for customer ───

export async function getPortalFuldmagter(
  token: string
): Promise<ActionResult<FuldmagtData[]>> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Validate token and get customer
    const { data: tokenData, error: tokenErr } = await supabase
      .from('portal_access_tokens')
      .select('customer_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (tokenErr || !tokenData) {
      return { success: false, error: 'Ugyldig adgang' }
    }

    const { data: docs, error: docsErr } = await supabase
      .from('customer_documents')
      .select('*')
      .eq('customer_id', tokenData.customer_id)
      .eq('document_type', 'contract')
      .order('created_at', { ascending: false })

    if (docsErr) {
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    // Filter to fuldmagt documents that are pending
    const fuldmagter: FuldmagtData[] = (docs || [])
      .filter((doc) => {
        try {
          const desc = JSON.parse(doc.description || '{}')
          return desc.type === 'fuldmagt'
        } catch { return false }
      })
      .map((doc) => {
        const desc = JSON.parse(doc.description || '{}')
        return {
          id: doc.id,
          customer_id: doc.customer_id,
          customer_name: desc.customer_name || '',
          customer_address: desc.customer_address || '',
          customer_postal_city: desc.customer_postal_city || '',
          order_number: desc.order_number || '',
          foedselsdato_cvr: desc.foedselsdato_cvr || null,
          marketing_samtykke: desc.marketing_samtykke ?? null,
          signature_data: desc.signature_data || null,
          signer_name: desc.signer_name || null,
          signed_at: desc.signed_at || null,
          pdf_storage_path: doc.storage_path || null,
          pdf_url: doc.file_url || null,
          status: desc.status || 'pending',
          created_at: doc.created_at,
        }
      })

    return { success: true, data: fuldmagter }
  } catch (error) {
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}

// ─── Portal: submit signed fuldmagt ───

export async function submitSignedFuldmagt(
  token: string,
  documentId: string,
  input: {
    foedselsdato_cvr: string
    marketing_samtykke: boolean
    signature_data: string
    signer_name: string
  }
): Promise<ActionResult> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Validate token
    const { data: tokenData, error: tokenErr } = await supabase
      .from('portal_access_tokens')
      .select('customer_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (tokenErr || !tokenData) {
      return { success: false, error: 'Ugyldig adgang' }
    }

    // Get existing document
    const { data: doc, error: docErr } = await supabase
      .from('customer_documents')
      .select('*')
      .eq('id', documentId)
      .eq('customer_id', tokenData.customer_id)
      .single()

    if (docErr || !doc) {
      return { success: false, error: 'Dokument ikke fundet' }
    }

    const existingDesc = JSON.parse(doc.description || '{}')
    const now = new Date()
    const dateStr = now.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })

    // Update description with signed data
    const updatedDesc = {
      ...existingDesc,
      foedselsdato_cvr: input.foedselsdato_cvr,
      marketing_samtykke: input.marketing_samtykke,
      signature_data: input.signature_data,
      signer_name: input.signer_name,
      signed_at: now.toISOString(),
      status: 'signed',
    }

    // Generate PDF
    const appUrl = APP_URL || 'http://localhost:3000'
    const baseUrl = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`

    const pdfRes = await fetch(`${baseUrl}/api/fuldmagt/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: updatedDesc.customer_name,
        customer_address: updatedDesc.customer_address,
        customer_postal_city: updatedDesc.customer_postal_city,
        order_number: updatedDesc.order_number,
        foedselsdato_cvr: input.foedselsdato_cvr,
        marketing_samtykke: input.marketing_samtykke,
        signature_data: input.signature_data,
        signer_name: input.signer_name,
        date: dateStr,
      }),
    })

    if (!pdfRes.ok) {
      logger.error('Fuldmagt PDF generation failed', { error: await pdfRes.text() })
      return { success: false, error: 'Kunne ikke generere PDF' }
    }

    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    const fileDate = now.toISOString().slice(0, 10)
    const fileName = `fuldmagt-${fileDate}.pdf`
    const storagePath = `customer-documents/${tokenData.customer_id}/${fileName}`

    // Upload PDF
    const { error: uploadErr } = await supabase.storage
      .from('attachments')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      logger.error('Fuldmagt PDF upload failed', { error: uploadErr })
      return { success: false, error: 'Kunne ikke uploade PDF' }
    }

    const { data: urlData } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 86400 * 365) // 1 year

    const pdfUrl = urlData?.signedUrl || ''

    // Update document record
    await supabase
      .from('customer_documents')
      .update({
        description: JSON.stringify(updatedDesc),
        file_url: pdfUrl,
        storage_path: storagePath,
        file_name: fileName,
        file_size: pdfBuffer.length,
        updated_at: now.toISOString(),
      })
      .eq('id', documentId)

    // Create system alert for notification bell
    try {
      const { createSystemAlertAdmin } = await import('@/lib/actions/system-alerts-admin')
      await createSystemAlertAdmin({
        alert_type: 'fuldmagt_signed',
        severity: 'info',
        title: 'Fuldmagt underskrevet',
        message: `${input.signer_name} har underskrevet fuldmagten for ordre ${updatedDesc.order_number}.`,
        details: { customer_id: tokenData.customer_id, document_id: documentId, signer_name: input.signer_name },
        entity_type: 'customer',
        entity_id: tokenData.customer_id,
      })
    } catch {
      // Non-critical
    }

    // Notify admin via email
    try {
      if (isGraphConfigured()) {
        const adminEmail = process.env.GRAPH_MAILBOX || BRAND.email

        const emailHtml = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${BRAND.green}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 20px;">Fuldmagt underskrevet</h1>
            </div>
            <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; color: #111827;"><strong>${input.signer_name}</strong> har underskrevet fuldmagten.</p>
              <table style="margin: 16px 0; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Ordrenr:</td><td>${updatedDesc.order_number}</td></tr>
                <tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Fødselsdato/CVR:</td><td>${input.foedselsdato_cvr}</td></tr>
                <tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Marketing:</td><td>${input.marketing_samtykke ? 'Ja — billeder må bruges' : 'Nej'}</td></tr>
              </table>
              <p style="color: #374151;">PDF'en er gemt under kundens dokumenter i CRM.</p>
            </div>
          </div>
        `

        await sendEmailViaGraph({
          to: adminEmail,
          subject: `Fuldmagt underskrevet — ${updatedDesc.customer_name}`,
          html: emailHtml,
          attachments: [
            {
              filename: fileName,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        })
      }
    } catch {
      // Non-critical — fuldmagt is still saved
    }

    // Revalidate so Status & Flow updates
    revalidatePath(`/dashboard/customers/${tokenData.customer_id}`)

    return { success: true }
  } catch (error) {
    logger.error('Error in submitSignedFuldmagt', { error })
    return { success: false, error: formatError(error, 'Der opstod en fejl') }
  }
}
