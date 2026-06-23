import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ProfitSimulatorPage() {
  // Profit Simulator er forældreløs: ingen knap eller navigation peger længere på ruten.
  // Den er en ren client-beregner uden persistens. Midlertidigt skjult — komponenten
  // (profit-simulator-client.tsx) bevares dormant, men ruten redirecter til
  // kalkulationslisten indtil den evt. genindføres et meningsfuldt sted.
  redirect('/dashboard/calculations')
}
