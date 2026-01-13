# Elta CRM - Database Schema Documentation

## Overview

Elta CRM bruger PostgreSQL via Supabase med Row Level Security (RLS) til at sikre data. Databasen er organiseret i moduler der hver håndterer et specifikt forretningsområde.

## Migrations Oversigt

Kør migrations i denne rækkefølge:

1. `00000_initial_schema.sql` - Extensions og enum types
2. `00001_auth_tables.sql` - Bruger profiler
3. `00002_leads_module.sql` - Leads håndtering
4. `00003_inbox_module.sql` - Beskedsystem
5. `00004_customers_module.sql` - Kunder
6. `00005_offers_module.sql` - Tilbud
7. `00006_projects_module.sql` - Projekter
8. `00007_rls_policies.sql` - Sikkerhedspolitikker

## Enum Types

### `user_role`
Brugerroller i systemet:
- `admin` - Fuld adgang
- `user` - Standard bruger
- `technician` - Tekniker (begrænset adgang)

### `lead_status`
Status for leads:
- `new` - Ny lead
- `contacted` - Kontaktet
- `qualified` - Kvalificeret
- `proposal` - Tilbud sendt
- `negotiation` - Forhandling
- `won` - Vundet
- `lost` - Tabt

### `lead_source`
Kilde til lead:
- `website` - Hjemmeside
- `referral` - Henvisning
- `email` - E-mail
- `phone` - Telefon
- `social` - Sociale medier
- `other` - Andet

### `offer_status`
Status for tilbud:
- `draft` - Kladde
- `sent` - Sendt
- `viewed` - Set
- `accepted` - Accepteret
- `rejected` - Afvist
- `expired` - Udløbet

### `project_status`
Status for projekter:
- `planning` - Planlægning
- `active` - Aktiv
- `on_hold` - På hold
- `completed` - Afsluttet
- `cancelled` - Annulleret

### `project_priority`
Prioritet for projekter og opgaver:
- `low` - Lav
- `medium` - Mellem
- `high` - Høj
- `urgent` - Kritisk

### `message_status`
Status for beskeder:
- `unread` - Ulæst
- `read` - Læst
- `archived` - Arkiveret

### `message_type`
Type af besked:
- `email` - E-mail
- `sms` - SMS
- `internal` - Intern besked
- `note` - Note

## Tabeller

### `profiles`
Udvider Supabase auth.users med ekstra brugerdata.

**Kolonner:**
- `id` (UUID, PK) - Reference til auth.users
- `email` (TEXT) - E-mail adresse
- `full_name` (TEXT) - Fulde navn
- `avatar_url` (TEXT) - Avatar billede URL
- `role` (user_role) - Brugerrolle
- `phone` (TEXT) - Telefonnummer
- `department` (TEXT) - Afdeling
- `is_active` (BOOLEAN) - Aktiv status
- `created_at` (TIMESTAMPTZ) - Oprettelsestidspunkt
- `updated_at` (TIMESTAMPTZ) - Opdateringstidspunkt

**Triggers:**
- `handle_new_user()` - Opretter automatisk profil når ny bruger registreres
- `update_updated_at_column()` - Opdaterer updated_at ved ændringer

### `leads`
Potentielle kunder/salgsleads.

**Kolonner:**
- `id` (UUID, PK)
- `company_name` (TEXT) - Firmanavn
- `contact_person` (TEXT) - Kontaktperson
- `email` (TEXT) - E-mail
- `phone` (TEXT) - Telefon
- `status` (lead_status) - Status
- `source` (lead_source) - Kilde
- `value` (DECIMAL) - Estimeret værdi
- `probability` (INTEGER) - Sandsynlighed (0-100%)
- `expected_close_date` (DATE) - Forventet lukkedato
- `notes` (TEXT) - Noter
- `assigned_to` (UUID, FK) - Tildelt bruger
- `created_by` (UUID, FK) - Oprettet af
- `tags` (TEXT[]) - Tags
- `custom_fields` (JSONB) - Tilpassede felter
- `created_at`, `updated_at`

**Indexes:**
- status, assigned_to, created_by, created_at, email, company_name

### `lead_activities`
Aktivitetslog for leads (audit trail).

**Kolonner:**
- `id` (UUID, PK)
- `lead_id` (UUID, FK)
- `activity_type` (TEXT) - Aktivitetstype
- `description` (TEXT) - Beskrivelse
- `performed_by` (UUID, FK) - Udført af
- `created_at` (TIMESTAMPTZ)

### `customers`
Konverterede kunder.

