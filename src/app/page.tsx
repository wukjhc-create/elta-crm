import Link from 'next/link'
import { APP_NAME } from '@/lib/constants'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-center font-mono text-sm">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4">{APP_NAME}</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Professionelt CRM system til administration af leads, kunder, tilbud og projekter
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              Log ind
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/90 transition-colors"
            >
              Opret konto
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">📊 Leads</h3>
              <p className="text-sm text-muted-foreground">
                Administrer potentielle kunder gennem hele salgsprocessen
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">📬 Indbakke</h3>
              <p className="text-sm text-muted-foreground">
                Intern kommunikation og beskeder knyttet til projekter
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">💼 Tilbud</h3>
              <p className="text-sm text-muted-foreground">
                Opret og send professionelle tilbud til kunder
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">👥 Kunder</h3>
              <p className="text-sm text-muted-foreground">
                Komplet oversigt over alle dine kunder og kontakter
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">🔨 Projekter</h3>
              <p className="text-sm text-muted-foreground">
                Projektstyring med opgaver og tidssporing
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="text-lg font-semibold mb-2">🔒 Sikkerhed</h3>
              <p className="text-sm text-muted-foreground">
                Rollebaseret adgangskontrol og Row Level Security
              </p>
            </div>
          </div>

          <div className="mt-12 text-sm text-muted-foreground">
            <p>Bygget med Next.js 16, Supabase, og Tailwind CSS</p>
          </div>
        </div>
      </div>
    </main>
  )
}
