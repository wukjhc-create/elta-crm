'use client'

/**
 * RISK ASSESSMENT PANEL
 *
 * Displays identified risks for a calculation/project:
 * - Technical risks
 * - Time uncertainties
 * - Legal/safety caveats
 * - Margin recommendations
 *
 * Part of Phase D AI Intelligence layer.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { analyzeRisksAction, getMarginRecommendationAction } from '@/lib/actions/ai-intelligence'
import type { RiskAnalysisInput, RiskAnalysisResult, RiskAssessmentCreate, RiskCategory, RiskSeverity } from '@/types/ai-intelligence.types'
import {
  AlertTriangle,
  Shield,
  Clock,
  Scale,
  Wrench,
  DoorOpen,
  FileText,
  Package,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
  XCircle,
  CheckCircle,
  DollarSign,
  Loader2,
  RefreshCw,
} from 'lucide-react'

interface RiskAssessmentPanelProps {
  input: RiskAnalysisInput
  onRisksAnalyzed?: (result: RiskAnalysisResult) => void
  autoAnalyze?: boolean
  showMarginRecommendation?: boolean
  className?: string
}

const CATEGORY_CONFIG: Record<RiskCategory, { label: string; icon: React.ReactNode; color: string }> = {
  technical: { label: 'Teknisk', icon: <Wrench className="h-4 w-4" />, color: 'text-blue-600' },
  time: { label: 'Tid', icon: <Clock className="h-4 w-4" />, color: 'text-orange-600' },
  legal: { label: 'Lovkrav', icon: <Scale className="h-4 w-4" />, color: 'text-purple-600' },
  safety: { label: 'Sikkerhed', icon: <Shield className="h-4 w-4" />, color: 'text-red-600' },
  margin: { label: 'Margin', icon: <DollarSign className="h-4 w-4" />, color: 'text-green-600' },
  scope: { label: 'Scope', icon: <FileText className="h-4 w-4" />, color: 'text-gray-600' },
  access: { label: 'Adgang', icon: <DoorOpen className="h-4 w-4" />, color: 'text-yellow-600' },
  material: { label: 'Materialer', icon: <Package className="h-4 w-4" />, color: 'text-cyan-600' },
}

const SEVERITY_CONFIG: Record<RiskSeverity, { label: string; icon: React.ReactNode; bgColor: string; textColor: string }> = {
  info: { label: 'Info', icon: <Info className="h-4 w-4" />, bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  low: { label: 'Lav', icon: <CheckCircle className="h-4 w-4" />, bgColor: 'bg-green-50', textColor: 'text-green-700' },
  medium: { label: 'Medium', icon: <AlertTriangle className="h-4 w-4" />, bgColor: 'bg-yellow-50', textColor: 'text-yellow-700' },
  high: { label: 'Høj', icon: <AlertCircle className="h-4 w-4" />, bgColor: 'bg-orange-50', textColor: 'text-orange-700' },
  critical: { label: 'Kritisk', icon: <XCircle className="h-4 w-4" />, bgColor: 'bg-red-50', textColor: 'text-red-700' },
}

function RiskCard({ risk, isExpanded, onToggle }: {
  risk: RiskAssessmentCreate
  isExpanded: boolean
  onToggle: () => void
}) {
  const categoryConfig = CATEGORY_CONFIG[risk.category]
  const severityConfig = SEVERITY_CONFIG[risk.severity]

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className={`rounded-lg border ${severityConfig.bgColor} p-3`}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className={severityConfig.textColor}>{severityConfig.icon}</span>
                <div>
                  <div className="font-medium text-sm">{risk.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      <span className={categoryConfig.color}>{categoryConfig.icon}</span>
                      <span className="ml-1">{categoryConfig.label}</span>
                    </Badge>
                    <Badge className={`text-xs ${severityConfig.bgColor} ${severityConfig.textColor} border-0`}>
                      {severityConfig.label}
                    </Badge>
                    {risk.show_to_customer && (
                      <Badge variant="secondary" className="text-xs">Vis til kunde</Badge>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2 text-sm">
            <p className="text-muted-foreground">{risk.description}</p>

            {risk.recommendation && (
              <div className="bg-white/50 rounded p-2">
                <span className="font-medium">Anbefaling: </span>
                {risk.recommendation}
              </div>
            )}

            {risk.customer_message && (
              <div className="bg-white/50 rounded p-2 text-green-700">
                <span className="font-medium">Kundebesked: </span>
                {risk.customer_message}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function RiskAssessmentPanel({
  input,
  onRisksAnalyzed,
  autoAnalyze = false,
  showMarginRecommendation = true,
  className,
}: RiskAssessmentPanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<RiskAnalysisResult | null>(null)
  const [marginRec, setMarginRec] = useState<{ minimumMargin: number; recommendedMargin: number; reason: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedRisks, setExpandedRisks] = useState<Set<number>>(new Set())

  const analyze = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [riskResponse, marginResponse] = await Promise.all([
        analyzeRisksAction(input),
        showMarginRecommendation ? getMarginRecommendationAction(input) : Promise.resolve(null),
      ])

      if (riskResponse.success) {
        setResult(riskResponse.data)
        onRisksAnalyzed?.(riskResponse.data)

        // Auto-expand high/critical risks
        const critical = riskResponse.data.risks
          .map((r, i) => r.severity === 'critical' || r.severity === 'high' ? i : -1)
          .filter(i => i >= 0)
        setExpandedRisks(new Set(critical))
      } else {
        setError(riskResponse.error)
      }

      if (marginResponse) {
        setMarginRec(marginResponse)
      }
    } catch (err) {
      setError('Der opstod en fejl ved risikoanalyse')
      console.error('Risk analysis error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (autoAnalyze) {
      analyze()
    }
  }, [autoAnalyze]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRisk = (index: number) => {
    setExpandedRisks(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const getRiskLevelColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'high': return 'bg-red-100 text-red-800'
    }
  }

  const getRiskLevelIcon = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low': return <CheckCircle className="h-4 w-4" />
      case 'medium': return <AlertTriangle className="h-4 w-4" />
      case 'high': return <XCircle className="h-4 w-4" />
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Risikoanalyse
            </CardTitle>
            <CardDescription>
              Identificerede risici og anbefalinger
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={analyze}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && !result && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Analyserer risici...
          </div>
        )}

        {/* No analysis yet */}
        {!isLoading && !result && !error && (
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">Klik for at analysere projektets risici</p>
            <Button onClick={analyze}>
              <Shield className="h-4 w-4 mr-2" />
              Analysér risici
            </Button>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Overall risk level */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="font-medium">Samlet risikoniveau</span>
              <Badge className={getRiskLevelColor(result.overall_risk_level)}>
                {getRiskLevelIcon(result.overall_risk_level)}
                <span className="ml-1 capitalize">{result.overall_risk_level}</span>
              </Badge>
            </div>

            {/* Margin recommendation */}
            {showMarginRecommendation && marginRec && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 font-medium text-green-800">
                  <DollarSign className="h-4 w-4" />
                  Marginanbefaling
                </div>
                <div className="mt-2 text-sm text-green-700">
                  <p>Minimum: {marginRec.minimumMargin}% | Anbefalet: {marginRec.recommendedMargin}%</p>
                  <p className="text-xs mt-1 text-green-600">{marginRec.reason}</p>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Anbefalinger</h4>
                <ul className="space-y-1 text-sm">
                  {result.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risk list */}
            {result.risks.length > 0 ? (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Identificerede risici ({result.risks.length})</h4>
                {result.risks.map((risk, idx) => (
                  <RiskCard
                    key={idx}
                    risk={risk}
                    isExpanded={expandedRisks.has(idx)}
                    onToggle={() => toggleRisk(idx)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-green-600">
                <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                <p className="font-medium">Ingen væsentlige risici identificeret</p>
              </div>
            )}

            {/* Customer-visible risks summary */}
            {result.customer_visible_risks.length > 0 && (
              <div className="pt-3 border-t">
                <h4 className="font-medium text-sm mb-2">OBS-punkter til kunde ({result.customer_visible_risks.length})</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.customer_visible_risks.map((risk, idx) => (
                    <li key={idx}>• {risk.customer_message || risk.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Compact risk indicator for use in headers/summaries
 */
export function RiskIndicator({ level, count }: { level: 'low' | 'medium' | 'high'; count: number }) {
  const colors = {
    low: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-red-100 text-red-700 border-red-200',
  }

  const icons = {
    low: <CheckCircle className="h-3 w-3" />,
    medium: <AlertTriangle className="h-3 w-3" />,
    high: <AlertCircle className="h-3 w-3" />,
  }

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${colors[level]}`}>
      {icons[level]}
      <span>{count} risici</span>
    </div>
  )
}
