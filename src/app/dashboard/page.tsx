import { Metadata } from 'next'
import { getUser, getUserProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  Users,
  Building2,
  FileText,
  FolderKanban,
  Mail,
  TrendingUp,
  Clock,
  DollarSign,
  XCircle,
  TrendingDown,
} from 'lucide-react'
import {
  getDashboardStats,
  getRecentActivity,
  getUpcomingTasks,
  getPendingOffers,
} from '@/lib/actions/dashboard'
import { getDashboardOverview } from '@/lib/actions/dashboard-overview'
import { getRejectionStats, getRecentRejections } from '@/lib/actions/reports'
import { getCompanySettings } from '@/lib/actions/settings'
import { formatCurrency } from '@/lib/utils/format'
import Link from 'next/link'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  StatCard,
  RecentActivity,
  LeadsPipeline,
  UpcomingTasks,
  PendingOffers,
  QuickActions,
  SystemAlertsWidget,
  PriceAlertsWidget,
  MonthlyOfferChart,
  EmailIntelligenceCard,
  InvoiceEconomySection,
  InvoiceLiquidityChart,
  AccountingHealthWidget,
  OfferConversionWidget,
  OutstandingPortfolioWidget,
  BillingFollowupWidget,
  IncomingInvoiceDueWidget,
  PurchaseOperationsWidget,
} from '@/components/modules/dashboard'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { SupplierHealthOverview } from '@/components/modules/suppliers/supplier-health-overview'
import { OperationalOverview } from '@/components/dashboard/operational-overview'
import { StyringsCockpit } from '@/components/dashboard/styrings-cockpit'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Oversigt over kunder, leads, tilbud og projekter',
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getUserProfile()

  // Montør gets redirected to their task view (mobile-friendly)
  if (profile?.role === 'montør') {
    redirect('/dashboard/tasks')
  }

  // Fetch all dashboard data in parallel
  const [
    stats,
    activities,
    tasks,
    offers,
    settingsResult,
    overview,
    rejectionStatsResult,
    recentRejectionsResult,
  ] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(8),
    getUpcomingTasks(5),
    getPendingOffers(5),
    getCompanySettings(),
    getDashboardOverview(),
    getRejectionStats(),
    getRecentRejections(5),
  ])

  const companySettings = settingsResult.success && settingsResult.data ? settingsResult.data : null
  const rejectionStats = rejectionStatsResult.success && rejectionStatsResult.data
    ? rejectionStatsResult.data
    : null
  const recentRejections = recentRejectionsResult.success && recentRejectionsResult.data
    ? recentRejectionsResult.data
    : []

  // Sprint Ø4.0 — cost-free fakturaøkonomi kun for invoices.view.all.
  const canViewInvoices = await pageHasPermission('invoices.view.all')
  // Sprint Ø6.4 — regnskabs-widget kun for settings.economic (bogholderi/admin).
  const canViewEconomic = await pageHasPermission('settings.economic')
  // Sprint Ø7.3 — tilbud-klar-til-sag-widget kun for offers.view.
  const canViewOffers = await pageHasPermission('offers.view')
  // Sprint Ø8.1 — portefølje-udestående-widget kun for invoices.view.own_cases.
  const canSeeBilling = await pageHasPermission('invoices.view.own_cases')
  // Sprint Ø9.1 — leverandørfaktura-forfaldswidget kun for incoming_invoices.view.
  const canViewIncoming = await pageHasPermission('incoming_invoices.view')

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold">
          Velkommen tilbage{profile?.full_name ? `, ${profile.full_name}` : ''}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Her er et overblik over dine aktiviteter
        </p>
      </div>

      {/* Sprint 9A — Styringscockpit (kraever handling) */}
      <StyringsCockpit overview={overview} />

      {/* Sprint Ø4.0 — Driftsdashboard: cost-free fakturaøkonomi (få pengene hjem) */}
      {canViewInvoices && <InvoiceEconomySection />}

      {/* Sprint Ø4.2 — Likviditetsgraf: faktureret vs. betalt 6 mdr. */}
      {canViewInvoices && <InvoiceLiquidityChart />}

      {/* Sprint Ø6.4 — Regnskabsstatus: e-conomic eksportfejl proaktivt */}
      {canViewEconomic && <AccountingHealthWidget />}

      {/* Sprint Ø7.3 — Tilbud klar til sag: proaktiv konverterings-synlighed */}
      {canViewOffers && <OfferConversionWidget />}

      {/* Sprint Ø8.1 — Udestående på tværs af aktive sager (cost-free) */}
      {canSeeBilling && <OutstandingPortfolioWidget />}

      {/* Sprint Ø8.3 — Faktureringsopfølgning: sager der kræver fakturahandling */}
      {canSeeBilling && <BillingFollowupWidget />}

      {/* Sprint Ø9.1 — Leverandørfaktura-forfald (intern indkøb, "pengene ud") */}
      {canViewIncoming && <IncomingInvoiceDueWidget />}

      {/* Sprint Ø9.5 — Porteføljevidt indkøbsdrift-overblik (drift + forfald pr. sag) */}
      {canViewIncoming && <PurchaseOperationsWidget />}

      {/* Phase 6.1 — Operational overview (auto-refresh, system health) */}
      <OperationalOverview />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Aktive Leads"
          value={stats.leads.total - stats.leads.won - stats.leads.lost}
          subtitle={`${stats.leads.conversionRate}% konvertering`}
          icon={Users}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          href="/dashboard/leads"
        />
        <StatCard
          title="Kunder"
          value={stats.customers.active}
          subtitle={`${stats.customers.new_this_month} nye denne måned`}
          icon={Building2}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
          href="/dashboard/customers"
        />
        <StatCard
          title="Afventende Tilbud"
          value={stats.offers.sent + stats.offers.viewed}
          subtitle={formatCurrency(stats.offers.pending_value)}
          icon={FileText}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-100"
          href="/dashboard/offers"
        />
        <StatCard
          title="Aktive Sager"
          value={stats.projects.active}
          subtitle={`${stats.projects.total_hours}t registreret`}
          icon={FolderKanban}
          iconColor="text-orange-600"
          iconBgColor="bg-orange-100"
          href="/dashboard/orders"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Accepterede Tilbud"
          value={stats.offers.accepted}
          subtitle={formatCurrency(stats.offers.accepted_value)}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBgColor="bg-green-100"
        />
        <StatCard
          title="Fakturerbare Timer"
          value={`${stats.projects.billable_hours}t`}
          subtitle={`af ${stats.projects.total_hours}t total`}
          icon={Clock}
          iconColor="text-cyan-600"
          iconBgColor="bg-cyan-100"
        />
        <StatCard
          title="Ulæste Kundemails"
          value={stats.customerEmails.unread}
          subtitle={stats.messages.unread > 0 ? `+ ${stats.messages.unread} interne` : undefined}
          icon={Mail}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-100"
          href="/dashboard/mail"
        />
      </div>

      {/* Phase 12A Rejection Analytics — afviste tilbud + tabt omsætning (seneste 90 dage) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Afviste tilbud"
          value={rejectionStats?.totalRejected ?? 0}
          subtitle={
            rejectionStats && rejectionStats.totalRejected > 0
              ? `${rejectionStats.rejectionRate.toFixed(1)}% afvisningsrate (90 dage)`
              : 'Ingen afviste tilbud i scope'
          }
          icon={XCircle}
          iconColor="text-red-600"
          iconBgColor="bg-red-100"
          href="/dashboard/offers?status=rejected"
          trend={
            rejectionStats && rejectionStats.trend.prev30Days > 0
              ? {
                  value: Math.abs(rejectionStats.trend.deltaPercent),
                  label: 'vs. forrige 30 dage',
                  // Faerre afviste = positivt (isPositive=true). Flere afviste = negativt
                  isPositive: rejectionStats.trend.deltaPercent <= 0,
                }
              : undefined
          }
        />
        <StatCard
          title="Tabt omsætning"
          value={formatCurrency(rejectionStats?.lostRevenue ?? 0)}
          subtitle="Fra afviste tilbud (90 dage)"
          icon={TrendingDown}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-100"
          href="/dashboard/offers?status=rejected"
        />
      </div>

      {/* Economic Dashboard — Monthly Offer Stats */}
      <div className="bg-white p-6 rounded-lg border">
        <MonthlyOfferChart />
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-lg font-semibold mb-4">Hurtige handlinger</h2>
        <QuickActions companySettings={companySettings} />
      </div>

      {/* System Alerts, Price Monitoring & Supplier Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Systemadvarsler</h2>
          <SystemAlertsWidget />
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Prisovervågning</h2>
          <PriceAlertsWidget />
        </div>
        <SupplierHealthOverview />
      </div>

      {/* Email Intelligence — today's counts */}
      <EmailIntelligenceCard />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Pipeline */}
        <div className="lg:col-span-1 bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Leads Pipeline</h2>
          <LeadsPipeline
            data={{
              new: stats.leads.new,
              contacted: stats.leads.contacted,
              qualified: stats.leads.qualified,
              proposal: stats.leads.proposal,
              negotiation: stats.leads.negotiation,
              won: stats.leads.won,
              lost: stats.leads.lost,
            }}
            conversionRate={stats.leads.conversionRate}
          />
        </div>

        {/* Middle Column - Recent Activity */}
        <div className="lg:col-span-1 bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Seneste aktivitet</h2>
          <RecentActivity activities={activities} />
        </div>

        {/* Right Column - Tasks & Offers */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Kommende opgaver</h2>
            <UpcomingTasks tasks={tasks} />
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Afventende tilbud</h2>
            <PendingOffers offers={offers} />
          </div>

          {/* Phase 12A — Seneste afviste tilbud */}
          <div className="bg-white p-6 rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Seneste afviste tilbud</h2>
              {recentRejections.length > 0 && (
                <Link
                  href="/dashboard/offers?status=rejected"
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Se alle →
                </Link>
              )}
            </div>
            {recentRejections.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Ingen afviste tilbud endnu.</p>
            ) : (
              <ul className="divide-y">
                {recentRejections.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <Link
                      href={`/dashboard/offers/${r.id}`}
                      className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {r.offer_number}
                            {r.title ? ` — ${r.title}` : ''}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {r.customer_name || 'Ukendt kunde'}
                          </p>
                          <p className="text-xs text-red-600 mt-0.5 truncate">
                            {r.reason_label}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-gray-700">
                            {formatCurrency(r.final_amount)}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {format(new Date(r.rejected_at), 'd. MMM', { locale: da })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
