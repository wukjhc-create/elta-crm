import { notFound } from 'next/navigation'
import { getCustomer } from '@/lib/actions/customers'
import { getPortalTokens } from '@/lib/actions/portal'
import { getPartnerTokens } from '@/lib/actions/partner-portal'
import { getDocumentCompanySettings } from '@/lib/actions/company-public'
import { CustomerDetailClient } from './customer-detail-client'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { getCustomerOffers, getCustomerLeads, getCustomerSentQuotes } from '@/lib/actions/customer-relations'
import { getCustomerServiceCases } from '@/lib/actions/service-cases'
import { getCustomerPaymentHealthAction } from '@/lib/actions/invoices'
import { getCustomerTasks, getActiveProfiles, getCustomerTaskAbilitiesAction } from '@/lib/actions/customer-tasks'
import { getCustomerNotes } from '@/lib/actions/customer-notes'

export const dynamic = 'force-dynamic'

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params

  // PF3-1 (performance-review 3 2026-10-20): aktivitetsoversigten (4 kald) og betalingsmærket hentes her samtidig med
  // kunden — fra klienten køres server-actions ét ad gangen, så åbningen ventede på ~13 kald i træk. Hvert kald har sin
  // egen rettigheds-/scope-kontrol; uden adgang til kunden bruges resultaterne ikke (notFound).
  const [customerResult, tokensResult, partnerTokensResult, settingsResult, canManagePricing, offers, sentQuotes, serviceCases, paymentHealth, tasks, profiles, taskAbilities, notes] = await Promise.all([
    getCustomer(id),
    getPortalTokens(id),
    getPartnerTokens(id),
    getDocumentCompanySettings(),
    // D48: kundeaftaler (leverandørrabat, avance, kostpris) kun for prisværktøjet (admin, serviceleder)
    pageHasPermission('tools.pricing'),
    getCustomerOffers(id).catch(() => null),
    getCustomerSentQuotes(id).catch(() => null),
    getCustomerServiceCases(id).catch(() => null),
    getCustomerPaymentHealthAction(id).catch(() => null),
    // PF3-1 del 2: opgaver (3 kald) og noter (1 kald) — samme gates som når komponenterne selv henter
    getCustomerTasks(id).catch(() => null),
    getActiveProfiles().catch(() => null),
    getCustomerTaskAbilitiesAction(id).catch(() => null),
    getCustomerNotes(id).catch(() => null),
  ])

  if (!customerResult.success || !customerResult.data) {
    notFound()
  }
  // leads matches også på kundens e-mail → efter kunden
  const leads = await getCustomerLeads(id, customerResult.data.email).catch(() => null)
  const initialActivity = offers && sentQuotes && serviceCases && leads ? { offers, leads, sentQuotes, serviceCases } : undefined

  return (
    <CustomerDetailClient
      customer={customerResult.data}
      portalTokens={tokensResult.data || []}
      partnerTokens={partnerTokensResult.data || []}
      companySettings={settingsResult.success && settingsResult.data ? settingsResult.data : null}
      canManagePricing={canManagePricing}
      initialActivity={initialActivity}
      initialPaymentHealth={paymentHealth ?? undefined}
      initialTasks={tasks && profiles && taskAbilities ? { tasks, profiles, abilities: taskAbilities } : undefined}
      initialNotes={notes ?? undefined}
    />
  )
}
