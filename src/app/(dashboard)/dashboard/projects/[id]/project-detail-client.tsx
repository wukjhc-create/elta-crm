'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  User,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Plus,
  ListTodo,
  Timer,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { getProject, deleteProject, getProjectTasks, getProjectTimeEntries } from '@/lib/actions/projects'
import { ProjectStatusBadge, ProjectPriorityBadge } from '@/components/modules/projects/project-status-badge'
import { ProjectForm } from '@/components/modules/projects/project-form'
import { TaskBoard } from '@/components/modules/projects/task-board'
import { TimeEntriesList } from '@/components/modules/projects/time-entries-list'
import { TimeEntryForm } from '@/components/modules/projects/time-entry-form'
import { CalculationFeedback } from '@/components/modules/projects/calculation-feedback'
import { ProjectActivityTimeline } from '@/components/modules/projects/project-activity-timeline'
import { useToast } from '@/components/ui/toast'
import type { ProjectWithRelations, ProjectTaskWithRelations, TimeEntryWithRelations } from '@/types/projects.types'

interface ProjectDetailClientProps {
  projectId: string
}

type TabType = 'overview' | 'tasks' | 'time' | 'activity'

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [project, setProject] = useState<ProjectWithRelations | null>(null)
  const [tasks, setTasks] = useState<ProjectTaskWithRelations[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [projectResult, tasksResult, timeResult] = await Promise.all([
        getProject(projectId),
        getProjectTasks(projectId),
        getProjectTimeEntries(projectId),
      ])

      if (projectResult.success && projectResult.data) {
        setProject(projectResult.data)
      }
      if (tasksResult.success && tasksResult.data) {
        setTasks(tasksResult.data)
      }
      if (timeResult.success && timeResult.data) {
        setTimeEntries(timeResult.data)
      }
    } catch (error) {
      console.error('Failed to load project:', error)
      toast.error('Kunne ikke hente projektdata')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async () => {
    if (!project) return
    if (!confirm('Er du sikker på at du vil slette dette projekt? Alle opgaver og tidsregistreringer slettes også.')) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteProject(project.id)
      if (result.success) {
        toast.success('Projekt slettet')
        router.push('/dashboard/projects')
      } else {
        toast.error('Kunne ikke slette projekt', result.error)
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Der opstod en fejl ved sletning')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatBudget = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/projects" className="p-2 hover:bg-muted rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded mt-2" />
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/projects" className="p-2 hover:bg-muted rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Projekt ikke fundet</h1>
          </div>
        </div>
      </div>
    )
  }

  const progress = project.estimated_hours
    ? Math.round((project.actual_hours / project.estimated_hours) * 100)
    : null
  const isOverTime = progress !== null && progress > 100
  const isOverBudget = project.budget && project.actual_cost > project.budget

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/projects" className="p-2 hover:bg-muted rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.project_number}</h1>
              <ProjectStatusBadge status={project.status} />
              <ProjectPriorityBadge priority={project.priority} />
            </div>
            <p className="text-lg text-muted-foreground">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditForm(true)}
            className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-muted"
          >
            <Pencil className="w-4 h-4" />
            Rediger
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Sletter...' : 'Slet'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-4 h-4" />
            Oversigt
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'tasks'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            Opgaver
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('time')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'time'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Timer className="w-4 h-4" />
            Tidsregistrering
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
              {timeEntries.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'activity'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-4 h-4" />
            Aktivitet
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {project.description && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium mb-2">Beskrivelse</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {project.description}
                </p>
              </div>
            )}

            {/* Progress Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Hours */}
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Timer</span>
                </div>
                <div className={`text-2xl font-bold ${isOverTime ? 'text-red-600' : ''}`}>
                  {project.actual_hours}t
                  {project.estimated_hours && (
                    <span className="text-muted-foreground font-normal">
                      {' / '}{project.estimated_hours}t
                    </span>
                  )}
                </div>
                {progress !== null && (
                  <div className="mt-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isOverTime ? 'bg-red-500' : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${isOverTime ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {progress}% forbrugt
                    </p>
                  </div>
                )}
              </div>

              {/* Budget */}
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm font-medium">Budget</span>
                </div>
                <div className={`text-2xl font-bold ${isOverBudget ? 'text-red-600' : ''}`}>
                  {formatBudget(project.actual_cost)}
                  {project.budget && (
                    <span className="text-muted-foreground font-normal">
                      {' / '}{formatBudget(project.budget)}
                    </span>
                  )}
                </div>
                {project.budget && (
                  <div className="mt-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isOverBudget ? 'bg-red-500' : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min((project.actual_cost / project.budget) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${isOverBudget ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {Math.round((project.actual_cost / project.budget) * 100)}% forbrugt
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {project.notes && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium mb-2">Interne noter</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {project.notes}
                </p>
              </div>
            )}

            {/* Calculation Feedback */}
            {(project.status === 'completed' || project.actual_hours > 0) && (
              <CalculationFeedback
                projectId={project.id}
                offerId={project.offer_id}
                estimatedHours={project.estimated_hours}
                actualHours={project.actual_hours}
                budget={project.budget}
                actualCost={project.actual_cost}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Customer */}
            {project.customer && (
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <Building2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Kunde</span>
                </div>
                <Link
                  href={`/dashboard/customers/${project.customer.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {project.customer.company_name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {project.customer.customer_number}
                </p>
                {project.customer.contact_person && (
                  <p className="text-sm mt-2">{project.customer.contact_person}</p>
                )}
                {project.customer.email && (
                  <p className="text-sm text-muted-foreground">{project.customer.email}</p>
                )}
              </div>
            )}

            {/* Offer */}
            {project.offer && (
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">Tilbud</span>
                </div>
                <Link
                  href={`/dashboard/offers/${project.offer.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {project.offer.offer_number}
                </Link>
                <p className="text-sm text-muted-foreground">{project.offer.title}</p>
              </div>
            )}

            {/* Project Manager */}
            {project.project_manager && (
              <div className="bg-white border rounded-lg p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <User className="w-4 h-4" />
                  <span className="text-sm font-medium">Projektleder</span>
                </div>
                <p className="font-medium">
                  {project.project_manager.full_name || project.project_manager.email}
                </p>
                {project.project_manager.full_name && (
                  <p className="text-sm text-muted-foreground">
                    {project.project_manager.email}
                  </p>
                )}
              </div>
            )}

            {/* Dates */}
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">Tidsplan</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Startdato:</span>
                  <span>{project.start_date ? formatDate(project.start_date) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slutdato:</span>
                  <span>{project.end_date ? formatDate(project.end_date) : '-'}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">Oprettet:</span>
                  <span>{formatDate(project.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opdateret:</span>
                  <span>{formatDate(project.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="bg-white border rounded-lg p-4">
          <TaskBoard projectId={projectId} tasks={tasks} onRefresh={loadData} />
        </div>
      )}

      {activeTab === 'time' && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Tidsregistreringer</h3>
            <button
              onClick={() => setShowTimeEntryForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              Registrer tid
            </button>
          </div>
          <TimeEntriesList
            projectId={projectId}
            timeEntries={timeEntries}
            tasks={tasks}
            onRefresh={loadData}
          />
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium mb-4">Aktivitetslog</h3>
          <ProjectActivityTimeline tasks={tasks} timeEntries={timeEntries} />
        </div>
      )}

      {/* Edit Form Modal */}
      {showEditForm && (
        <ProjectForm
          project={project}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false)
            loadData()
          }}
        />
      )}

      {/* Time Entry Form Modal */}
      {showTimeEntryForm && (
        <TimeEntryForm
          projectId={projectId}
          tasks={tasks}
          onClose={() => setShowTimeEntryForm(false)}
          onSuccess={() => {
            setShowTimeEntryForm(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}
