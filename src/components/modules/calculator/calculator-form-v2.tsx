'use client'

import { useState, useEffect } from 'react'
import type {
  SolarProductsByType,
  CalculatorInputV2,
  PanelSpecs,
  InverterSpecs,
  BatterySpecs,
  MountingSpecs,
} from '@/types/solar-products.types'

interface CalculatorFormV2Props {
  products: SolarProductsByType
  defaultValues: CalculatorInputV2
  onCalculate: (input: CalculatorInputV2) => void
}

const LABELS = {
  panelCode: 'Solpanel',
  panelCount: 'Antal paneler',
  inverterCode: 'Inverter',
  mountingCode: 'Monteringstype',
  batteryCode: 'Batteri',
  annualConsumption: 'Årligt forbrug (kWh)',
  margin: 'Avance',
  discount: 'Rabat',
  includeVat: 'Inkluder moms',
}

export function CalculatorFormV2({
  products,
  defaultValues,
  onCalculate,
}: CalculatorFormV2Props) {
  const [values, setValues] = useState<CalculatorInputV2>(defaultValues)

  useEffect(() => {
    onCalculate(values)
  }, [values, onCalculate])

  const handleChange = (field: keyof CalculatorInputV2, value: string | number | boolean) => {
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
          <label htmlFor="panelCode" className="text-sm font-medium">
            {LABELS.panelCode}
          </label>
          <select
            id="panelCode"
            value={values.panelCode}
            onChange={(e) => handleChange('panelCode', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {products.panels.map((panel) => {
              const specs = panel.specifications as PanelSpecs
              return (
                <option key={panel.code} value={panel.code}>
                  {panel.name} ({specs.wattage}W) - {panel.price.toLocaleString('da-DK')} kr
                </option>
              )
            })}
          </select>
        </div>

        {/* Panel Count */}
        <div className="space-y-1">
          <label htmlFor="panelCount" className="text-sm font-medium">
            {LABELS.panelCount}: {values.panelCount}
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
          <label htmlFor="inverterCode" className="text-sm font-medium">
            {LABELS.inverterCode}
          </label>
          <select
            id="inverterCode"
            value={values.inverterCode}
            onChange={(e) => handleChange('inverterCode', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {products.inverters.map((inverter) => {
              const specs = inverter.specifications as InverterSpecs
              return (
                <option key={inverter.code} value={inverter.code}>
                  {inverter.name} ({specs.capacity}kW) - {inverter.price.toLocaleString('da-DK')} kr
                </option>
              )
            })}
          </select>
        </div>

        {/* Mounting Type */}
        <div className="space-y-1">
          <label htmlFor="mountingCode" className="text-sm font-medium">
            {LABELS.mountingCode}
          </label>
          <select
            id="mountingCode"
            value={values.mountingCode}
            onChange={(e) => handleChange('mountingCode', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {products.mountings.map((mounting) => {
              const specs = mounting.specifications as MountingSpecs
              return (
                <option key={mounting.code} value={mounting.code}>
                  {mounting.name} - {specs.price_per_panel.toLocaleString('da-DK')} kr/panel
                </option>
              )
            })}
          </select>
        </div>

        {/* Battery Option */}
        <div className="space-y-1">
          <label htmlFor="batteryCode" className="text-sm font-medium">
            {LABELS.batteryCode}
          </label>
          <select
            id="batteryCode"
            value={values.batteryCode}
            onChange={(e) => handleChange('batteryCode', e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {products.batteries.map((battery) => {
              const specs = battery.specifications as BatterySpecs
              return (
                <option key={battery.code} value={battery.code}>
                  {battery.name}
                  {specs.capacity > 0 && ` (${specs.capacity}kWh)`}
                  {battery.price > 0 && ` - ${battery.price.toLocaleString('da-DK')} kr`}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {/* Customer Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Kundeinfo</h3>

        <div className="space-y-1">
          <label htmlFor="annualConsumption" className="text-sm font-medium">
            {LABELS.annualConsumption}
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
            {LABELS.margin}: {Math.round(values.margin * 100)}%
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
            {LABELS.discount}: {Math.round(values.discount * 100)}%
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
              {LABELS.includeVat}
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
