import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { contactFormSchema } from '@/lib/validations/contact-form'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * PUBLIC CONTACT FORM ENDPOINT
 *
 * Receives submissions from the eltasolar.dk website contact form.
 * Creates a Customer + Lead automatically in the CRM.
 *
 * POST /api/public/contact
 * Headers: X-API-Key (required)
 * Body: JSON { name, email, phone, zip, address, inquiry_type, message? }
 */

const MAX_PAYLOAD = 65_536 // 64KB

// =====================================================
// Service role client (bypasses RLS)
// =====================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase configuration')
  }
  return createClient(url, key)
}

// =====================================================
// API key validation
// =====================================================

function validateApiKey(request: NextRequest): boolean {
  const apiKey = process.env.CONTACT_FORM_API_KEY
  if (!apiKey) {
    logger.warn('CONTACT_FORM_API_KEY not configured — rejecting request')
    return false
  }

  const provided =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '')

  if (!provided) return false

  try {
    const a = Buffer.from(apiKey, 'utf-8')
    const b = Buffer.from(provided, 'utf-8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// =====================================================
// Auto-generate next customer number
// =====================================================

async function generateCustomerNumber(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data } = await supabase
    .from('customers')
    .select('customer_number')
    .order('customer_number', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return 'C000001'

  const lastNumber = (data[0] as any).customer_number as string
  const numPart = parseInt(lastNumber.substring(1), 10)
  return 'C' + (numPart + 1).toString().padStart(6, '0')
}

// =====================================================
// CORS headers for eltasolar.dk
// =====================================================

const ALLOWED_ORIGINS = [
  'https://eltasolar.dk',
  'https://www.eltasolar.dk',
  'http://localhost:3000',
  'http://localhost:5500',
]

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ''

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

// =====================================================
// OPTIONS — CORS preflight
// =====================================================

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

// =====================================================
// POST — Handle contact form submission
// =====================================================

export async function POST(request: NextRequest) {
  const cors = getCorsHeaders(request)

  try {
    // 1. Payload size check
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > MAX_PAYLOAD) {
      return NextResponse.json(
        { success: false, error: 'Payload for stor' },
        { status: 413, headers: cors }
      )
    }

    // 2. API key validation
    if (!validateApiKey(request)) {
      logger.warn('Contact form: Invalid or missing API key', {
        metadata: { ip: request.headers.get('x-forwarded-for') },
      })
      return NextResponse.json(
        { success: false, error: 'Ugyldig API-nøgle' },
        { status: 401, headers: cors }
      )
    }

    // 3. Parse and validate body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Ugyldig JSON' },
        { status: 400, headers: cors }
      )
    }

    const parsed = contactFormSchema.safeParse(body)
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ')
      return NextResponse.json(
        { success: false, error: errors },
        { status: 400, headers: cors }
      )
    }

    const { name, email, phone, zip, address, inquiry_type, message } = parsed.data

    const supabase = getServiceClient()

    // 4. Get system user for created_by — prefer admin, fallback to any user
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()

    let createdBy = adminUser?.id

    if (!createdBy) {
      // Fallback: use any user
      const { data: anyUser } = await supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .maybeSingle()

      createdBy = anyUser?.id
    }

    if (!createdBy) {
      logger.error('Contact form: No user found in profiles table')
      return NextResponse.json(
        { success: false, error: 'Systemfejl — kontakt venligst direkte' },
        { status: 500, headers: cors }
      )
    }

    // 5. Check for existing customer by email
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .ilike('email', email)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    let customerId: string

    if (existingCustomer) {
      // Existing customer — reuse
      customerId = existingCustomer.id
      logger.info('Contact form: Matched existing customer', {
        entity: 'customers',
        entityId: customerId,
        metadata: { email, customer_number: existingCustomer.customer_number },
      })
    } else {
      // 6. Create new customer
      const customerNumber = await generateCustomerNumber(supabase as any)

      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          customer_number: customerNumber,
          company_name: name, // Privatperson → name as company
          contact_person: name,
          email,
          phone,
          billing_address: address,
          billing_postal_code: zip,
          billing_country: 'Danmark',
          tags: ['website'],
          notes: `Oprettet automatisk fra hjemmeside-kontaktformular.\nHenvendelsestype: ${inquiry_type}`,
          is_active: true,
          created_by: createdBy,
        })
        .select('id, customer_number')
        .single()

      if (customerError) {
        logger.error('Contact form: Failed to create customer', {
          error: customerError,
          metadata: { email },
        })
        return NextResponse.json(
          { success: false, error: 'Kunne ikke oprette kunde' },
          { status: 500, headers: cors }
        )
      }

      customerId = newCustomer.id
      logger.info('Contact form: Customer created', {
        entity: 'customers',
        entityId: customerId,
        metadata: { customer_number: newCustomer.customer_number, email },
      })
    }

    // 7. Build lead notes
    const leadNotes = [
      `Henvendelsestype: ${inquiry_type}`,
      `Adresse: ${address}, ${zip}`,
      message ? `Besked: ${message}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    // 8. Create lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        company_name: name,
        contact_person: name,
        email,
        phone,
        status: 'new',
        source: 'website',
        notes: leadNotes,
        tags: [inquiry_type],
        custom_fields: {
          zip,
          address,
          inquiry_type,
          submitted_at: new Date().toISOString(),
        },
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (leadError) {
      logger.error('Contact form: Failed to create lead', {
        error: leadError,
        metadata: { email },
      })
      return NextResponse.json(
        { success: false, error: 'Kunne ikke oprette henvendelse' },
        { status: 500, headers: cors }
      )
    }

    // 9. Log activity
    await supabase.from('lead_activities').insert({
      lead_id: lead.id,
      activity_type: 'created',
      description: `Henvendelse modtaget fra hjemmesiden: ${inquiry_type}`,
      performed_by: createdBy,
    })

    logger.info('Contact form: Lead created from website', {
      entity: 'leads',
      entityId: lead.id,
      metadata: {
        email,
        inquiry_type,
        customerId,
        isNewCustomer: !existingCustomer,
      },
    })

    return NextResponse.json(
      {
        success: true,
        leadId: lead.id,
        message: 'Tak for din henvendelse! Vi kontakter dig hurtigst muligt.',
      },
      { status: 200, headers: cors }
    )
  } catch (error) {
    logger.error('Contact form: Unexpected error', { error })
    return NextResponse.json(
      { success: false, error: 'Uventet fejl — prøv igen senere' },
      { status: 500, headers: cors }
    )
  }
}
