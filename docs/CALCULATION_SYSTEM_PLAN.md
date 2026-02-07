# ELTA Kalkulationssystem - Masterplan

## Vision
Professionelt kalkulations- og pakkesystem til el-installationer inspireret af Jublo, CalWin og Kalkia.

---

## Arkitektur Oversigt

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELTA CRM                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Komponenter │  │   Pakker    │  │ Kalkulationer│             │
│  │  Bibliotek  │──│   System    │──│    Motor     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │              Indstillinger                       │           │
│  │  • Timepriser  • Avancer  • Arbejdstider        │           │
│  └─────────────────────────────────────────────────┘           │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │              Hurtig-Kalkulation                  │           │
│  │  Standard Hus → Rum → Komponenter → Resultat    │           │
│  └─────────────────────────────────────────────────┘           │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │                 Tilbud                           │           │
│  │  Import fra kalkulation → PDF → Kundeportal     │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Model

### 1. Indstillinger (Settings)
```
calculation_settings
├── id
├── setting_key (unique)
├── setting_value (jsonb)
├── category (hourly_rates, margins, work_hours, defaults)
└── updated_at

Eksempel data:
- hourly_rates: { montør: 495, lærling: 295, mester: 650 }
- margins: { materials: 25, standard_db: 35, minimum_db: 20 }
- work_hours: { day_start: "07:00", day_end: "15:30", break_minutes: 30 }
- defaults: { vat_percentage: 25, currency: "DKK" }
```

### 2. Komponenter (Eksisterende - udvides)
```
calc_components (eksisterer)
├── + default_cost_price
├── + default_sale_price
└── + complexity_factor

calc_component_categories (eksisterer)
└── + icon, color

Nye komponenter tilføjes:
- Rørføring (ROER-*)
- Kabeltræk (KABEL-*)
- Boring (BOR-*)
- Gennembrydning (GEN-*)
- Montering (MONT-*)
```

### 3. Pakker (Eksisterende)
```
packages (eksisterer)
package_items (eksisterer)
- Færdigt ✓
```

### 4. Kalkulationer (Udvides)
```
calculations (eksisterer - udvides)
├── + calculation_mode (quick, detailed, template)
├── + project_type (standard_house, apartment, commercial, solar)
├── + room_count
├── + settings_snapshot (jsonb - gemmer indstillinger på tidspunktet)
└── + metadata (jsonb)

calculation_rows (eksisterer - udvides)
├── + component_id (FK)
├── + component_variant_code
├── + time_minutes
├── + is_from_package
└── + package_id (FK)
```

### 5. Projekt Skabeloner (Nyt)
```
project_templates
├── id
├── name (Standard parcelhus, Lejlighed, etc.)
├── code
├── description
├── room_defaults (jsonb)
│   └── [{ room_type, default_outlets, default_lights, ... }]
├── is_active
└── created_at

room_types
├── id
├── name (Stue, Køkken, Soveværelse, Bad, etc.)
├── code
├── default_components (jsonb)
│   └── [{ component_code, quantity, variant }]
└── sort_order
```

---

## Faser

### FASE 1: Indstillinger & Grundlag ✅ → 🔨
- [x] Komponent-bibliotek i database
- [x] Pakke-system i database
- [ ] calculation_settings tabel
- [ ] Settings UI (timepriser, avancer, arbejdstider)
- [ ] Udvid komponenter med priser og faktorer

### FASE 2: Kalkulationsmotor
- [ ] Beregn tid fra komponenter
- [ ] Beregn materialer
- [ ] Beregn kostpris (tid × timepris + materialer)
- [ ] Beregn salgspris (kostpris + avance)
- [ ] Beregn DB og DB%
- [ ] Kalkulationsresume-komponent

### FASE 3: Hurtig-Kalkulation
- [ ] Projektskabeloner (Standard hus, Lejlighed)
- [ ] Rum-typer med standarder
- [ ] Wizard: Vælg projekt → Vælg rum → Juster antal
- [ ] Auto-generér kalkulation
- [ ] Gem og rediger

### FASE 4: Integration
- [ ] Eksportér kalkulation til tilbud
- [ ] PDF med kalkulationsdetaljer
- [ ] Kopier kalkulation
- [ ] Historik og versioner

---

## UI Struktur

```
/dashboard/settings/calculation
├── /hourly-rates     → Timepriser per rolle
├── /margins          → Avancer og DB-regler
├── /work-hours       → Arbejdstider
└── /defaults         → Standard-indstillinger

/dashboard/calculations
├── /                 → Liste over kalkulationer
├── /new              → Ny kalkulation (wizard)
├── /[id]             → Detalje/rediger
└── /[id]/export      → Eksportér til tilbud

/dashboard/components
├── /                 → Komponent-bibliotek
├── /[id]             → Rediger komponent
└── /categories       → Kategorier

/dashboard/packages
├── /                 → Pakke-liste (eksisterer ✓)
└── /[id]             → Pakke-editor (eksisterer ✓)
```

---

## Teknisk Implementation

### Beregningslogik
```typescript
interface CalculationEngine {
  // Input
  components: ComponentSelection[]
  packages: PackageSelection[]
  settings: CalculationSettings

  // Beregninger
  calculateTotalTime(): number        // minutter
  calculateMaterialsCost(): number    // kr
  calculateLaborCost(): number        // tid × timepris
  calculateTotalCost(): number        // materialer + arbejdsløn
  calculateSalePrice(): number        // kostpris + avance
  calculateDB(): number               // salgspris - kostpris
  calculateDBPercentage(): number     // (DB / salgspris) × 100

  // Output
  getSummary(): CalculationSummary
  getDetailedBreakdown(): CalculationBreakdown[]
}
```

### Kalkulationsflow
```
1. Bruger vælger projekttype
2. Bruger vælger/justerer rum
3. System foreslår komponenter per rum
4. Bruger justerer antal
5. System beregner alt automatisk
6. Bruger gemmer kalkulation
7. Bruger kan eksportere til tilbud
```

---

## Prioriteret Rækkefølge

1. **NU**: Settings-system + UI
2. **Derefter**: Kalkulationsmotor
3. **Så**: Hurtig-kalkulation wizard
4. **Til sidst**: Tilbuds-integration

Start: Settings migration og UI
