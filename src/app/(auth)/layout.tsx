import { APP_NAME } from '@/lib/constants'
import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-primary-foreground">
          <h1 className="text-4xl font-bold mb-4">{APP_NAME}</h1>
          <p className="text-xl mb-8 opacity-90">
            Professionelt CRM system til administration af leads, kunder, tilbud og projekter
          </p>
          <ul className="space-y-4">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Komplet lead-håndtering</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Tilbudsgenerering med automatisk beregning</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Projektstyring med tidssporing</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Rollebaseret adgangskontrol</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden text-center">
            <Link href="/" className="inline-block">
              <h1 className="text-3xl font-bold">{APP_NAME}</h1>
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
