'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, MapPin, Clock, User, Navigation, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useRealtimeTable } from '@/lib/hooks/use-realtime'
import { TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '@/types/customer-tasks.types'
import type { CustomerTaskWithRelations } from '@/types/customer-tasks.types'

interface CalendarPageClientProps {
  tasks: CustomerTaskWithRelations[]
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

export function CalendarPageClient({ tasks: initialTasks }: CalendarPageClientProps) {
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
        const dateKey = task.due_date.slice(0, 10)
        if (!map[dateKey]) map[dateKey] = []
        map[dateKey].push(task)
      }
    }
    return map
  }, [tasks])

  const today = new Date().toISOString().slice(0, 10)

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

  // Count total upcoming
  const upcomingCount = tasks.filter((t) => t.due_date && t.due_date >= today && t.status !== 'done').length
  const overdueCount = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== 'done').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="w-7 h-7 text-blue-600" />
            Kalender — Besigtigelser
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {upcomingCount} kommende{overdueCount > 0 ? ` · ${overdueCount} overskredet` : ''}
          </p>
        </div>
        <button
          onClick={goToToday}
          className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-gray-50 transition-colors"
        >
          I dag
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm">
          {/* Month Navigation */}
          <div className="flex items-center justify-between p-4 border-b">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name} className="py-2 text-center text-xs font-medium text-gray-500 uppercase">
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
                  onClick={() => setSelectedDate(dateKey)}
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
                        {isConfirmed ? '✓ ' : ''}{task.customer?.company_name || task.title}
                      </div>
                    )
                  })}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-400">+{dayTasks.length - 3} mere</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Side Panel — Selected Day Details */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900">
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('da-DK', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })
                : 'Vælg en dag'}
            </h3>
          </div>

          <div className="p-4">
            {!selectedDate ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Klik på en dag for at se besigtigelser
              </p>
            ) : selectedTasks.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Ingen besigtigelser denne dag
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
                        <p className="font-medium text-sm text-gray-900 leading-tight">
                          {task.customer?.company_name || task.title}
                        </p>
                        <span className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${statusConf.bgColor} ${statusConf.color}`}>
                          {statusConf.label}
                        </span>
                      </div>

                      {info.time && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Clock className="w-3.5 h-3.5" />
                          {info.time}
                        </div>
                      )}

                      {info.address && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3.5 h-3.5" />
                          {info.address}
                        </div>
                      )}

                      {info.address && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(info.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Åbn rutevejledning
                        </a>
                      )}

                      {task.status === 'in_progress' && task.description?.includes('BEKRÆFTET') && (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Bekræftet af kunden
                        </div>
                      )}

                      {task.assigned_profile && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <User className="w-3.5 h-3.5" />
                          {task.assigned_profile.full_name || task.assigned_profile.email}
                        </div>
                      )}

                      {task.customer && (
                        <Link
                          href={`/dashboard/customers/${task.customer.id}`}
                          className="block text-xs text-blue-600 hover:underline mt-1"
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
              {tasks
                .filter((t) => t.due_date && t.due_date >= today && t.status !== 'done')
                .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                .slice(0, 10)
                .map((task) => {
                  const info = extractInfo(task.description)
                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        if (task.due_date) {
                          const d = new Date(task.due_date)
                          setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1))
                          setSelectedDate(task.due_date.slice(0, 10))
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
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {task.customer?.company_name || task.title}
                        </p>
                        {info.time && (
                          <p className="text-xs text-gray-500">{info.time}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              {upcomingCount === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Ingen kommende besigtigelser</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
