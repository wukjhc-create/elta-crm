export type HealthService =
  | 'email'
  | 'email_intel'
  | 'auto_case'
  | 'auto_offer'
  | 'invoice'
  | 'bank'
  | 'economic'
  | 'health_check'

export type HealthStatus = 'ok' | 'warning' | 'error'

export interface SystemHealthLogRow {
  id: string
  service: HealthService
  status: HealthStatus
  message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface ServiceHealth {
  service: HealthService
  status: HealthStatus
  errorsLastHour: number
  warningsLastHour: number
  lastErrorAt: string | null
  lastErrorMessage: string | null
  lastOkAt: string | null
}

export interface SystemHealthSnapshot {
  generatedAt: string
  overall: HealthStatus
  services: ServiceHealth[]
  recentErrors: SystemHealthLogRow[]
}
