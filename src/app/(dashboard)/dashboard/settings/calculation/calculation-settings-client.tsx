'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Clock,
  Percent,
  DollarSign,
  Settings2,
  Save,
  Users,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { CalculationSettings } from '@/types/calculation-settings.types'
import { updateHourlyRate, updateMargin, updateSetting } from '@/lib/actions/calculation-settings'
import { formatCurrency } from '@/lib/utils/format'

interface CalculationSettingsClientProps {
  initialSettings: CalculationSettings | null
}

type TabType = 'hourly_rates' | 'margins' | 'work_hours' | 'defaults'

export default function CalculationSettingsClient({
  initialSettings,
}: CalculationSettingsClientProps) {
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<TabType>('hourly_rates')
  const [settings, setSettings] = useState<CalculationSettings>(
    initialSettings || {
      hourly_rates: { electrician: 495, apprentice: 295, master: 650, helper: 350 },
      margins: { materials: 25, products: 20, subcontractor: 10, default_db_target: 35, minimum_db: 20, db_green_threshold: 35, db_yellow_threshold: 20, db_red_threshold: 10 },
      work_hours: { start: '07:00', end: '15:30', break_minutes: 30, overtime_multiplier: 1.5, weekend_multiplier: 2.0 },
      defaults: { vat_percentage: 25, currency: 'DKK', validity_days: 30, payment_terms_days: 14 },
      labor_types: [],
    }
  )
  const [hasChanges, setHasChanges] = useState(false)

  const tabs = [
    { id: 'hourly_rates' as TabType, label: 'Timepriser', icon: DollarSign },
    { id: 'margins' as TabType, label: 'Avancer', icon: Percent },
    { id: 'work_hours' as TabType, label: 'Arbejdstider', icon: Clock },
    { id: 'defaults' as TabType, label: 'Standarder', icon: Settings2 },
  ]

  const handleSaveHourlyRates = () => {
    startTransition(async () => {
      const results = await Promise.all([
        updateHourlyRate('electrician', settings.hourly_rates.electrician),
        updateHourlyRate('apprentice', settings.hourly_rates.apprentice),
        updateHourlyRate('master', settings.hourly_rates.master),
        updateHourlyRate('helper', settings.hourly_rates.helper),
      ])

      if (results.every(r => r.success)) {
        success('Timepriser gemt')
        setHasChanges(false)
      } else {
        showError('Kunne ikke gemme alle timepriser')
      }
    })
  }

  const handleSaveMargins = () => {
    startTransition(async () => {
      const results = await Promise.all([
        updateMargin('materials', settings.margins.materials),
        updateMargin('products', settings.margins.products),
        updateMargin('subcontractor', settings.margins.subcontractor),
        updateMargin('default_db_target', settings.margins.default_db_target),
        updateMargin('minimum_db', settings.margins.minimum_db),
        updateMargin('db_green_threshold', settings.margins.db_green_threshold),
        updateMargin('db_yellow_threshold', settings.margins.db_yellow_threshold),
        updateMargin('db_red_threshold', settings.margins.db_red_threshold),
      ])

      if (results.every(r => r.success)) {
        success('Avancer gemt')
        setHasChanges(false)
      } else {
        showError('Kunne ikke gemme alle avancer')
      }
    })
  }

  const handleSaveWorkHours = () => {
    startTransition(async () => {
      const results = await Promise.all([
        updateSetting('work_hours_standard', {
          start: settings.work_hours.start,
          end: settings.work_hours.end,
          break_minutes: settings.work_hours.break_minutes,
          label: 'Normal arbejdstid',
        }),
        updateSetting('work_hours_overtime', {
          multiplier: settings.work_hours.overtime_multiplier,
          label: 'Overtid',
        }),
        updateSetting('work_hours_weekend', {
          multiplier: settings.work_hours.weekend_multiplier,
          label: 'Weekend',
        }),
      ])

      if (results.every(r => r.success)) {
        success('Arbejdstider gemt')
        setHasChanges(false)
      } else {
        showError('Kunne ikke gemme arbejdstider')
      }
    })
  }

  const handleSaveDefaults = () => {
    startTransition(async () => {
      const results = await Promise.all([
        updateSetting('default_vat', { percentage: settings.defaults.vat_percentage }),
        updateSetting('default_validity_days', { days: settings.defaults.validity_days }),
        updateSetting('default_payment_terms', {
          days: settings.defaults.payment_terms_days,
          label: `Netto ${settings.defaults.payment_terms_days} dage`,
        }),
      ])

      if (results.every(r => r.success)) {
        success('Standarder gemt')
        setHasChanges(false)
      } else {
        showError('Kunne ikke gemme standarder')
      }
    })
  }

  const handleSave = () => {
    switch (activeTab) {
      case 'hourly_rates':
        handleSaveHourlyRates()
        break
      case 'margins':
        handleSaveMargins()
        break
      case 'work_hours':
        handleSaveWorkHours()
        break
      case 'defaults':
        handleSaveDefaults()
        break
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/settings"
                className="p-2 hover:bg-muted rounded-md"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold">Kalkulationsindstillinger</h1>
                <p className="text-sm text-muted-foreground">
                  Timepriser, avancer og standardværdier
                </p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={isPending || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isPending ? 'Gemmer...' : 'Gem ændringer'}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white border-t border-x text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="max-w-3xl">
          {/* Hourly Rates Tab */}
          {activeTab === 'hourly_rates' && (
            <div className="bg-white rounded-lg border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Timepriser</h2>
                <p className="text-sm text-muted-foreground">
                  Indstil timepriser for forskellige medarbejdertyper
                </p>
              </div>

              <div className="grid gap-6">
                {/* Electrician */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">Elektriker</div>
                      <div className="text-sm text-muted-foreground">Faglært montør</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.hourly_rates.electrician}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          hourly_rates: {
                            ...settings.hourly_rates,
                            electrician: parseInt(e.target.value) || 0,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-28 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">kr/time</span>
                  </div>
                </div>

                {/* Apprentice */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium">Lærling</div>
                      <div className="text-sm text-muted-foreground">Elektrikerlærling</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.hourly_rates.apprentice}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          hourly_rates: {
                            ...settings.hourly_rates,
                            apprentice: parseInt(e.target.value) || 0,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-28 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">kr/time</span>
                  </div>
                </div>

                {/* Master */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-medium">El-installatør</div>
                      <div className="text-sm text-muted-foreground">Mester / projektleder</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.hourly_rates.master}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          hourly_rates: {
                            ...settings.hourly_rates,
                            master: parseInt(e.target.value) || 0,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-28 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">kr/time</span>
                  </div>
                </div>

                {/* Helper */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <Users className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <div className="font-medium">Hjælper</div>
                      <div className="text-sm text-muted-foreground">Ufaglært medhjælper</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.hourly_rates.helper}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          hourly_rates: {
                            ...settings.hourly_rates,
                            helper: parseInt(e.target.value) || 0,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-28 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">kr/time</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Tip:</strong> Timepriserne bruges til automatisk beregning af arbejdsløn
                  i kalkulationer. Standard-typen er &quot;Elektriker&quot;.
                </div>
              </div>
            </div>
          )}

          {/* Margins Tab */}
          {activeTab === 'margins' && (
            <div className="bg-white rounded-lg border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Avancer & Dækningsbidrag</h2>
                <p className="text-sm text-muted-foreground">
                  Indstil standard avancer og dækningsbidrag-mål
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-3">Avancer på materialer</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Materialer</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={settings.margins.materials}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                materials: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-full px-3 py-2 border rounded-md text-right"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Produkter</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={settings.margins.products}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                products: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-full px-3 py-2 border rounded-md text-right"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Underentreprise</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={settings.margins.subcontractor}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                subcontractor: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-full px-3 py-2 border rounded-md text-right"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <hr />

                <div>
                  <h3 className="font-medium mb-3">Dækningsbidrag (DB)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <label className="text-sm font-medium text-green-800">Mål-DB</label>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          value={settings.margins.default_db_target}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                default_db_target: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-24 px-3 py-2 border border-green-300 rounded-md text-right bg-white"
                        />
                        <span className="text-green-700">%</span>
                      </div>
                      <p className="text-xs text-green-700 mt-2">
                        Standard dækningsbidrag-mål for nye kalkulationer
                      </p>
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <label className="text-sm font-medium text-amber-800">Minimum DB</label>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          value={settings.margins.minimum_db}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                minimum_db: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-24 px-3 py-2 border border-amber-300 rounded-md text-right bg-white"
                        />
                        <span className="text-amber-700">%</span>
                      </div>
                      <p className="text-xs text-amber-700 mt-2">
                        Advarsel vises hvis DB kommer under dette
                      </p>
                    </div>
                  </div>
                </div>

                <hr />

                <div>
                  <h3 className="font-medium mb-2">Trafiklys (DB%)</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Farvekodning af dækningsbidrag i kalkulationer og tilbud.
                    Tilbud under den røde grænse kan ikke sendes.
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <label className="text-sm font-medium text-green-800">Grøn (Godt)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-700">≥</span>
                        <input
                          type="number"
                          value={settings.margins.db_green_threshold}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                db_green_threshold: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-20 px-3 py-2 border border-green-300 rounded-md text-right bg-white text-sm"
                        />
                        <span className="text-green-700 text-sm">%</span>
                      </div>
                    </div>
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <label className="text-sm font-medium text-yellow-800">Gul (OK)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-yellow-700">≥</span>
                        <input
                          type="number"
                          value={settings.margins.db_yellow_threshold}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                db_yellow_threshold: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-20 px-3 py-2 border border-yellow-300 rounded-md text-right bg-white text-sm"
                        />
                        <span className="text-yellow-700 text-sm">%</span>
                      </div>
                    </div>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <label className="text-sm font-medium text-red-800">Rød (Stop)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-700">&lt;</span>
                        <input
                          type="number"
                          value={settings.margins.db_red_threshold}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              margins: {
                                ...settings.margins,
                                db_red_threshold: parseInt(e.target.value) || 0,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-20 px-3 py-2 border border-red-300 rounded-md text-right bg-white text-sm"
                        />
                        <span className="text-red-700 text-sm">%</span>
                      </div>
                      <p className="text-xs text-red-700 mt-2">
                        Tilbud kan ikke sendes under denne grænse
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Work Hours Tab */}
          {activeTab === 'work_hours' && (
            <div className="bg-white rounded-lg border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Arbejdstider</h2>
                <p className="text-sm text-muted-foreground">
                  Indstil normal arbejdstid og tillæg
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-3">Normal arbejdstid</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start</label>
                      <input
                        type="time"
                        value={settings.work_hours.start}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            work_hours: {
                              ...settings.work_hours,
                              start: e.target.value,
                            },
                          })
                          setHasChanges(true)
                        }}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Slut</label>
                      <input
                        type="time"
                        value={settings.work_hours.end}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            work_hours: {
                              ...settings.work_hours,
                              end: e.target.value,
                            },
                          })
                          setHasChanges(true)
                        }}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Pause (minutter)</label>
                      <input
                        type="number"
                        value={settings.work_hours.break_minutes}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            work_hours: {
                              ...settings.work_hours,
                              break_minutes: parseInt(e.target.value) || 0,
                            },
                          })
                          setHasChanges(true)
                        }}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                  </div>
                </div>

                <hr />

                <div>
                  <h3 className="font-medium mb-3">Tillæg</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Overtidstillæg</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={settings.work_hours.overtime_multiplier}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              work_hours: {
                                ...settings.work_hours,
                                overtime_multiplier: parseFloat(e.target.value) || 1,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-24 px-3 py-2 border rounded-md text-right"
                        />
                        <span className="text-muted-foreground">× timepris</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        F.eks. 1.5 = 50% tillæg
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Weekendtillæg</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={settings.work_hours.weekend_multiplier}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              work_hours: {
                                ...settings.work_hours,
                                weekend_multiplier: parseFloat(e.target.value) || 1,
                              },
                            })
                            setHasChanges(true)
                          }}
                          className="w-24 px-3 py-2 border rounded-md text-right"
                        />
                        <span className="text-muted-foreground">× timepris</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        F.eks. 2.0 = 100% tillæg
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Defaults Tab */}
          {activeTab === 'defaults' && (
            <div className="bg-white rounded-lg border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Standardindstillinger</h2>
                <p className="text-sm text-muted-foreground">
                  Generelle standarder for tilbud og kalkulationer
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Moms</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.defaults.vat_percentage}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          defaults: {
                            ...settings.defaults,
                            vat_percentage: parseInt(e.target.value) || 0,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-24 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Valuta</label>
                  <select
                    value={settings.defaults.currency}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        defaults: {
                          ...settings.defaults,
                          currency: e.target.value,
                        },
                      })
                      setHasChanges(true)
                    }}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="DKK">DKK - Danske kroner</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="SEK">SEK - Svenske kroner</option>
                    <option value="NOK">NOK - Norske kroner</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tilbuds gyldighed</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.defaults.validity_days}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          defaults: {
                            ...settings.defaults,
                            validity_days: parseInt(e.target.value) || 30,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-24 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">dage</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Betalingsbetingelser</label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Netto</span>
                    <input
                      type="number"
                      value={settings.defaults.payment_terms_days}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          defaults: {
                            ...settings.defaults,
                            payment_terms_days: parseInt(e.target.value) || 14,
                          },
                        })
                        setHasChanges(true)
                      }}
                      className="w-24 px-3 py-2 border rounded-md text-right"
                    />
                    <span className="text-muted-foreground">dage</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
