import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import { APP_NAME } from '@/lib/constants'
import { ToastProvider } from '@/components/ui/toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Ordre, kunder, mail og drift samlet ét sted',
  robots: {
    index: false,
    follow: false,
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ELTA Drift',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="da">
      <head>
        <meta name="theme-color" content="#2D8A2D" />
        {/* MB-12 (mobil-review 2026-10-17): pinch-zoom tilladt (fotos, små tekster); 16 px-felter forhindrer iOS' auto-zoom */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body className={inter.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
