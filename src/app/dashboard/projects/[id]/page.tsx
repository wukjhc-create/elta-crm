import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// PM3-11 (Henrik 2026-10-19): det gamle projektmodul er afviklet — sager (service_cases) er sandheden.
// Gamle bogmærker/links til /dashboard/projects/<id> sendes til sagsoversigten.
export default function LegacyProjectPage() {
  redirect('/dashboard/orders')
}
