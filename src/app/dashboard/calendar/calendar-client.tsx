'use client'

import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { dayReminderCountText, dayTaskCountText } from '@/lib/planning/day-task-count'
import { calendarDayHeading } from '@/lib/planning/calendar-day-heading'
import { upcomingInspections } from '@/lib/calendar/agenda'
import { ASSISTANT_RULE } from '@/lib/assistant/rules'
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin, Clock, User, Navigation, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useRealtimeTable } from '@/lib/hooks/use-realtime'
import { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '@/types/customer-tasks.types'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'

/** Egne personlige påmindelser (00197) — vises i månedsvisningen; kun ejeren får dem (RLS) */
export type CalendarPersonalReminder = { id: string; title: string; due_at: string; status: 'pending' | 'done' }

interface CalendarPageClientProps {
  tasks: CustomerTaskWithRelations[]
  personalReminders?: CalendarPersonalReminder[]
  /** Sat når besigtigelser eller opkald ikke kunne hentes. Tom måned må ikke ligne ingen aftaler. */
  tasksError?: string | null
  /** Profilopslaget fejlede. En aftale med ansvarlig må ikke ligne en uden navn. */
  namesFailed?: boolean
}

const WEEKDAY_NAMES = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
const MONTH_NAMES = [
  'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'December',
]

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay()
  // Convert Sunday=0 to Monday-based (Mon=0, Sun=6)
  return day === 0 ? 6 : day - 1
}

