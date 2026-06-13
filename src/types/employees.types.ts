export type EmployeeRole =
  | 'admin'
  | 'elektriker'
  | 'montør'
  | 'lærling'
  | 'projektleder'
  | 'kontor'
  // legacy values still acceptable on read
  | 'electrician'
  | 'installer'

export const EMPLOYEE_ROLE_OPTIONS: Array<{ value: EmployeeRole; label: string }> = [
  { value: 'elektriker',   label: 'Elektriker' },
  { value: 'montør',       label: 'Montør' },
  { value: 'lærling',      label: 'Lærling' },
  { value: 'projektleder', label: 'Projektleder' },
  { value: 'kontor',       label: 'Kontor' },
  { value: 'admin',        label: 'Admin' },
]

// Sprint Ø2.4 — ansættelsestype (HR/økonomi; påvirker ikke autorisation)
export type EmploymentType = 'timelønnet' | 'funktionær' | 'lærling' | 'ekstern'

export const EMPLOYMENT_TYPE_OPTIONS: Array<{ value: EmploymentType; label: string }> = [
  { value: 'timelønnet', label: 'Timelønnet' },
  { value: 'funktionær', label: 'Funktionær' },
  { value: 'lærling',    label: 'Lærling/elev' },
  { value: 'ekstern',    label: 'Ekstern/underleverandør' },
]

export const EMPLOYMENT_TYPE_LABEL = new Map(
  EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.value, o.label])
)

