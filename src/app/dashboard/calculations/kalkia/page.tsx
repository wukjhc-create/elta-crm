import KalkiaCalculationBuilder from './kalkia-calculation-builder'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ny Kalkia Kalkulation',
  description: 'Opret en ny professionel kalkulation med Kalkia komponentbiblioteket',
}

export default function KalkiaCalculationPage() {
  return <KalkiaCalculationBuilder />
}
