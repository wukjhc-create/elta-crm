'use client'

/**
 * PROJECT INTAKE PANEL
 *
 * Allows users to describe a project in plain text and get AI-suggested:
 * - Rooms to add
 * - Components to install
 * - Quick jobs to include
 *
 * Part of Phase D AI Intelligence layer.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseProjectDescriptionAction } from '@/lib/actions/ai-intelligence'
import type { ProjectIntakeInput, ProjectIntakeResult, BuildingType, UrgencyLevel, CustomerPriority } from '@/types/ai-intelligence.types'
import { Loader2, Sparkles, Home, Building, Factory, Building2, CheckCircle, AlertTriangle, Info } from 'lucide-react'

interface ProjectIntakePanelProps {
  onRoomsDetected?: (rooms: ProjectIntakeResult['suggested_rooms']) => void
  onComponentsDetected?: (components: ProjectIntakeResult['suggested_components']) => void
  onJobsDetected?: (jobs: ProjectIntakeResult['suggested_quick_jobs']) => void
  onContextParsed?: (context: ProjectIntakeResult['context']) => void
  className?: string
}

const BUILDING_TYPES: Array<{ value: BuildingType; label: string; icon: React.ReactNode }> = [
  { value: 'house', label: 'Villa/Parcelhus', icon: <Home className="h-4 w-4" /> },
  { value: 'apartment', label: 'Lejlighed', icon: <Building2 className="h-4 w-4" /> },
  { value: 'commercial', label: 'Erhverv', icon: <Building className="h-4 w-4" /> },
  { value: 'industrial', label: 'Industri', icon: <Factory className="h-4 w-4" /> },
]

const URGENCY_LEVELS: Array<{ value: UrgencyLevel; label: string }> = [
  { value: 'low', label: 'Lav' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Haster' },
  { value: 'emergency', label: 'Akut' },
]

const CUSTOMER_PRIORITIES: Array<{ value: CustomerPriority; label: string }> = [
  { value: 'price', label: 'Laveste pris' },
  { value: 'quality', label: 'Bedste kvalitet' },
  { value: 'speed', label: 'Hurtigst muligt' },
  { value: 'warranty', label: 'Længst garanti' },
]

export function ProjectIntakePanel({
  onRoomsDetected,
  onComponentsDetected,
  onJobsDetected,
  onContextParsed,
  className,
}: ProjectIntakePanelProps) {
  const [description, setDescription] = useState('')
  const [buildingType, setBuildingType] = useState<BuildingType | undefined>()
  const [urgency, setUrgency] = useState<UrgencyLevel>('normal')
  const [customerPriority, setCustomerPriority] = useState<CustomerPriority | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ProjectIntakeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleParse = async () => {
    if (!description.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const input: ProjectIntakeInput = {
        description: description.trim(),
        building_type: buildingType,
        urgency,
        customer_priority: customerPriority,
      }

      const response = await parseProjectDescriptionAction(input)

      if (response.success) {
        setResult(response.data)

        // Notify parent components
        if (onRoomsDetected && response.data.suggested_rooms.length > 0) {
          onRoomsDetected(response.data.suggested_rooms)
        }
        if (onComponentsDetected && response.data.suggested_components.length > 0) {
          onComponentsDetected(response.data.suggested_components)
        }
        if (onJobsDetected && response.data.suggested_quick_jobs.length > 0) {
          onJobsDetected(response.data.suggested_quick_jobs)
        }
        if (onContextParsed) {
          onContextParsed(response.data.context)
        }
      } else {
        setError(response.error)
      }
    } catch (err) {
      setError('Der opstod en fejl ved analyse af beskrivelsen')
      console.error('Parse error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800'
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle className="h-3 w-3" />
    if (confidence >= 0.6) return <AlertTriangle className="h-3 w-3" />
    return <Info className="h-3 w-3" />
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Projekt Intake
        </CardTitle>
        <CardDescription>
          Beskriv projektet med ord, og lad systemet foreslå rum, komponenter og jobs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description textarea */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Projektbeskrivelse</label>
          <Textarea
            placeholder="F.eks.: Vi skal have installeret el i et nybygget sommerhus med 3 soveværelser, 2 badeværelser, stort køkkenalrum og stue. Huset er fra 2023 og ca. 150 m2."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Beskriv projektet så detaljeret som muligt - rum, størrelse, bygningens alder, ønsker osv.
          </p>
        </div>

        {/* Context selectors */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bygningstype</label>
            <Select value={buildingType} onValueChange={(v) => setBuildingType(v as BuildingType)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vælg type" />
              </SelectTrigger>
              <SelectContent>
                {BUILDING_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="flex items-center gap-2">
                      {type.icon}
                      {type.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Hastighed</label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as UrgencyLevel)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {URGENCY_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kundens prioritet</label>
            <Select value={customerPriority} onValueChange={(v) => setCustomerPriority(v as CustomerPriority)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vælg" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOMER_PRIORITIES.map((prio) => (
                  <SelectItem key={prio.value} value={prio.value}>
                    {prio.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Parse button */}
        <Button
          onClick={handleParse}
          disabled={isLoading || !description.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyserer...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Analysér beskrivelse
            </>
          )}
        </Button>

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-4 border-t">
            {/* Confidence indicator */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Analyseresultat</span>
              <Badge className={getConfidenceColor(result.confidence)}>
                {getConfidenceIcon(result.confidence)}
                <span className="ml-1">{Math.round(result.confidence * 100)}% sikkerhed</span>
              </Badge>
            </div>

            {/* Parsing notes */}
            {result.parsing_notes.length > 0 && (
              <div className="text-sm text-muted-foreground">
                {result.parsing_notes.join(' • ')}
              </div>
            )}

            {/* Detected rooms */}
            {result.suggested_rooms.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Fundne rum ({result.suggested_rooms.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {result.suggested_rooms.map((room, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className={getConfidenceColor(room.confidence)}
                    >
                      {room.count > 1 ? `${room.count}x ` : ''}{room.room_type}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Detected components */}
            {result.suggested_components.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Foreslåede komponenter ({result.suggested_components.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {result.suggested_components.map((comp, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs"
                    >
                      {comp.quantity}x {comp.component_code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Detected jobs */}
            {result.suggested_quick_jobs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Foreslåede jobs ({result.suggested_quick_jobs.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {result.suggested_quick_jobs.map((job, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-xs"
                    >
                      {job.job_code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Context details */}
            {(result.context.project_type || result.context.building_age_years || result.context.building_size_m2) && (
              <div className="text-sm space-y-1 pt-2 border-t">
                {result.context.project_type && (
                  <p><span className="text-muted-foreground">Projekttype:</span> {result.context.project_type}</p>
                )}
                {result.context.building_age_years && (
                  <p><span className="text-muted-foreground">Bygningens alder:</span> ca. {result.context.building_age_years} år</p>
                )}
                {result.context.building_size_m2 && (
                  <p><span className="text-muted-foreground">Størrelse:</span> ca. {result.context.building_size_m2} m²</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
