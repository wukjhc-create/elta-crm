'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { createAnonClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import type {
  ServiceCase,
  ServiceCaseWithRelations,
  ServiceCaseAttachment,
  ServiceCaseStatus,
  ServiceCasePriority,
  ServiceCaseSource,
  ChecklistItem,
} from '@/types/service-cases.types'
import { DEFAULT_CHECKLIST } from '@/types/service-cases.types'

const PAGE_SIZE = 25

// =====================================================
// List / Get
// =====================================================

export async function getServiceCases(filters?: {
  search?: string
  status?: ServiceCaseStatus
  priority?: ServiceCasePriority
  page?: number
  pageSize?: number
}): Promise<ActionResult<PaginatedResponse<ServiceCaseWithRelations>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || PAGE_SIZE
    const offset = (page - 1) * pageSize

    let query = supabase
      .from('service_cases')
      .select(`
        *,
        customer:customers!left(id, company_name, contact_person, email, phone),
        assignee:profiles!service_cases_assigned_to_fkey(id, full_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority)
    }
    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,case_number.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      logger.error('Error fetching service cases', { error })
      return { success: false, error: 'Kunne ikke hente serviceopgaver' }
    }

    const total = count || 0
    return {
      success: true,
      data: {
        data: (data || []) as ServiceCaseWithRelations[],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function getServiceCase(id: string): Promise<ActionResult<ServiceCaseWithRelations>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select(`
        *,
        customer:customers!left(id, company_name, contact_person, email, phone),
        assignee:profiles!service_cases_assigned_to_fkey(id, full_name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return { success: false, error: 'Serviceopgave ikke fundet' }
    }

    return { success: true, data: data as ServiceCaseWithRelations }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create
// =====================================================

interface CreateServiceCaseInput {
  title: string
  description?: string
  customer_id?: string | null
  priority?: ServiceCasePriority
  source?: ServiceCaseSource
  source_email_id?: string | null
  assigned_to?: string | null
  // Smart fields
  address?: string | null
  postal_code?: string | null
  city?: string | null
  floor_door?: string | null
  latitude?: number | null
  longitude?: number | null
  contact_phone?: string | null
  ksr_number?: string | null
  ean_number?: string | null
}

export async function createServiceCase(
  input: CreateServiceCaseInput
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .insert({
        title: input.title,
        description: input.description || null,
        customer_id: input.customer_id || null,
        priority: input.priority || 'medium',
        source: input.source || 'manual',
        source_email_id: input.source_email_id || null,
        assigned_to: input.assigned_to || userId,
        created_by: userId,
        address: input.address || null,
        postal_code: input.postal_code || null,
        city: input.city || null,
        floor_door: input.floor_door || null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        contact_phone: input.contact_phone || null,
        ksr_number: input.ksr_number || null,
        ean_number: input.ean_number || null,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Error creating service case', { error })
      return { success: false, error: 'Kunne ikke oprette serviceopgave' }
    }

    // Send confirmation email to customer
    if (input.customer_id) {
      await sendServiceCaseConfirmation(supabase, data as ServiceCase, input.customer_id)
    }

    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/mail')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Update
// =====================================================

interface UpdateServiceCaseInput {
  title?: string
  description?: string
  status?: ServiceCaseStatus
  priority?: ServiceCasePriority
  assigned_to?: string | null
  status_note?: string | null
  // Smart fields
  address?: string | null
  postal_code?: string | null
  city?: string | null
  floor_door?: string | null
  latitude?: number | null
  longitude?: number | null
  contact_phone?: string | null
  ksr_number?: string | null
  ean_number?: string | null
  checklist?: any
  customer_signature?: string | null
  customer_signature_name?: string | null
  signed_at?: string | null
}

export async function updateServiceCase(
  id: string,
  input: UpdateServiceCaseInput
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .update(input)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('Error updating service case', { error })
      return { success: false, error: 'Kunne ikke opdatere serviceopgave' }
    }

    revalidatePath('/dashboard/service-cases')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function deleteServiceCase(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('service_cases')
      .delete()
      .eq('id', id)

    if (error) {
      return { success: false, error: 'Kunne ikke slette serviceopgave' }
    }

    revalidatePath('/dashboard/service-cases')
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Portal — customer-facing (anon)
// =====================================================

export async function getPortalServiceCases(
  customerId: string
): Promise<ActionResult<ServiceCase[]>> {
  try {
    const supabase = createAnonClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['new', 'in_progress', 'pending'])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal service cases', { error })
      return { success: false, error: 'Kunne ikke hente serviceopgaver' }
    }

    return { success: true, data: (data || []) as ServiceCase[] }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create from email
// =====================================================

export async function createServiceCaseFromEmail(
  emailId: string
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get the email
    const { data: email, error: emailError } = await supabase
      .from('incoming_emails')
      .select('id, subject, sender_email, sender_name, body_preview, customer_id')
      .eq('id', emailId)
      .single()

    if (emailError || !email) {
      return { success: false, error: 'Email ikke fundet' }
    }

    // If email not linked to customer, try to find by email
    let customerId = email.customer_id
    if (!customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email.sender_email)
        .maybeSingle()
      customerId = customer?.id || null
    }

    const title = email.subject || `Henvendelse fra ${email.sender_name || email.sender_email}`

    const { data, error } = await supabase
      .from('service_cases')
      .insert({
        title,
        description: email.body_preview || null,
        customer_id: customerId,
        priority: 'medium',
        source: 'email',
        source_email_id: emailId,
        assigned_to: userId,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Error creating service case from email', { error })
      return { success: false, error: 'Kunne ikke oprette serviceopgave' }
    }

    // Send confirmation email
    if (customerId) {
      await sendServiceCaseConfirmation(supabase, data as ServiceCase, customerId)
    }

    revalidatePath('/dashboard/service-cases')
    revalidatePath('/dashboard/mail')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Customer relation helper
// =====================================================

export async function getCustomerServiceCases(customerId: string): Promise<ServiceCase[]> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Failed to fetch customer service cases', { error })
      return []
    }

    return (data || []) as ServiceCase[]
  } catch {
    return []
  }
}

// =====================================================
// Stats
// =====================================================

export async function getServiceCaseStats(): Promise<ActionResult<{
  total: number
  new: number
  in_progress: number
  pending: number
  closed: number
  converted: number
}>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const [totalRes, newRes, progressRes, pendingRes, closedRes, convertedRes] = await Promise.all([
      supabase.from('service_cases').select('*', { count: 'exact', head: true }),
      supabase.from('service_cases').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('service_cases').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('service_cases').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('service_cases').select('*', { count: 'exact', head: true }).eq('status', 'closed'),
      supabase.from('service_cases').select('*', { count: 'exact', head: true }).eq('status', 'converted'),
    ])

    return {
      success: true,
      data: {
        total: totalRes.count || 0,
        new: newRes.count || 0,
        in_progress: progressRes.count || 0,
        pending: pendingRes.count || 0,
        closed: closedRes.count || 0,
        converted: convertedRes.count || 0,
      },
    }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Checklist & Close validation
// =====================================================

export async function updateChecklist(
  id: string,
  checklist: ChecklistItem[]
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const { data, error } = await supabase
      .from('service_cases')
      .update({ checklist })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return { success: false, error: 'Kunne ikke opdatere checkliste' }
    revalidatePath(`/dashboard/service-cases/${id}`)
    revalidatePath('/dashboard/service-cases')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function initializeChecklist(id: string): Promise<ActionResult<ServiceCase>> {
  return updateChecklist(id, DEFAULT_CHECKLIST)
}

// =====================================================
// Attachments
// =====================================================

export async function getServiceCaseAttachments(
  serviceCaseId: string
): Promise<ActionResult<ServiceCaseAttachment[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const { data, error } = await supabase
      .from('service_case_attachments')
      .select('*')
      .eq('service_case_id', serviceCaseId)
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: 'Kunne ikke hente vedhæftninger' }
    return { success: true, data: (data || []) as ServiceCaseAttachment[] }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function uploadServiceCaseAttachment(
  serviceCaseId: string,
  formData: FormData
): Promise<ActionResult<ServiceCaseAttachment>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    const file = formData.get('file') as File
    const category = (formData.get('category') as string) || 'other'

    if (!file) return { success: false, error: 'Ingen fil valgt' }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'jpg'
    const storagePath = `service-cases/${serviceCaseId}/${category}_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('service-case-files')
      .upload(storagePath, file, { contentType: file.type })

    if (uploadError) {
      logger.error('Storage upload error', { error: uploadError })
      return { success: false, error: 'Upload fejlede' }
    }

    const { data: urlData } = supabase.storage
      .from('service-case-files')
      .getPublicUrl(storagePath)

    const { data, error } = await supabase
      .from('service_case_attachments')
      .insert({
        service_case_id: serviceCaseId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        category,
        uploaded_by: userId,
      })
      .select('*')
      .single()

    if (error) {
      logger.error('Attachment insert error', { error })
      return { success: false, error: 'Kunne ikke gemme vedhæftning' }
    }

    revalidatePath(`/dashboard/service-cases/${serviceCaseId}`)
    return { success: true, data: data as ServiceCaseAttachment }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function deleteServiceCaseAttachment(
  attachmentId: string,
  serviceCaseId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get storage path first
    const { data: att } = await supabase
      .from('service_case_attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .single()

    if (att?.storage_path) {
      await supabase.storage
        .from('service-case-files')
        .remove([att.storage_path])
    }

    const { error } = await supabase
      .from('service_case_attachments')
      .delete()
      .eq('id', attachmentId)

    if (error) return { success: false, error: 'Kunne ikke slette vedhæftning' }

    revalidatePath(`/dashboard/service-cases/${serviceCaseId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Sign off (customer handover signature)
// =====================================================

export async function signOffServiceCase(
  id: string,
  signature: string,
  signerName: string
): Promise<ActionResult<ServiceCase>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('service_cases')
      .update({
        customer_signature: signature,
        customer_signature_name: signerName,
        signed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return { success: false, error: 'Kunne ikke gemme underskrift' }

    revalidatePath(`/dashboard/service-cases/${id}`)
    revalidatePath('/dashboard/service-cases')
    return { success: true, data: data as ServiceCase }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Ordrestyring Integration
// =====================================================

export async function sendToOrdrestyring(
  serviceCaseId: string
): Promise<ActionResult<{ os_case_id: string; os_case_number: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get the service case with customer data
    const { data: sc, error: scError } = await supabase
      .from('service_cases')
      .select(`
        *,
        customer:customers!left(id, company_name, contact_person, email, phone, billing_address, billing_postal_code, billing_city)
      `)
      .eq('id', serviceCaseId)
      .single()

    if (scError || !sc) {
      return { success: false, error: 'Serviceopgave ikke fundet' }
    }

    if (sc.os_case_id) {
      return { success: false, error: `Allerede sendt til Ordrestyring (${sc.os_case_id})` }
    }

    // Build the Ordrestyring payload
    const { createOrdrestyringCase } = await import('@/lib/services/ordrestyring')

    const customer = sc.customer as any
    const osResult = await createOrdrestyringCase({
      title: sc.title,
      description: sc.description || undefined,
      reference: sc.case_number,
      priority: sc.priority,
      ksr_number: sc.ksr_number || undefined,
      ean_number: sc.ean_number || undefined,
      customer: {
        name: customer?.company_name || 'Ukendt kunde',
        address: sc.address || customer?.billing_address || '',
        postal_code: sc.postal_code || customer?.billing_postal_code || '',
        city: sc.city || customer?.billing_city || '',
        email: customer?.email || '',
        phone: customer?.phone || '',
        contact_person: customer?.contact_person || '',
      },
      // Line items from description — in a real setup these would come from offer_line_items
      line_items: sc.description ? [{
        description: sc.title,
        quantity: 1,
        unit: 'stk',
        unit_price: 0,
      }] : [],
    })

    // Update CRM with Ordrestyring reference and change status
    const { error: updateError } = await supabase
      .from('service_cases')
      .update({
        os_case_id: osResult.case_number || osResult.id,
        os_synced_at: new Date().toISOString(),
        status: 'converted',
        status_note: `Oprettet i Ordrestyring: ${osResult.case_number || osResult.id}`,
      })
      .eq('id', serviceCaseId)

    if (updateError) {
      logger.error('Failed to update service case with OS reference', { error: updateError })
      // Still return success since the case was created in OS
    }

    revalidatePath(`/dashboard/service-cases/${serviceCaseId}`)
    revalidatePath('/dashboard/service-cases')

    return {
      success: true,
      data: {
        os_case_id: osResult.id,
        os_case_number: osResult.case_number,
      },
    }
  } catch (error) {
    logger.error('Ordrestyring integration error', { error })
    return { success: false, error: formatError(error, 'Kunne ikke oprette i Ordrestyring') }
  }
}

// =====================================================
// Email confirmation helper
// =====================================================

async function sendServiceCaseConfirmation(
  supabase: ReturnType<typeof createAnonClient>,
  serviceCase: ServiceCase,
  customerId: string
) {
  try {
    // Get customer email
    const { data: customer } = await supabase
      .from('customers')
      .select('email, company_name, contact_person')
      .eq('id', customerId)
      .single()

    if (!customer?.email) return

    // Find portal token
    const { data: tokenData } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const portalUrl = tokenData?.token
      ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'}/portal/${tokenData.token}`
      : null

    const subject = `Serviceopgave ${serviceCase.case_number} oprettet — ${serviceCase.title}`
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Tak for din henvendelse</h2>
        <p>Kære ${customer.contact_person || customer.company_name || 'kunde'},</p>
        <p>Vi har modtaget din henvendelse og oprettet en serviceopgave:</p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0;"><strong>Sagsnr.:</strong> ${serviceCase.case_number}</p>
          <p style="margin: 8px 0 0;"><strong>Emne:</strong> ${serviceCase.title}</p>
          <p style="margin: 8px 0 0;"><strong>Status:</strong> Ny — vi kigger på den hurtigst muligt</p>
        </div>
        ${portalUrl ? `<p><a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Se status i kundeportalen</a></p>` : ''}
        <p style="color: #666; font-size: 14px; margin-top: 24px;">Med venlig hilsen<br/>Elta Solar ApS</p>
      </div>
    `

    if (isGraphConfigured()) {
      await sendEmailViaGraph({ to: customer.email, subject, html, text: `Serviceopgave ${serviceCase.case_number}: ${serviceCase.title}` })
    }
  } catch (err) {
    logger.error('Failed to send service case confirmation email', { error: err })
  }
}
