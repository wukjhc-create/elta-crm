'use client'

/**
 * INTELLIGENCE DEMO CLIENT
 *
 * Demonstrates all Phase D AI Intelligence features:
 * - Project Intake (text-to-structure parsing)
 * - Risk Assessment (automated risk detection)
 * - Price Explanation (customer-facing breakdown)
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ProjectIntakePanel } from '@/components/modules/kalkia/ProjectIntakePanel'
import { RiskAssessmentPanel } from '@/components/modules/kalkia/RiskAssessmentPanel'
import { PriceExplanationCard } from '@/components/modules/kalkia/PriceExplanationCard'
import type { ProjectIntakeResult, RiskAnalysisInput, PriceExplanationInput } from '@/types/ai-intelligence.types'
import {
  Sparkles,
  Shield,
  DollarSign,
  Lightbulb,
  ArrowRight,
  CheckCircle,
  Zap,
} from 'lucide-react'

// Demo calculation data for price explanation
const DEMO_CALCULATION: PriceExplanationInput = {
  labor_cost: 12500,
  material_cost: 8750,
  total_price: 26500,
  margin_percentage: 25,
  components: [
    { name: 'Dobbelt stikkontakt', quantity: 8, price: 2400 },
    { name: 'Enkelt afbryder', quantity: 4, price: 1200 },
    { name: 'LED loftspot', quantity: 6, price: 3600 },
    { name: 'Loftudtag med pendel', quantity: 2, price: 1200 },
    { name: 'USB stikkontakt', quantity: 2, price: 1600 },
    { name: 'Eltavle opdatering', quantity: 1, price: 3500 },
  ],
  rooms: ['Køkken', 'Stue', 'Soveværelse', 'Bad'],
  project_type: 'renovation',
  building_type: 'house',
}

export function IntelligenceDemoClient() {
  const [parsedContext, setParsedContext] = useState<ProjectIntakeResult['context'] | null>(null)
  const [showRiskAnalysis, setShowRiskAnalysis] = useState(false)
  const [showPriceExplanation, setShowPriceExplanation] = useState(false)

  // Build risk analysis input from parsed context
  const riskInput: RiskAnalysisInput = parsedContext
    ? {
        building_type: parsedContext.building_type || undefined,
        building_age_years: parsedContext.building_age_years || undefined,
        rooms: parsedContext.detected_rooms?.map(r => r.room_type) || [],
        component_count: parsedContext.detected_components?.length || 0,
        has_bathroom_work: parsedContext.detected_rooms?.some(r => r.room_type === 'BATHROOM'),
        has_outdoor_work: parsedContext.detected_rooms?.some(r => r.room_type === 'OUTDOOR'),
        margin_percentage: 25,
        total_price: 26500,
      }
    : {
        building_type: 'house',
        building_age_years: 45,
        rooms: ['KITCHEN', 'LIVING', 'BEDROOM', 'BATHROOM'],
        component_count: 15,
        has_bathroom_work: true,
        margin_percentage: 25,
        total_price: 26500,
      }

  return (
    <div className="space-y-8">
      {/* Feature overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="h-5 w-5 text-purple-600" />
              </div>
              <CardTitle className="text-base">Project Intake</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Beskriv projektet med ord, og lad systemet foreslå rum, komponenter og jobs automatisk.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle className="text-base">Risk Assessment</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Automatisk identifikation af tekniske risici, tidusikkerhed og margin-anbefalinger.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle className="text-base">Price Explanation</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Kundevenlig prisforklaring med fordeling, inkluderet arbejde og garantier.
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Main demo area */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column: Project Intake */}
        <div className="space-y-6">
          <ProjectIntakePanel
            onContextParsed={(context) => {
              setParsedContext(context)
              setShowRiskAnalysis(true)
            }}
          />

          {/* Parsed context display */}
          {parsedContext && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-base">Kontekst gemt</CardTitle>
                </div>
                <CardDescription>
                  Projektkonteksten er klar til brug i kalkulationen
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {parsedContext.project_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Projekttype:</span>
                    <Badge variant="outline">{parsedContext.project_type}</Badge>
                  </div>
                )}
                {parsedContext.building_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bygningstype:</span>
                    <Badge variant="outline">{parsedContext.building_type}</Badge>
                  </div>
                )}
                {parsedContext.urgency_level && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hastegrad:</span>
                    <Badge variant="outline">{parsedContext.urgency_level}</Badge>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sikkerhed:</span>
                  <Badge variant={(parsedContext.overall_confidence ?? 0) > 0.7 ? 'default' : 'secondary'}>
                    {Math.round((parsedContext.overall_confidence ?? 0) * 100)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tips card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <CardTitle className="text-base">Tips til bedre resultater</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Prøv at beskrive:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Antal og type rum (f.eks. "3 soveværelser, 2 badeværelser")</li>
                <li>Bygningens alder (f.eks. "hus fra 1970" eller "45 år gammelt")</li>
                <li>Specifikke ønsker (f.eks. "nye stikkontakter i køkkenet")</li>
                <li>Projekttype (f.eks. "renovering" eller "nybyggeri")</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Risk + Price */}
        <div className="space-y-6">
          {/* Risk Assessment */}
          <div className={showRiskAnalysis ? '' : 'opacity-60'}>
            <RiskAssessmentPanel
              input={riskInput}
              autoAnalyze={showRiskAnalysis}
              showMarginRecommendation={true}
            />
          </div>

          {/* Price Explanation */}
          <div className={showPriceExplanation ? '' : 'opacity-60'}>
            <PriceExplanationCard
              input={DEMO_CALCULATION}
              autoGenerate={false}
              showTabs={true}
              showBulletSummary={true}
            />
          </div>

          {/* Demo controls */}
          {!showPriceExplanation && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setShowPriceExplanation(true)}
              >
                <Zap className="h-4 w-4 mr-2" />
                Vis prisforklaring demo
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Architecture info */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Arkitektur Information</CardTitle>
          <CardDescription>Phase D: AI-Assisted Project & Offer Intelligence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-1">Engines</h4>
              <ul className="text-muted-foreground space-y-0.5">
                <li>• project-intake.ts</li>
                <li>• risk-engine.ts</li>
                <li>• offer-text-engine.ts</li>
                <li>• price-explanation-engine.ts</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">Database</h4>
              <ul className="text-muted-foreground space-y-0.5">
                <li>• project_contexts</li>
                <li>• calculation_snapshots</li>
                <li>• risk_assessments</li>
                <li>• price_explanations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">Komponenter</h4>
              <ul className="text-muted-foreground space-y-0.5">
                <li>• ProjectIntakePanel</li>
                <li>• RiskAssessmentPanel</li>
                <li>• PriceExplanationCard</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">AI-klar</h4>
              <ul className="text-muted-foreground space-y-0.5">
                <li>• ai_prompt_templates</li>
                <li>• project_keywords</li>
                <li>• risk_detection_rules</li>
                <li>• offer_generation_log</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