**Kolonner:**
- `id` (UUID, PK)
- `customer_number` (TEXT, UNIQUE) - Kundenummer (C000001, C000002...)
- `company_name` (TEXT) - Firmanavn
- `contact_person` (TEXT) - Kontaktperson
- `email` (TEXT) - E-mail
- `phone`, `mobile` (TEXT) - Telefon
- `website` (TEXT) - Hjemmeside
- `vat_number` (TEXT) - CVR nummer
- `billing_address`, `billing_city`, `billing_postal_code`, `billing_country` - Fakturaadresse
- `shipping_address`, `shipping_city`, `shipping_postal_code`, `shipping_country` - Leveringsadresse
- `notes` (TEXT) - Noter
- `tags` (TEXT[]) - Tags
- `custom_fields` (JSONB) - Tilpassede felter
- `is_active` (BOOLEAN) - Aktiv
- `created_by` (UUID, FK)
- `created_at`, `updated_at`

**Functions:**
- `generate_customer_number()` - Auto-genererer næste kundenummer

### `customer_contacts`
Yderligere kontaktpersoner hos kunden.

**Kolonner:**
- `id` (UUID, PK)
- `customer_id` (UUID, FK)
- `name` (TEXT) - Navn
- `title` (TEXT) - Titel
- `email`, `phone`, `mobile` (TEXT) - Kontaktinfo
- `is_primary` (BOOLEAN) - Primær kontakt
- `notes` (TEXT) - Noter
- `created_at`, `updated_at`

### `offers`
Tilbud/offerter til kunder.

**Kolonner:**
- `id` (UUID, PK)
- `offer_number` (TEXT, UNIQUE) - Tilbudsnummer (TILBUD-2026-0001...)
- `title` (TEXT) - Titel
- `description` (TEXT) - Beskrivelse
- `status` (offer_status) - Status
- `customer_id` (UUID, FK) - Kunde
- `lead_id` (UUID, FK) - Lead (valgfrit)
- `total_amount` (DECIMAL) - Subtotal
- `discount_percentage` (DECIMAL) - Rabat %
- `discount_amount` (DECIMAL) - Rabat beløb
- `tax_percentage` (DECIMAL) - Moms % (default 25%)
- `tax_amount` (DECIMAL) - Moms beløb
- `final_amount` (DECIMAL) - Samlet beløb
- `currency` (TEXT) - Valuta (default DKK)
- `valid_until` (DATE) - Gyldig til
- `terms_and_conditions` (TEXT) - Vilkår
- `notes` (TEXT) - Noter
- `sent_at`, `viewed_at`, `accepted_at`, `rejected_at` (TIMESTAMPTZ) - Statusdatoer
- `created_by` (UUID, FK)
- `created_at`, `updated_at`

**Functions:**
- `generate_offer_number()` - Auto-genererer tilbudsnummer
- `update_offer_totals()` - Beregner totaler automatisk

### `offer_line_items`
Linjeemner i tilbud.

**Kolonner:**
- `id` (UUID, PK)
- `offer_id` (UUID, FK)
- `position` (INTEGER) - Rækkefølge
- `description` (TEXT) - Beskrivelse
- `quantity` (DECIMAL) - Antal
- `unit` (TEXT) - Enhed (stk, timer, etc.)
- `unit_price` (DECIMAL) - Enhedspris
- `discount_percentage` (DECIMAL) - Rabat %
- `total` (DECIMAL) - Total (beregnes automatisk)
- `created_at`

**Triggers:**
- `calculate_line_item_total()` - Beregner total automatisk
- `update_offer_totals()` - Opdaterer tilbuddets totaler

### `projects`
Projekter knyttet til kunder.

**Kolonner:**
- `id` (UUID, PK)
- `project_number` (TEXT, UNIQUE) - Projektnummer (P26-0001...)
- `name` (TEXT) - Navn
- `description` (TEXT) - Beskrivelse
- `status` (project_status) - Status
- `priority` (project_priority) - Prioritet
- `customer_id` (UUID, FK) - Kunde
- `offer_id` (UUID, FK) - Tilbud (valgfrit)
- `start_date`, `end_date` (DATE) - Datoer
- `estimated_hours` (DECIMAL) - Estimerede timer
- `actual_hours` (DECIMAL) - Faktiske timer (auto-beregnet)
- `budget` (DECIMAL) - Budget
- `actual_cost` (DECIMAL) - Faktisk omkostning
- `project_manager_id` (UUID, FK) - Projektleder
- `assigned_technicians` (UUID[]) - Tildelte teknikere
- `notes` (TEXT) - Noter
- `tags` (TEXT[]) - Tags
- `custom_fields` (JSONB)
- `created_by` (UUID, FK)
- `created_at`, `updated_at`

**Functions:**
- `generate_project_number()` - Auto-genererer projektnummer
- `update_project_actual_hours()` - Opdaterer faktiske timer

### `project_tasks`
Opgaver i projekter.

