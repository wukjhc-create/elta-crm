import Link from 'next/link'
import {
  Network,
  Building2,
  Sliders,
  ChevronRight,
  Calculator,
  Settings2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBuildingProfiles, getGlobalFactors, getKalkiaNodes } from '@/lib/actions/kalkia'

export const metadata = {
  title: 'Kalkia Indstillinger | ELTA CRM',
  description: 'Konfigurer Kalkia kalkulationssystemet',
}

export default async function KalkiaSettingsPage() {
  const [nodesResult, profilesResult, factorsResult] = await Promise.all([
    getKalkiaNodes({ is_active: true }),
    getBuildingProfiles(),
    getGlobalFactors(),
  ])

  const nodeCount = nodesResult.success && nodesResult.data ? nodesResult.data.length : 0
  const profileCount = profilesResult.success && profilesResult.data ? profilesResult.data.length : 0
  const factorCount = factorsResult.success && factorsResult.data ? factorsResult.data.length : 0

  const sections = [
    {
      title: 'Komponenttrae',
      description: 'Administrer hierarkisk komponentbibliotek med noder, varianter og materialer',
      href: '/dashboard/settings/kalkia/nodes',
      icon: Network,
      stat: `${nodeCount} noder`,
      color: 'bg-blue-100 text-blue-600',
    },
    {
      title: 'Bygningsprofiler',
      description: 'Konfigurer tidsmultiplikatorer og spildfaktorer for forskellige bygningstyper',
      href: '/dashboard/settings/kalkia/profiles',
      icon: Building2,
      stat: `${profileCount} profiler`,
      color: 'bg-green-100 text-green-600',
    },
    {
      title: 'Globale Faktorer',
      description: 'Juster indirekte tid, personlig tid, overhead og spildfaktorer',
      href: '/dashboard/settings/kalkia/factors',
      icon: Sliders,
      stat: `${factorCount} faktorer`,
      color: 'bg-purple-100 text-purple-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
          <Calculator className="w-6 h-6 text-yellow-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Kalkia Indstillinger</h1>
          <p className="text-gray-600 mt-1">
            Konfigurer det professionelle kalkulationssystem
          </p>
        </div>
      </div>

      {/* Quick Action Card */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-0">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Kalkia Pro Kalkulator</h2>
              <p className="text-blue-100 mt-1">
                Start en ny professionel kalkulation med komponentbiblioteket
              </p>
            </div>
            <Link href="/dashboard/calculations/kalkia">
              <Button variant="secondary" size="lg">
                Start kalkulation
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Settings2 className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-900">Kalkia Beregningsmotor</p>
              <p className="text-sm text-yellow-700 mt-1">
                Kalkia er et professionelt kalkulationssystem med hierarkisk komponentstruktur,
                bygningsprofiler og avancerede prisfaktorer. Systemet beregner automatisk
                indirekte tid, spild, overhead og noegletal som DB og DB/time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Sections */}
      <div className="grid gap-4">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg ${section.color} flex items-center justify-center`}>
                      <section.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{section.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{section.stat}</span>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Aktive Noder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nodeCount}</div>
            <p className="text-xs text-gray-500">operationer og grupper</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Bygningsprofiler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{profileCount}</div>
            <p className="text-xs text-gray-500">konfigurerede profiler</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Globale Faktorer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{factorCount}</div>
            <p className="text-xs text-gray-500">aktive beregningsfaktorer</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