// Sprint Ø2.6 — overtidssatser pr. medarbejder
export interface EmployeeOvertimeRate {
  id: string
  employee_id: string
  name: string
  code: string
  multiplier: number
  cost_rate: number | null
  sale_rate: number | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Standard-satser der seedes ved ny medarbejder / første åbning. */
export const DEFAULT_OVERTIME_RATES: Array<{
  code: string
  name: string
  multiplier: number
  sort_order: number
}> = [
  { code: 'normal',  name: 'Normal',        multiplier: 1.0, sort_order: 1 },
  { code: 'ot50',    name: 'Overtid 50%',   multiplier: 1.5, sort_order: 2 },
  { code: 'ot100',   name: 'Overtid 100%',  multiplier: 2.0, sort_order: 3 },
  { code: 'weekend', name: 'Weekend',       multiplier: 2.0, sort_order: 4 },
  { code: 'holiday', name: 'Helligdag',     multiplier: 2.0, sort_order: 5 },
  { code: 'standby', name: 'Rådighed/vagt', multiplier: 1.0, sort_order: 6 },
]

// =====================================================================
// Sprint Ø2 ERP — udstyr, certifikater, events
// =====================================================================

export type EquipmentCategory =
  | 'bil' | 'telefon' | 'pc' | 'værktøj' | 'måleinstrument' | 'nøgle' | 'arbejdstøj' | 'andet'
export type EquipmentStatus = 'udleveret' | 'returneret' | 'mistet' | 'defekt' | 'service'

export const EQUIPMENT_CATEGORY_OPTIONS: Array<{ value: EquipmentCategory; label: string }> = [
  { value: 'bil', label: 'Bil' }, { value: 'telefon', label: 'Telefon' },
  { value: 'pc', label: 'PC/tablet' }, { value: 'værktøj', label: 'Værktøj' },
  { value: 'måleinstrument', label: 'Måleinstrument' }, { value: 'nøgle', label: 'Nøgle/adgangsbrik' },
  { value: 'arbejdstøj', label: 'Arbejdstøj' }, { value: 'andet', label: 'Andet' },
]
export const EQUIPMENT_STATUS_OPTIONS: Array<{ value: EquipmentStatus; label: string }> = [
  { value: 'udleveret', label: 'Udleveret' }, { value: 'returneret', label: 'Returneret' },
  { value: 'mistet', label: 'Mistet' }, { value: 'defekt', label: 'Defekt' }, { value: 'service', label: 'Service' },
]

export interface EmployeeEquipment {
  id: string
  employee_id: string
  name: string
  category: EquipmentCategory
  serial_number: string | null
  asset_number: string | null
  status: EquipmentStatus
  issued_date: string | null
  returned_date: string | null
  value_amount: number | null
  next_service_date: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type CertificateCategory =
  | 'autorisation' | 'kursus' | 'lift' | 'varmt_arbejde' | 'førstehjælp'
  | 'solcelle' | 'batteri_inverter' | 'elsikkerhed' | 'andet'

export const CERTIFICATE_CATEGORY_OPTIONS: Array<{ value: CertificateCategory; label: string }> = [
  { value: 'autorisation', label: 'Autorisation' }, { value: 'kursus', label: 'Kursus' },
  { value: 'lift', label: 'Lift' }, { value: 'varmt_arbejde', label: 'Varmt arbejde' },
  { value: 'førstehjælp', label: 'Førstehjælp' }, { value: 'solcelle', label: 'Solcellekursus' },
  { value: 'batteri_inverter', label: 'Batteri/inverter' }, { value: 'elsikkerhed', label: 'Elsikkerhed' },
  { value: 'andet', label: 'Andet' },
]

export interface EmployeeCertificate {
  id: string
  employee_id: string
  name: string
  category: CertificateCategory
  issuer: string | null
  issued_date: string | null
  expires_date: string | null
  document_path: string | null
  note: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export type CertificateStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry'

/** Beregn certifikat-status ud fra udløbsdato (default: udløber snart < 30 dage). */
export function certificateStatus(expires: string | null, soonDays = 30): CertificateStatus {
  if (!expires) return 'no_expiry'
  const d = new Date(expires)
  if (Number.isNaN(d.getTime())) return 'no_expiry'
  const now = new Date()
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86_400_000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= soonDays) return 'expiring'
  return 'valid'
}

export interface EmployeeEvent {
  id: string
  employee_id: string
  event_type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
}

export interface EmployeeRow {
  id: string
  profile_id: string | null
  employee_number: string | null
  first_name: string | null
  last_name: string | null
  name: string                 // legacy "Full name" — derived from first/last when both present
  email: string
  role: EmployeeRole
  employment_type: EmploymentType | null
  active: boolean
  address: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  hire_date: string | null
  termination_date: string | null
  notes: string | null
  hourly_rate: number | null   // mirror of compensation.sales_rate
  cost_rate: number | null     // mirror of compensation.internal_cost_rate
  created_at: string
  updated_at: string
}

export interface EmployeeCompensationRow {
  employee_id: string
  hourly_wage: number | null
  internal_cost_rate: number | null
  sales_rate: number | null
  pension_pct: number
  free_choice_pct: number
  vacation_pct: number
  sh_pct: number
  social_costs: number
  overhead_pct: number
  overtime_rate: number | null
  mileage_rate: number | null
  real_hourly_cost: number | null   // generated column
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeWithCompensation extends EmployeeRow {
  compensation: EmployeeCompensationRow | null
}

export interface EmployeeProjectImpact {
  employeeId: string
  employeeName: string
  projectId: string | null
  projectName: string | null
  totalHours: number
  billableHours: number
  laborCost: number          // billable hours × internal_cost_rate
  laborRevenue: number       // billable hours × sales_rate
  contributionMargin: number // revenue - cost (DB)
}

export interface EmployeeCompensationHistoryRow {
  id: string
  employee_id: string
  hourly_wage: number | null
  internal_cost_rate: number | null
  sales_rate: number | null
  pension_pct: number | null
  free_choice_pct: number | null
  vacation_pct: number | null
  sh_pct: number | null
  social_costs: number | null
  overhead_pct: number | null
  overtime_rate: number | null
  mileage_rate: number | null
  real_hourly_cost: number | null
  effective_from: string
  changed_by: string | null
  change_reason: string | null
  created_at: string
}
