import { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Indstillinger',
  description: 'Administrer profil, virksomhed, integrationer og systemindstillinger',
}

const settingsCards = [
  {
    href: '/dashboard/settings/profile',
    title: 'Profil',
    subtitle: 'Dine personlige oplysninger',
    description: 'Opdater dit navn, e-mail, telefonnummer og andre personlige detaljer',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    ),
  },
  {
    href: '/dashboard/settings/team',
    title: 'Team',
    subtitle: 'Administrer brugere',
    description: 'Inviter teammedlemmer, tildel roller og administrer adgang',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    ),
  },
  {
    href: '/dashboard/settings/company',
    title: 'Virksomhed',
    subtitle: 'Virksomhedsoplysninger',
    description: 'Opdater virksomhedsnavn, CVR-nummer, logo og kontaktinfo',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    ),
  },
  {
    href: '/dashboard/settings/notifications',
    title: 'Notifikationer',
    subtitle: 'E-mail og push',
    description: 'Konfigurer hvilke notifikationer du vil modtage og hvordan',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    ),
  },
  {
    href: '/dashboard/settings/security',
    title: 'Sikkerhed',
    subtitle: 'Adgangskode og 2FA',
    description: 'Skift adgangskode, aktiver to-faktor-autentificering',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    ),
  },
  {
    href: '/dashboard/settings/integrations',
    title: 'Integrationer',
    subtitle: 'Tredjepartsapps',
    description: 'Forbind eksterne tjenester som e-mail, kalender og regnskab',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
      />
    ),
  },
  {
    href: '/dashboard/settings/calculation',
    title: 'Kalkulation',
    subtitle: 'Timepriser og avancer',
    description: 'Konfigurer timepriser, avancer, arbejdstider og standardindstillinger for kalkulationer',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    ),
  },
  {
    href: '/dashboard/settings/components',
    title: 'Komponenter',
    subtitle: 'El-komponenter',
    description: 'Administrer el-komponenter, tidsnormer, varianter og materialer til kalkulationer',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    ),
  },
  {
    href: '/dashboard/settings/solar',
    title: 'Solceller',
    subtitle: 'Produkter og beregning',
    description: 'Administrer solpaneler, invertere, batterier og beregningsparametre',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    ),
  },
  {
    href: '/dashboard/settings/suppliers',
    title: 'Leverandører',
    subtitle: 'Grossister og import',
    description: 'Administrer grossister som AO og Lemvigh-Müller, importer produkter og priser',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    ),
  },
  {
    href: '/dashboard/settings/learning',
    title: 'Selvlærende Engine',
    subtitle: 'Kalibrering og nøjagtighed',
    description: 'Overvåg kalkulationsnøjagtighed, kør autokalibrering og se komponent-justeringer',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    ),
  },
  {
    href: '/dashboard/settings/audit',
    title: 'Audit Log',
    subtitle: 'Systemhistorik',
    description: 'Se alle handlinger og ændringer foretaget i systemet med detaljer og filtrering',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    ),
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Indstillinger</h1>
        <p className="text-gray-600 mt-1">Administrer systemindstillinger og præferencer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingsCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 ${card.iconBg} rounded-lg`}>
                <svg
                  className={`w-6 h-6 ${card.iconColor}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {card.icon}
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{card.title}</h3>
                <p className="text-sm text-gray-600">{card.subtitle}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
