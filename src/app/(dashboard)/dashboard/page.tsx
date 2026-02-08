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
} from 'lucide-react'
import {
  getDashboardStats,
  getRecentActivity,
  getUpcomingTasks,
  getPendingOffers,
} from '@/lib/actions/dashboard'
import { getCompanySettings } from '@/lib/actions/settings'
import {
  StatCard,
  RecentActivity,
  LeadsPipeline,
  UpcomingTasks,
  PendingOffers,
  QuickActions,
  SystemAlertsWidget,
  PriceAlertsWidget,
} from '@/components/modules/dashboard'

export default async function DashboardPage() {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getUserProfile()

  // Fetch all dashboard data in parallel
  const [stats, activities, tasks, offers, settingsResult] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(8),
    getUpcomingTasks(5),
    getPendingOffers(5),
    getCompanySettings(),
  ])

  const companySettings = settingsResult.success && settingsResult.data ? settingsResult.data : null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

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
          title="Aktive Projekter"
          value={stats.projects.active}
          subtitle={`${stats.projects.total_hours}t registreret`}
          icon={FolderKanban}
          iconColor="text-orange-600"
          iconBgColor="bg-orange-100"
          href="/dashboard/projects"
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
          title="Ulæste Beskeder"
          value={stats.messages.unread}
          icon={Mail}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-100"
          href="/dashboard/inbox"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-lg font-semibold mb-4">Hurtige handlinger</h2>
        <QuickActions companySettings={companySettings} />
      </div>

      {/* System Alerts & Price Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Systemadvarsler</h2>
          <SystemAlertsWidget />
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Prisovervågning</h2>
          <PriceAlertsWidget />
        </div>
      </div>

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
        </div>
      </div>
    </div>
  )
}
