import { Loader2 } from 'lucide-react'

export default function PortalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Indlæser portal...</p>
      </div>
    </div>
  )
}
