import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function IntelligenceDemoPage() {
  // AI Intelligence-demoen er en hardcodet, ulinket demoside (ingen navigation pegede
  // nogensinde på den). Den er midlertidigt skjult. Komponenten
  // (intelligence-demo-client.tsx) bevares dormant, men ruten redirecter til
  // kalkulationslisten, så den ikke kan nås ved et uheld via direkte URL.
  redirect('/dashboard/calculations')
}
