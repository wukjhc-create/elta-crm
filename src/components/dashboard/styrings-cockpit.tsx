/**
 * Sprint 9A — Styringscockpit.
 *
 * Fem fokuserede "krader handling"-kort til toppen af /dashboard:
 *   1. Mails kraever svar
 *   2. Aabne opgaver (med auto-tasks-tæller + top overdue)
 *   3. Sager kraever handling (new/in_progress/pending)
 *   4. Tilbud opfoelgning (sent/viewed >7 dage)
 *   5. Kommende besigtigelser
 *
 * Server-component — modtager pre-fetched overview fra side-page.
 *
 * Sprint 9A-fix: hele kort-headeren samt hver list-row er nu egne <Link>-elementer
 * (cursor-pointer, hover-state, korrekt filter-param 'requires_response').
 */

import Link from 'next/link'
import {
  Mail,
  ListChecks,
  Wrench,
  FileText,
  CalendarClock,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import type { DashboardOverview } from '@/lib/actions/dashboard-overview'

interface Props {
  overview: DashboardOverview
}

function fmtDateDK(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ageBadge(days: number, threshold = 7): string {
  if (days >= threshold) return 'text-red-700'
  if (days >= 3) return 'text-amber-700'
  return 'text-gray-600'
}

export function StyringsCockpit({ overview }: Props) {
  const hasAnyError = Object.keys(overview.errors).length > 0

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Styringscockpit</h2>
          <p className="text-xs text-gray-500">
            Hvad kræver din opmærksomhed lige nu
          </p>
        </div>
        {hasAnyError && (
          <span className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Delvise data — et eller flere felter kunne ikke hentes
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <MailsCard overview={overview} />
        <TasksCard overview={overview} />
        <CasesCard overview={overview} />
        <OffersCard overview={overview} />
        <VisitsCard overview={overview} />
      </div>
    </section>
  )
}

// =====================================================
// 1. Mails kræver svar
// =====================================================

const MAIL_HREF = '/dashboard/mail?filter=requires_response'

function MailsCard({ overview }: { overview: DashboardOverview }) {
  const { requiresResponseCount, oldest } = overview.mails
  const err = overview.errors.mails
  return (
    <Card
      title="Mails kræver svar"
      icon={<Mail className="h-4 w-4" />}
      tone={requiresResponseCount > 0 ? 'amber' : 'green'}
      href={MAIL_HREF}
      headline={requiresResponseCount}
      headlineLabel="ubesvarede tråde"
      error={err}
    >
      {oldest.length === 0 ? (
        <EmptyRow text={err ? 'Kunne ikke hente data' : 'Alle tråde er besvaret.'} />
      ) : (
        <ul className="text-xs divide-y">
          {oldest.map((m) => (
            <li key={m.id}>
              {/* Sprint 9B: ?emailId deeplink. Mail-clienten auto-selecter
                  mailen og fjerner emailId fra URL'en bagefter. */}
              <Link
                href={`${MAIL_HREF}&emailId=${m.id}`}
                className="py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 rounded -mx-1 px-1 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.subject || '(uden emne)'}</div>
                  <div className="truncate text-gray-500">
                    {m.sender_name || m.sender_email || 'Ukendt afsender'}
                  </div>
                </div>
                <span className={`shrink-0 text-[11px] flex items-center gap-1 ${ageBadge(m.ageDays)}`}>
                  {m.ageDays}d
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// =====================================================
// 2. Åbne opgaver
// =====================================================

const TASKS_HREF = '/dashboard/tasks'

function TasksCard({ overview }: { overview: DashboardOverview }) {
  const { openCount, autoCount, overdue } = overview.tasks
  const err = overview.errors.tasks
  return (
    <Card
      title="Åbne opgaver"
      icon={<ListChecks className="h-4 w-4" />}
      tone={overdue.length > 0 ? 'red' : openCount > 0 ? 'amber' : 'green'}
      href={TASKS_HREF}
      headline={openCount}
      headlineLabel={`åbne · ${autoCount} auto-genererede`}
      error={err}
    >
      {overdue.length === 0 ? (
        <EmptyRow text={err ? 'Kunne ikke hente data' : 'Ingen overdue opgaver.'} />
      ) : (
        <ul className="text-xs divide-y">
          {overdue.map((t) => (
            <li key={t.id}>
              {/* Sprint 9B: ?taskId deeplink — tasks-clienten highlight'er
                  og scroller rowen ind i viewport. */}
              <Link
                href={`${TASKS_HREF}?taskId=${t.id}`}
                className="py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 rounded -mx-1 px-1 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-gray-500">
                    {t.customer_name || '—'}
                    {t.auto_generated && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-700">
                        auto
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] flex items-center gap-1 text-red-700">
                  {t.daysOverdue}d
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// =====================================================
// 3. Sager
// =====================================================

function CasesCard({ overview }: { overview: DashboardOverview }) {
  const { new: newCases, in_progress, pending, total } = overview.cases
  const err = overview.errors.cases
  return (
    <Card
      title="Sager kræver handling"
      icon={<Wrench className="h-4 w-4" />}
      tone={newCases > 0 || pending > 0 ? 'amber' : 'green'}
      href="/dashboard/service-cases"
      headline={total}
      headlineLabel="aktive i alt"
      error={err}
    >
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Pill label="Nye" value={newCases} tone={newCases > 0 ? 'amber' : 'gray'} />
        <Pill label="I gang" value={in_progress} tone="blue" />
        <Pill label="Pending" value={pending} tone={pending > 0 ? 'amber' : 'gray'} />
      </div>
    </Card>
  )
}

// =====================================================
// 4. Tilbud opfølgning
// =====================================================

function OffersCard({ overview }: { overview: DashboardOverview }) {
  const { followupCount, oldest } = overview.offers
  const err = overview.errors.offers
  return (
    <Card
      title="Tilbud — opfølgning"
      icon={<FileText className="h-4 w-4" />}
      tone={followupCount > 0 ? 'amber' : 'green'}
      href="/dashboard/offers?status=sent"
      headline={followupCount}
      headlineLabel="ældre end 7 dage"
      error={err}
    >
      {oldest.length === 0 ? (
        <EmptyRow text={err ? 'Kunne ikke hente data' : 'Ingen ventende opfølgning.'} />
      ) : (
        <ul className="text-xs divide-y">
          {oldest.map((o) => (
            <li key={o.id}>
              <Link
                href={`/dashboard/offers/${o.id}`}
                className="py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 rounded -mx-1 px-1 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {o.offer_number} · {o.title}
                  </div>
                  <div className="truncate text-gray-500">{o.customer_name || '—'}</div>
                </div>
                <span className={`shrink-0 text-[11px] flex items-center gap-1 ${ageBadge(o.ageDays)}`}>
                  {o.ageDays}d
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// =====================================================
// 5. Kommende besigtigelser
// =====================================================

function VisitsCard({ overview }: { overview: DashboardOverview }) {
  const { upcoming, empty } = overview.visits
  const err = overview.errors.visits
  return (
    <Card
      title="Kommende besigtigelser"
      icon={<CalendarClock className="h-4 w-4" />}
      tone={upcoming.length > 0 ? 'blue' : 'gray'}
      href="/dashboard/calendar"
      headline={upcoming.length}
      headlineLabel="planlagte"
      error={err}
    >
      {empty ? (
        <EmptyRow text={err ? 'Kunne ikke hente data' : 'Ingen kommende besigtigelser.'} />
      ) : (
        <ul className="text-xs divide-y">
          {upcoming.map((v) => (
            <li key={v.id}>
              {/* Sprint 9B: besigtigelser er customer_tasks — brug taskId-deeplink. */}
              <Link
                href={`/dashboard/tasks?taskId=${v.id}`}
                className="py-1.5 flex items-center justify-between gap-2 hover:bg-gray-50 rounded -mx-1 px-1 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.title}</div>
                  <div className="truncate text-gray-500">{v.customer_name || '—'}</div>
                </div>
                <span className="shrink-0 text-[11px] flex items-center gap-1 text-gray-600">
                  {fmtDateDK(v.due_date)}
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// =====================================================
// Shared bits
// =====================================================

type Tone = 'red' | 'amber' | 'green' | 'blue' | 'gray'

const TONE_CLASSES: Record<Tone, { ring: string; dot: string; text: string; hoverRing: string }> = {
  red: { ring: 'ring-red-200', dot: 'bg-red-500', text: 'text-red-700', hoverRing: 'hover:ring-red-300' },
  amber: { ring: 'ring-amber-200', dot: 'bg-amber-500', text: 'text-amber-700', hoverRing: 'hover:ring-amber-300' },
  green: { ring: 'ring-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700', hoverRing: 'hover:ring-emerald-300' },
  blue: { ring: 'ring-blue-200', dot: 'bg-blue-500', text: 'text-blue-700', hoverRing: 'hover:ring-blue-300' },
  gray: { ring: 'ring-gray-200', dot: 'bg-gray-400', text: 'text-gray-700', hoverRing: 'hover:ring-gray-300' },
}

function Card({
  title,
  icon,
  tone,
  href,
  headline,
  headlineLabel,
  error,
  children,
}: {
  title: string
  icon: React.ReactNode
  tone: Tone
  href: string
  headline: number
  headlineLabel: string
  error?: string
  children: React.ReactNode
}) {
  const cls = TONE_CLASSES[tone]
  return (
    <div
      className={`bg-white rounded-lg ring-1 ${cls.ring} ${cls.hoverRing} hover:shadow-sm transition p-4 flex flex-col gap-3`}
    >
      {/*
        Header er hovedklik-omraadet (titel, tal, label, ikon, chevron).
        Listerow'ne neden under er separate Links saa vi undgaar ulovlige
        nested anchors.
      */}
      <Link
        href={href}
        aria-label={`Gå til ${title}`}
        className="flex items-start justify-between cursor-pointer group"
      >
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${cls.dot}`} />
            {title}
          </h3>
          <p className="mt-1 text-2xl font-semibold leading-none">{headline}</p>
          <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
            {headlineLabel}
            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-60 transition" />
          </p>
        </div>
        <span className={`shrink-0 ${cls.text} group-hover:opacity-80`}>{icon}</span>
      </Link>

      <div className="border-t border-gray-100 pt-2 min-h-[88px]">{children}</div>

      {error && (
        <p className="text-[11px] text-amber-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 py-4 text-center">{text}</p>
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: Tone
}) {
  const cls = TONE_CLASSES[tone]
  return (
    <div className={`rounded ring-1 ${cls.ring} p-2`}>
      <div className={`text-base font-semibold ${cls.text}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  )
}
