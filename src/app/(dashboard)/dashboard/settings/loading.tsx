import { Loader2 } from 'lucide-react'

export default function SettingsLoading() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Indlæser indstillinger...</p>
      </div>
    </div>
  )
}
