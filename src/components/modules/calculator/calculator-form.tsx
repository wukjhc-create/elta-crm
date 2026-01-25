'use client'

import { useState, useEffect } from 'react'
import {
  PANEL_TYPES,
  INVERTER_TYPES,
  MOUNTING_TYPES,
  BATTERY_OPTIONS,
  CALCULATOR_LABELS,
  type CalculatorInput,
} from '@/types/calculator.types'

interface CalculatorFormProps {
  defaultValues: CalculatorInput
  onCalculate: (input: CalculatorInput) => void
}

export function CalculatorForm({ defaultValues, onCalculate }: CalculatorFormProps) {
  const [values, setValues] = useState<CalculatorInput>(defaultValues)

  useEffect(() => {
    onCalculate(values)
  }, [values, onCalculate])

  const handleChange = (field: keyof CalculatorInput, value: string | number | boolean) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <div className="space-y-6">
      {/* System Configuration */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Systemkonfiguration</h3>

        {/* Panel Type */}
        <div className="space-y-1">
          <label htmlFor="panelType" className="text-sm font-medium">
            {CALCULATOR_LABELS.panelType}
          </label>
          <select
            id="panelType"
            value={values.panelType}
            onChange={(e) => handleChange('panelType', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {PANEL_TYPES.map((panel) => (
              <option key={panel.id} value={panel.id}>
                {panel.name} - {panel.price.toLocaleString('da-DK')} kr
              </option>
            ))}
          </select>
        </div>

        {/* Panel Count */}
        <div className="space-y-1">
          <label htmlFor="panelCount" className="text-sm font-medium">
            {CALCULATOR_LABELS.panelCount}: {values.panelCount}
          </label>
          <input
            type="range"
            id="panelCount"
            min={1}
            max={50}
            step={1}
            value={values.panelCount}
            onChange={(e) => handleChange('panelCount', parseInt(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>1 panel</span>
            <span>50 paneler</span>
          </div>
        </div>

        {/* Inverter Type */}
        <div className="space-y-1">
          <label htmlFor="inverterType" className="text-sm font-medium">
            {CALCULATOR_LABELS.inverterType}
          </label>
          <select
            id="inverterType"
            value={values.inverterType}
            onChange={(e) => handleChange('inverterType', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {INVERTER_TYPES.map((inverter) => (
              <option key={inverter.id} value={inverter.id}>
                {inverter.name} - {inverter.price.toLocaleString('da-DK')} kr
              </option>
            ))}
          </select>
        </div>

        {/* Mounting Type */}
        <div className="space-y-1">
          <label htmlFor="mountingType" className="text-sm font-medium">
            {CALCULATOR_LABELS.mountingType}
          </label>
          <select
            id="mountingType"
            value={values.mountingType}
            onChange={(e) => handleChange('mountingType', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {MOUNTING_TYPES.map((mounting) => (
              <option key={mounting.id} value={mounting.id}>
                {mounting.name} - {mounting.pricePerPanel.toLocaleString('da-DK')} kr/panel
              </option>
            ))}
          </select>
        </div>

        {/* Battery Option */}
        <div className="space-y-1">
          <label htmlFor="batteryOption" className="text-sm font-medium">
            {CALCULATOR_LABELS.batteryOption}
          </label>
          <select
            id="batteryOption"
            value={values.batteryOption}
            onChange={(e) => handleChange('batteryOption', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {BATTERY_OPTIONS.map((battery) => (
              <option key={battery.id} value={battery.id}>
                {battery.name}
                {battery.price > 0 && ` - ${battery.price.toLocaleString('da-DK')} kr`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Customer Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Kundeinfo</h3>

        <div className="space-y-1">
          <label htmlFor="annualConsumption" className="text-sm font-medium">
            {CALCULATOR_LABELS.annualConsumption}
          </label>
          <input
            type="number"
            id="annualConsumption"
            value={values.annualConsumption}
            onChange={(e) => handleChange('annualConsumption', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Pricing */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Prissætning</h3>

        {/* Margin */}
        <div className="space-y-1">
          <label htmlFor="margin" className="text-sm font-medium">
            {CALCULATOR_LABELS.margin}: {Math.round(values.margin * 100)}%
          </label>
          <input
            type="range"
            id="margin"
            min={0}
            max={0.5}
            step={0.01}
            value={values.margin}
            onChange={(e) => handleChange('margin', parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0%</span>
            <span>50%</span>
          </div>
        </div>

        {/* Discount */}
        <div className="space-y-1">
          <label htmlFor="discount" className="text-sm font-medium">
            {CALCULATOR_LABELS.discount}: {Math.round(values.discount * 100)}%
          </label>
          <input
            type="range"
            id="discount"
            min={0}
            max={0.3}
            step={0.01}
            value={values.discount}
            onChange={(e) => handleChange('discount', parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0%</span>
            <span>30%</span>
          </div>
        </div>

        {/* Include VAT */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <label htmlFor="includeVat" className="text-sm font-medium cursor-pointer">
              {CALCULATOR_LABELS.includeVat}
            </label>
            <p className="text-sm text-gray-500">25% moms tilføjes til totalpris</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="includeVat"
              checked={values.includeVat}
              onChange={(e) => handleChange('includeVat', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>
    </div>
  )
}
