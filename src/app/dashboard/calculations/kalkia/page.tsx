import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function KalkiaCalculationPage() {
  // Kalkia Pro-builderen er midlertidigt skjult: den gemmer til kalkia_calculations,
  // som ingen visning i UI læser tilbage (Model A = calculations-tabellen er kanonisk),
  // så brugerens arbejde forsvinder efter gem. Builder-komponenten
  // (kalkia-calculation-builder.tsx), server actions og kalkia_calculations-data
  // bevares dormant, men ruten redirecter til kalkulationslisten indtil
  // datamodel-beslutningen (Model A vs kalkia) er taget.
  redirect('/dashboard/calculations')
}
