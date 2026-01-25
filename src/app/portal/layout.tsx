import { Zap } from 'lucide-react'

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Elta Solar</span>
              <span className="text-sm text-muted-foreground ml-2">Kundeportal</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Elta Solar ApS. Alle rettigheder forbeholdes.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="tel:+4512345678" className="hover:text-primary">
                Tlf: +45 12 34 56 78
              </a>
              <a href="mailto:info@eltasolar.dk" className="hover:text-primary">
                info@eltasolar.dk
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
