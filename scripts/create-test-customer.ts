import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function createTestCustomer() {
  // Generate customer number
  const { data: lastCustomer } = await supabase
    .from('customers')
    .select('customer_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const nextNumber = lastCustomer 
    ? parseInt(lastCustomer.customer_number.replace('K-', '')) + 1 
    : 1001

  const customerNumber = `K-${nextNumber}`

  const { data, error } = await supabase
    .from('customers')
    .insert({
      customer_number: customerNumber,
      company_name: 'Test Firma ApS',
      contact_person: 'Anders Andersen',
      email: 'anders@testfirma.dk',
      phone: '+45 12 34 56 78',
      vat_number: '12345678',
      billing_address: 'Testvej 123',
      billing_postal_code: '2100',
      billing_city: 'København Ø',
      billing_country: 'Danmark',
      is_active: true,
      notes: 'Test kunde oprettet via script'
    })
    .select()
    .single()

  if (error) {
    console.error('Fejl:', error.message)
    process.exit(1)
  }

  console.log('✅ Kunde oprettet:')
  console.log(`   Kundenr: ${data.customer_number}`)
  console.log(`   Firma: ${data.company_name}`)
  console.log(`   Kontakt: ${data.contact_person}`)
  console.log(`   Email: ${data.email}`)
}

createTestCustomer()
