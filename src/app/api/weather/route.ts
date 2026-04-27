import { NextRequest, NextResponse } from 'next/server'

/**
 * Weather API proxy — fetches OpenWeather One Call 3.0 data
 * and returns a simplified structure for the weather widget.
 *
 * GET /api/weather?lat=55.676&lon=12.568
 */
export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get('lat')
  const lon = request.nextUrl.searchParams.get('lon')

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenWeather API key not configured' }, { status: 500 })
  }

  try {
    // Try One Call 3.0 first, fall back to 2.5
    let url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=da&exclude=minutely,daily`

    let res = await fetch(url, { next: { revalidate: 900 } }) // Cache 15 min

    // Fall back to 2.5 if 3.0 not available
    if (!res.ok) {
      url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=da&exclude=minutely,daily`
      res = await fetch(url, { next: { revalidate: 900 } })
    }

    if (!res.ok) {
      return NextResponse.json({ error: 'Weather API error' }, { status: 502 })
    }

    const data = await res.json()

    // Transform to simplified format
    const result = {
      current: {
        temp: data.current?.temp ?? 0,
        feels_like: data.current?.feels_like ?? 0,
        wind_speed: data.current?.wind_speed ?? 0,
        wind_gust: data.current?.wind_gust ?? undefined,
        humidity: data.current?.humidity ?? 0,
        description: data.current?.weather?.[0]?.description ?? '',
        icon: data.current?.weather?.[0]?.icon ?? '01d',
      },
      hourly: (data.hourly || []).slice(0, 48).map((h: any) => ({
        dt: h.dt,
        temp: h.temp,
        wind_speed: h.wind_speed,
        wind_gust: h.wind_gust ?? undefined,
        pop: h.pop ?? 0,
        description: h.weather?.[0]?.description ?? '',
        icon: h.weather?.[0]?.icon ?? '01d',
        rain_1h: h.rain?.['1h'] ?? undefined,
      })),
      alerts: (data.alerts || []).map((a: any) => a.description || a.event || ''),
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 500 })
  }
}