export function CalendarPageClient({ tasks: initialTasks, personalReminders = [], tasksError = null, namesFailed = false }: CalendarPageClientProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Realtime updates
  useRealtimeTable('customer_tasks', () => {
    // Reload via router would be better, but for now just mark as stale
    // The page will refresh on next navigation
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, CustomerTaskWithRelations[]> = {}
    for (const task of tasks) {
      if (task.due_date) {
        // dansk kalenderdato (før: UTC-datoen → et opkald kl. 00:30 dansk tid lå på dagen før)
        const dateKey = copenhagenParts(task.due_date).date
        if (!map[dateKey]) map[dateKey] = []
        map[dateKey].push(task)
      }
    }
    return map
  }, [tasks])

  const remindersByDate = useMemo(() => {
    const map: Record<string, CalendarPersonalReminder[]> = {}
    for (const r of personalReminders) {
      const key = copenhagenParts(r.due_at).date
      ;(map[key] ??= []).push(r)
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.due_at.localeCompare(b.due_at))
    return map
  }, [personalReminders])

  const today = copenhagenParts(new Date()).date

  const loadNote = tasksError ? (
    <p className="mb-3 text-sm text-red-700 break-words min-w-0" data-testid="calendar-tasks-load-error">
      {tasksError}. Det tælles ikke som ingen aftaler.
    </p>
  ) : namesFailed ? (
    <p className="mb-3 text-sm text-red-700 break-words min-w-0" data-testid="calendar-assignee-names-error">
      Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.
    </p>
  ) : null

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(today)
  }

  // Build calendar grid
  const calendarDays: Array<{ day: number; dateKey: string } | null> = []
  for (let i = 0; i < firstDay; i++) calendarDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    calendarDays.push({ day: d, dateKey })
  }

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] || []) : []
  const dayTaskCount = dayTaskCountText(selectedTasks.length)

  // Extract time/address from description
  function extractInfo(desc: string | null) {
    if (!desc) return { time: null, address: null }
    const timeMatch = desc.match(/Tidspunkt:\s*(.+)/i) || desc.match(/kl\.\s*(\S+)/)
    const addrMatch = desc.match(/Adresse:\s*(.+)/i)
    return {
      time: timeMatch ? timeMatch[1].trim() : null,
      address: addrMatch ? addrMatch[1].trim() : null,
    }
  }

  // Count total upcoming. Listen bruger samme danske dato som tælleren.
  const dayOf = (iso: string) => copenhagenParts(iso).date
  const upcomingTasks = upcomingInspections(tasks, today)
  const upcomingCount = upcomingTasks.length
  const shownUpcoming = upcomingTasks.slice(0, 10)
  const overdueCount = tasks.filter((t) => t.due_date && dayOf(t.due_date) < today && t.status !== 'done').length

  return (
    <div className="space-y-6">
      {loadNote}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 min-w-0">
            <CalendarCheck className="w-7 h-7 text-blue-600 shrink-0" />
            <span className="break-words min-w-0" data-testid="calendar-page-title">Kalender — Besigtigelser</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1 break-words min-w-0" data-testid="calendar-header-count">
            {upcomingCount} kommende{overdueCount > 0 ? ` · ${overdueCount} overskredet` : ''}
          </p>
        </div>
        <button
          onClick={goToToday}
          className="min-h-[44px] px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-50 transition-colors"
          data-testid="calendar-go-today"
        >
          I dag
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm">
          {/* Month Navigation */}
          <div className="flex items-center justify-between p-4 border-b">
            <button type="button" onClick={prevMonth} aria-label="Forrige måned" className="min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold break-words min-w-0 text-center" data-testid="calendar-month-heading">{MONTH_NAMES[month]} {year}</h2>
            <button type="button" onClick={nextMonth} aria-label="Næste måned" className="min-h-[44px] min-w-[44px] p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name} className="py-2 text-center text-xs font-medium text-gray-500 uppercase break-words min-w-0" data-testid="calendar-weekday-name">
                {name}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((cell, i) => {
              if (!cell) {
                return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r bg-gray-50/50" />
              }

              const { day, dateKey } = cell
              const dayTasks = tasksByDate[dateKey] || []
              const isToday = dateKey === today
              const isSelected = dateKey === selectedDate
              const isPast = dateKey < today
              const hasOverdue = dayTasks.some((t) => t.status !== 'done') && isPast

              return (
                <div
                  key={dateKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDate(dateKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDate(dateKey)
                    }
                  }}
                  aria-label={`Vælg ${dateKey}`}
                  aria-pressed={isSelected}
                  className={`min-h-[80px] border-b border-r p-1.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : isPast ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    {day}
                  </div>
                  {dayTasks.slice(0, 3).map((task) => {
                    const isConfirmed = task.status === 'in_progress' && task.description?.includes('BEKRÆFTET')
                    return (
                      <div
                        key={task.id}
                        className={`text-[10px] leading-tight px-1 py-0.5 rounded mb-0.5 truncate ${
                          task.status === 'done'
                            ? 'bg-green-100 text-green-700'
                            : isConfirmed
                            ? 'bg-green-100 text-green-700'
                            : hasOverdue
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                        title={`${task.title}${isConfirmed ? ' ✓ Bekræftet' : ''}`}
                      >
                        {isConfirmed ? '✓ ' : ''}{task.auto_rule === ASSISTANT_RULE.callback || task.auto_rule === ASSISTANT_RULE.missedCall ? '📞 ' : task.auto_rule === ASSISTANT_RULE.reminder ? '⏰ ' : task.auto_rule === ASSISTANT_RULE.appointment ? '📅 ' : ''}{task.customer?.company_name || task.title}
                      </div>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-400 break-words min-w-0" data-testid="calendar-day-more">+{dayTasks.length - 3} mere</div>
                  )}
                  {(remindersByDate[dateKey] ?? []).slice(0, 2).map((r) => (
                    <div
                      key={r.id}
                      data-testid="calendar-personal-reminder"
                      className={`text-[10px] leading-tight px-1 py-0.5 rounded mb-0.5 truncate ${r.status === 'done' ? 'bg-gray-100 text-gray-500 line-through' : 'bg-amber-100 text-amber-800'}`}
                      title={`Min påmindelse: ${r.title}`}
                    >
                      ⏰ {r.title}
                    </div>
                  ))}
                  {(remindersByDate[dateKey]?.length ?? 0) > 2 && (
                    <div className="text-[10px] text-amber-700 break-words min-w-0" data-testid="calendar-day-more-reminders">+{(remindersByDate[dateKey]?.length ?? 0) - 2} påmindelser</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Side Panel — Selected Day Details */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900 break-words min-w-0" data-testid="calendar-day-heading">
              {calendarDayHeading(selectedDate)}
            </h3>
            {dayTaskCount && (
              <p className="mt-1 text-xs text-gray-600 break-words" data-testid="calendar-day-task-count">{dayTaskCount}</p>
            )}
          </div>

          {selectedDate && (remindersByDate[selectedDate]?.length ?? 0) > 0 && (
            <div className="px-4 pt-4" data-testid="calendar-day-reminders">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 break-words min-w-0" data-testid="calendar-reminders-heading">Mine påmindelser</h4>
              <p className="text-xs text-gray-600 break-words min-w-0 mb-2" data-testid="calendar-day-reminder-count">{dayReminderCountText(remindersByDate[selectedDate]!.length)}</p>
              <ul className="space-y-1 mb-2">
                {remindersByDate[selectedDate]!.map((r) => (
                  <li key={r.id} className={`text-sm break-words min-w-0 ${r.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    ⏰ {copenhagenParts(r.due_at).clock} {r.title}
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/tasks" className="text-xs text-blue-600 hover:underline break-words min-w-0" data-testid="calendar-day-reminder-link">Ret under Opgaver → Mine påmindelser</Link>
            </div>
          )}
          <div className="p-4">
            {!selectedDate ? (
              <p className="text-sm text-gray-500 text-center py-8 break-words min-w-0" data-testid="calendar-pick-day">
                Klik på en dag for at se besigtigelser og opkald
              </p>
            ) : selectedTasks.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8 break-words min-w-0" data-testid="calendar-empty-day">
                Ingen besigtigelser eller opkald denne dag
              </p>
            ) : (
              <div className="space-y-3">
                {selectedTasks.map((task) => {
                  const info = extractInfo(task.description)
                  const statusConf = TASK_STATUS_CONFIG[task.status]
                  const priorityConf = TASK_PRIORITY_CONFIG[task.priority]

                  return (
                    <div key={task.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-gray-900 leading-tight break-words min-w-0">
                          {task.customer?.company_name || task.title}
                        </p>
                        <span className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${statusConf.bgColor} ${statusConf.color}`}>
                          {statusConf.label}
                        </span>
                      </div>

                      {info.time && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="break-words min-w-0" data-testid="calendar-day-time">{info.time}</span>
                        </div>
                      )}

                      {info.address && (
                        <div className="flex items-start gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="break-words min-w-0">{info.address}</span>
                        </div>
                      )}

                      {info.address && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(info.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors break-words min-w-0"
                          data-testid="calendar-day-route"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Åbn rutevejledning
                        </a>
                      )}

                      {task.status === 'in_progress' && task.description?.includes('BEKRÆFTET') && (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium min-w-0">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span className="break-words min-w-0" data-testid="calendar-day-confirmed">Bekræftet af kunden</span>
                        </div>
                      )}

                      {task.assigned_profile ? (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
                          <User className="w-3.5 h-3.5" />
                          <span className="break-words min-w-0" data-testid="calendar-day-assignee">{task.assigned_profile.full_name || task.assigned_profile.email}</span>
                        </div>
                      ) : namesFailed && task.assigned_to ? (
                        <div className="flex items-center gap-1.5 text-xs text-red-700">
                          <User className="w-3.5 h-3.5" />
                          Navn kunne ikke hentes
                        </div>
                      ) : null}

                      {task.customer && (
                        <Link
                          href={`/dashboard/customers/${task.customer.id}`}
                          className="block text-xs text-blue-600 hover:underline mt-1 break-words min-w-0"
                          data-testid="calendar-day-customer-link"
                        >
                          Gå til kundekort →
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Upcoming list below */}
          <div className="border-t p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Kommende besigtigelser</h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {shownUpcoming.map((task) => {
                  const info = extractInfo(task.description)
                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        if (task.due_date) {
                          const d = new Date(task.due_date)
                          setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1))
                          setSelectedDate(copenhagenParts(task.due_date).date)
                        }
                      }}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="w-10 text-center shrink-0">
                        <div className="text-lg font-bold text-gray-900 leading-none">
                          {task.due_date ? new Date(task.due_date).getDate() : '?'}
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase">
                          {task.due_date
                            ? new Date(task.due_date).toLocaleDateString('da-DK', { month: 'short' })
                            : ''}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 break-words">
                          {task.customer?.company_name || task.title}
                        </p>
                        {info.time && (
                          <p className="text-xs text-gray-500 break-words min-w-0" data-testid="calendar-upcoming-time">{info.time}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              {upcomingCount === 0 && (
                <p className="text-xs text-gray-400 text-center py-4 break-words min-w-0" data-testid="calendar-upcoming-empty">Ingen kommende besigtigelser. Book dem fra kunden eller sagen.</p>
              )}
              {upcomingTasks.length > shownUpcoming.length && (
                <p className="text-xs text-gray-500 text-center pt-2 break-words min-w-0" data-testid="calendar-upcoming-count">
                  Viser {shownUpcoming.length} af {upcomingTasks.length}. Resten ligger i månedskalenderen.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