**Kolonner:**
- `id` (UUID, PK)
- `project_id` (UUID, FK)
- `title` (TEXT) - Titel
- `description` (TEXT) - Beskrivelse
- `status` (TEXT) - Status (todo, in_progress, review, done)
- `priority` (project_priority) - Prioritet
- `assigned_to` (UUID, FK) - Tildelt til
- `estimated_hours` (DECIMAL) - Estimerede timer
- `actual_hours` (DECIMAL) - Faktiske timer (auto-beregnet)
- `due_date` (DATE) - Deadline
- `completed_at` (TIMESTAMPTZ) - Fuldført tidspunkt
- `position` (INTEGER) - Position/rækkefølge
- `created_by` (UUID, FK)
- `created_at`, `updated_at`

**Triggers:**
- `update_task_actual_hours()` - Opdaterer faktiske timer

### `time_entries`
Tidssporing for projekter og opgaver.

**Kolonner:**
- `id` (UUID, PK)
- `project_id` (UUID, FK) - Projekt
- `task_id` (UUID, FK) - Opgave (valgfrit)
- `user_id` (UUID, FK) - Bruger
- `description` (TEXT) - Beskrivelse
- `hours` (DECIMAL) - Timer
- `date` (DATE) - Dato
- `billable` (BOOLEAN) - Fakturerbar
- `created_at`, `updated_at`

**Triggers:**
- `update_project_actual_hours()` - Opdaterer projekt timer
- `update_task_actual_hours()` - Opdaterer opgave timer

### `messages`
Intern kommunikation og beskeder.

**Kolonner:**
- `id` (UUID, PK)
- `subject` (TEXT) - Emne
- `body` (TEXT) - Besked
- `message_type` (message_type) - Type
- `status` (message_status) - Status
- `from_user_id` (UUID, FK) - Fra bruger
- `from_email`, `from_name` (TEXT) - Fra info
- `to_user_id` (UUID, FK) - Til bruger
- `to_email` (TEXT) - Til email
- `cc`, `bcc` (TEXT[]) - CC/BCC
- `reply_to` (UUID, FK) - Svar på besked
- `lead_id`, `customer_id`, `project_id` (UUID, FK) - Relaterede entiteter
- `attachments` (JSONB) - Vedhæftede filer
- `read_at`, `archived_at` (TIMESTAMPTZ) - Status datoer
- `created_at`

**Triggers:**
- `update_message_status()` - Opdaterer status når læst/arkiveret

## Row Level Security (RLS)

Alle tabeller har RLS aktiveret. Policies sikrer at:

### Profiles
- Alle kan se aktive profiler
- Brugere kan opdatere egen profil
- Admins har fuld adgang

### Leads
- Brugere ser leads de er tildelt eller har oprettet
- Admins ser alle
- Kun admins kan slette

### Customers
- Alle autentificerede brugere kan se aktive kunder
- Kun admins kan slette

### Offers
- Brugere ser tilbud de har oprettet eller er relateret til
- Kun admins kan slette

### Projects
- Brugere ser projekter de er involveret i (projektleder eller tildelt tekniker)
- Admins ser alle

### Time Entries
- Brugere ser egne tidsposter
- Projektledere ser tidsposter for deres projekter
- Admins ser alle

## Automatiske Beregninger

Systemet har indbyggede triggers der automatisk:

1. **Offer Totals**: Beregner subtotal, rabat, moms og samlet beløb
2. **Project Hours**: Summerer tidsposter til faktiske projekttimer
3. **Task Hours**: Summerer tidsposter til faktiske opgavetimer
4. **Message Status**: Markerer beskeder som læst/arkiveret
5. **Updated At**: Opdaterer updated_at felter ved ændringer

## Nummergenerering

Følgende entiteter får auto-genererede numre:

- **Kunder**: `C000001`, `C000002`, etc.
- **Tilbud**: `TILBUD-2026-0001`, `TILBUD-2026-0002`, etc.
- **Projekter**: `P26-0001`, `P26-0002`, etc.

## Relationer

```
profiles (users)
├── leads.assigned_to
├── leads.created_by
├── lead_activities.performed_by
├── messages.from_user_id
├── messages.to_user_id
├── customers.created_by
├── offers.created_by
├── projects.project_manager_id
├── projects.assigned_technicians[]
├── projects.created_by
├── project_tasks.assigned_to
├── project_tasks.created_by
└── time_entries.user_id

customers
├── offers.customer_id
├── projects.customer_id
├── customer_contacts.customer_id
└── messages.customer_id

leads
├── offers.lead_id
└── messages.lead_id

offers
└── projects.offer_id

projects
├── project_tasks.project_id
├── time_entries.project_id
└── messages.project_id

project_tasks
└── time_entries.task_id
```

## Opsætning

1. Opret Supabase projekt
2. Kør migrations i rækkefølge (00000 til 00007)
3. Opret admin bruger i Supabase Auth
4. Opdater brugerens rolle i profiles tabellen til 'admin'
5. (Valgfrit) Kør seed.sql for testdata

## Vedligeholdelse

- Brug `updated_at` felter til optimistisk locking
- Tjek RLS policies regelmæssigt
- Monitorer performance med indexes
- Backup database dagligt (Supabase gør dette automatisk)
