/**
 * ADDR-1: UTM zone 32N (EPSG:25832, ETRS89) → geografiske koordinater (WGS84 ~ ETRS89, afvigelse < 1 m i DK).
 * Adressevælgeren leverer adgangspunkter i EPSG:25832; appen gemmer latitude/longitude. Standard invers
 * transversal Mercator (Krüger-serie, GRS80). Ren funktion — testet i scripts/address-provider-test.ts.
 */
const A = 6378137.0
const F = 1 / 298.257222101 // GRS80
const K0 = 0.9996
const E0 = 500000
const LON0 = (9 * Math.PI) / 180 // central meridian zone 32

export function utm32ToWgs84(x: number, y: number): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const e2 = F * (2 - F)
  const ep2 = e2 / (1 - e2)
  const M = y / K0
  const mu = M / (A * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu
    + (3 * e1 / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sin1 = Math.sin(phi1)
  const cos1 = Math.cos(phi1)
  const tan1 = Math.tan(phi1)
  const N1 = A / Math.sqrt(1 - e2 * sin1 * sin1)
  const T1 = tan1 * tan1
  const C1 = ep2 * cos1 * cos1
  const R1 = (A * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5)
  const D = (x - E0) / (N1 * K0)
  const lat = phi1 - ((N1 * tan1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720
  )
  const lon = LON0 + (
    D
    - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120
  ) / cos1
  const latitude = (lat * 180) / Math.PI
  const longitude = (lon * 180) / Math.PI
  // Danmark (inkl. Bornholm) — alt andet er en fejl i input
  if (latitude < 54 || latitude > 58.5 || longitude < 7.5 || longitude > 15.5) return null
  return { latitude: Math.round(latitude * 1e7) / 1e7, longitude: Math.round(longitude * 1e7) / 1e7 }
}
