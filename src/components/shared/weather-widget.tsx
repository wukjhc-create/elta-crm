'use client'

import { useState, useEffect } from 'react'
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudLightning,
  Wind,
  Droplets,
  AlertTriangle,
  Loader2,
} from 'lucide-react'

interface WeatherData {
  current: {
    temp: number
    feels_like: number
    wind_speed: number
    wind_gust?: number
    humidity: number
    description: string
    icon: string
  }
  hourly: Array<{
    dt: number
    temp: number
    wind_speed: number
    wind_gust?: number
    pop: number // probability of precipitation
    description: string
    icon: string
    rain_1h?: number
  }>
  alerts: string[]
}

interface WeatherWidgetProps {
  latitude: number
  longitude: number
  compact?: boolean
}

function getWeatherIcon(icon: string, className = 'w-5 h-5') {
  if (icon.startsWith('01')) return <Sun className={`${className} text-yellow-500`} />
  if (icon.startsWith('02') || icon.startsWith('03') || icon.startsWith('04'))
    return <Cloud className={`${className} text-gray-400`} />
  if (icon.startsWith('09') || icon.startsWith('10'))
    return <CloudRain className={`${className} text-blue-500`} />
  if (icon.startsWith('11')) return <CloudLightning className={`${className} text-purple-500`} />
  if (icon.startsWith('13')) return <CloudSnow className={`${className} text-blue-300`} />
  return <Cloud className={`${className} text-gray-400`} />
}

function getSafetyAlerts(data: WeatherData): Array<{ level: 'warning' | 'danger'; text: string }> {
  const alerts: Array<{ level: 'warning' | 'danger'; text: string }> = []

  // Check current wind
  if (data.current.wind_speed > 15) {
    alerts.push({ level: 'danger', text: `Kraftig vind: ${Math.round(data.current.wind_speed)} m/s — STOP tagarbejde!` })
  } else if (data.current.wind_speed > 10) {
    alerts.push({ level: 'warning', text: `Hård vind: ${Math.round(data.current.wind_speed)} m/s — Vær forsigtig på tag` })
  }

  // Check gusts
  if (data.current.wind_gust && data.current.wind_gust > 15) {
    alerts.push({ level: 'danger', text: `Vindstød op til ${Math.round(data.current.wind_gust)} m/s` })
  }

  // Check for heavy rain in next 6 hours
  const next6h = data.hourly.slice(0, 6)
  const heavyRain = next6h.some((h) => (h.rain_1h || 0) > 4 || h.pop > 0.8)
  if (heavyRain) {
    alerts.push({ level: 'warning', text: 'Kraftig regn forventet inden for 6 timer' })
  }

  // Check for upcoming high wind in next 12h
  const next12h = data.hourly.slice(0, 12)
  const upcomingHighWind = next12h.find((h) => h.wind_speed > 10 || (h.wind_gust || 0) > 15)
  if (upcomingHighWind && data.current.wind_speed <= 10) {
    const hour = new Date(upcomingHighWind.dt * 1000).getHours()
    alerts.push({ level: 'warning', text: `Hård vind forventet kl. ${hour}:00 (${Math.round(upcomingHighWind.wind_speed)} m/s)` })
  }

  return alerts
}

export function WeatherWidget({ latitude, longitude, compact }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchWeather() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`)
        if (!res.ok) throw new Error('Kunne ikke hente vejrdata')
        const data = await res.json()
        if (!cancelled) setWeather(data)
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Vejrdata utilgængelig')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (latitude && longitude) fetchWeather()

    return () => { cancelled = true }
  }, [latitude, longitude])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4 flex items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Henter vejrdata...
      </div>
    )
  }

  if (error || !weather) {
    return (
      <div className="bg-white rounded-lg border p-4 text-sm text-gray-500">
        {error || 'Vejrdata utilgængelig'}
      </div>
    )
  }

  const alerts = getSafetyAlerts(weather)

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {getWeatherIcon(weather.current.icon, 'w-5 h-5')}
        <span className="font-medium">{Math.round(weather.current.temp)}°C</span>
        <span className="text-gray-500">{weather.current.description}</span>
        <span className="flex items-center gap-1 text-gray-500">
          <Wind className="w-3.5 h-3.5" /> {Math.round(weather.current.wind_speed)} m/s
        </span>
        {alerts.length > 0 && (
          <AlertTriangle className={`w-4 h-4 ${alerts[0].level === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />
        )}
      </div>
    )
  }

  // Next 12 hours for the timeline
  const next12h = weather.hourly.slice(0, 12)

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Safety alerts */}
      {alerts.length > 0 && (
        <div className="border-b">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`px-4 py-2.5 flex items-center gap-2 text-sm font-medium ${
                alert.level === 'danger'
                  ? 'bg-red-50 text-red-800 border-b border-red-100'
                  : 'bg-amber-50 text-amber-800 border-b border-amber-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {alert.text}
            </div>
          ))}
        </div>
      )}

      {/* Current weather */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getWeatherIcon(weather.current.icon, 'w-8 h-8')}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{Math.round(weather.current.temp)}°C</span>
                <span className="text-sm text-gray-500">
                  Føles som {Math.round(weather.current.feels_like)}°C
                </span>
              </div>
              <p className="text-sm text-gray-600 capitalize">{weather.current.description}</p>
            </div>
          </div>
          <div className="text-right text-sm space-y-1">
            <div className="flex items-center justify-end gap-1.5 text-gray-600">
              <Wind className="w-3.5 h-3.5" />
              {Math.round(weather.current.wind_speed)} m/s
              {weather.current.wind_gust && (
                <span className="text-gray-400">(stød {Math.round(weather.current.wind_gust)})</span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-gray-600">
              <Droplets className="w-3.5 h-3.5" />
              {weather.current.humidity}%
            </div>
          </div>
        </div>
      </div>

      {/* 12-hour forecast */}
      <div className="border-t px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Næste 12 timer</h4>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {next12h.map((h, i) => {
            const hour = new Date(h.dt * 1000).getHours()
            const isHighWind = h.wind_speed > 10
            const isRain = h.pop > 0.5

            return (
              <div
                key={i}
                className={`flex flex-col items-center gap-0.5 min-w-[50px] px-1.5 py-1.5 rounded text-xs ${
                  isHighWind ? 'bg-red-50' : isRain ? 'bg-blue-50' : ''
                }`}
              >
                <span className="text-gray-500">{hour}:00</span>
                {getWeatherIcon(h.icon, 'w-4 h-4')}
                <span className="font-medium">{Math.round(h.temp)}°</span>
                <span className={`flex items-center gap-0.5 ${isHighWind ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                  <Wind className="w-2.5 h-2.5" /> {Math.round(h.wind_speed)}
                </span>
                {h.pop > 0.1 && (
                  <span className="text-blue-500">{Math.round(h.pop * 100)}%</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
