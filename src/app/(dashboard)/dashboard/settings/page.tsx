export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Indstillinger</h1>
        <p className="text-gray-600 mt-1">Administrer systemindstillinger og præferencer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Profile Settings */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Profil</h3>
              <p className="text-sm text-gray-600">Dine personlige oplysninger</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Opdater dit navn, e-mail, telefonnummer og andre personlige detaljer
          </p>
        </div>

        {/* Team Management */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Team</h3>
              <p className="text-sm text-gray-600">Administrer brugere</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Inviter teammedlemmer, tildel roller og administrer adgang
          </p>
        </div>

        {/* Company Settings */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Virksomhed</h3>
              <p className="text-sm text-gray-600">Virksomhedsoplysninger</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Opdater virksomhedsnavn, CVR-nummer, logo og kontaktinfo
          </p>
        </div>

        {/* Notifications */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <svg
                className="w-6 h-6 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Notifikationer</h3>
              <p className="text-sm text-gray-600">E-mail og push</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Konfigurer hvilke notifikationer du vil modtage og hvordan
          </p>
        </div>

        {/* Security */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Sikkerhed</h3>
              <p className="text-sm text-gray-600">Adgangskode og 2FA</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Skift adgangskode, aktiver to-faktor-autentificering
          </p>
        </div>

        {/* Integrations */}
        <div className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <svg
                className="w-6 h-6 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Integrationer</h3>
              <p className="text-sm text-gray-600">Tredjepartsapps</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Forbind eksterne tjenester som e-mail, kalender og regnskab
          </p>
        </div>
      </div>
    </div>
  )
}
