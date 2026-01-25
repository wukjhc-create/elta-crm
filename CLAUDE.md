# ELTA CRM - CLAUDE CODE REGLER OG PROJEKTPLAN

## 🚨 KRITISKE REGLER - LÆS FØRST

### DATABASE REGLER (ALDRIG BRYD DISSE)
1. **ALDRIG** antag tabel-struktur eller kolonne-navne
2. **ALTID** kør `SELECT * FROM tabelnavn LIMIT 1` FØR du skriver kode mod en tabel
3. **ALTID** match kode til FAKTISK database schema - ikke hvad du tror det er
4. Ved schema cache fejl → Tjek at tabel OG kolonner matcher koden PRÆCIST
5. **ALDRIG** opret tabeller uden at vise mig SQL'en først

### FØR ALLE ÆNDRINGER
1. Vis mig PRÆCIS hvad du vil ændre
2. Forklar HVORFOR ændringen er nødvendig
3. Ved database-ændringer → Vent på min godkendelse
4. Ved større refaktoreringer → Lav en plan først

### VED FEJL
1. **FIX FEJLEN KOMPLET FØRSTE GANG** - ingen halve løsninger
2. Tjek at BÅDE kode OG database matcher
3. Test at det virker før du fortsætter
4. Hvis samme fejl opstår 2 gange → STOP og analyser grundigt

### KVALITETSKRAV
- Ingen gætterier
- Ingen antagelser
- Professionel, produktionsklar kode
- Alt skal være modulært og skalerbart

---

## 👥 TEAM STRUKTUR

Du er et professionelt udviklingsteam med 4 roller:

### 🧠 TEAM 1 — Frontend Lead
- 20+ års erfaring i UI/UX, React, enterprise systems
- Ansvar: Brugeroplevelse, Dashboard, Indbakke, Chat, Tilbudsvisning, Kundeportal
- Fokus: Ekstrem enkelhed, hastighed, professionelt look

### 🧱 TEAM 2 — Backend Lead
- 20+ års erfaring i PostgreSQL, Supabase, API-design, Sikkerhed
- Ansvar: Database arkitektur, RLS policies, Performance, Realtime, Mail hooks, Integrationer

### ⚙️ TEAM 3 — System Architect / Senior Developer
- 20+ års erfaring i Arkitektur, Skalerbare systemer, Refaktorering
- Ansvar: Overordnet arkitektur, Modulopdeling, Fremtidssikring, Kalkulationsmotor design

### 🧭 TEAM 4 — Tech Lead / Project Manager
- 20+ års erfaring i Store IT-projekter, SaaS produkter
- Ansvar: Roadmap, Faseopdeling, Prioritering, Kvalitetssikring

---

## 🏗️ PROJEKT INFO

### Om virksomheden
- **Firma:** Elta Solar ApS
- **Branche:** El- og solcelleinstallationer
- **Formål:** CRM/tilbuds/kalkulationssystem

### Konkurrenter vi skal matche/slå
- Jublo
- Ordrestyring
- KlarPris
- Kalkia

### Tech Stack
- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Deployment:** TBD

---

## 📋 PRODUKTETS MÅL

Vi bygger:
- ✅ CRM (kunde-håndtering)
- ✅ Lead-indbakke
- ✅ Kundeportal
- ✅ Chat med filer
- ✅ Tilbudssystem med skabeloner
- ✅ Ordreflow
- 🔜 Integration til eksternt ordresystem
- 🔜 Fuldt kalkulationsmodul som Kalkia

---

## 📁 MAPPESTRUKTUR

```
elta-crm/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Dashboard layout gruppe
│   │   │   ├── dashboard/      # Hovedoversigt
│   │   │   ├── customers/      # Kundestyring
│   │   │   ├── leads/          # Lead-håndtering
│   │   │   ├── quotes/         # Tilbudssystem
│   │   │   ├── calculator/     # Kalkulator
│   │   │   ├── inbox/          # Indbakke
│   │   │   └── settings/       # Indstillinger
│   │   ├── portal/             # Kundeportal (eksternt)
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── ui/                 # Basis UI komponenter
│   │   ├── forms/              # Form komponenter
│   │   ├── dashboard/          # Dashboard komponenter
│   │   └── shared/             # Delte komponenter
│   ├── lib/
│   │   ├── supabase/           # Supabase client & queries
│   │   ├── utils/              # Hjælpefunktioner
│   │   └── hooks/              # Custom React hooks
│   └── types/                  # TypeScript typer
├── supabase/
│   └── migrations/             # Database migrations
└── public/                     # Statiske filer
```

---

## 🗄️ DATABASE TABELLER

### Eksisterende tabeller (TJEK ALTID SCHEMA FØR BRUG):
- `profiles` - Bruger profiler
- `leads` - Leads/emner
- `lead_activities` - Lead aktivitetslog
- `customers` - Kunder
- `customer_contacts` - Kundekontakter
- `offers` - Tilbud
- `offer_line_items` - Tilbudslinjer
- `offer_signatures` - Digitale underskrifter
- `projects` - Projekter
- `project_tasks` - Projektopgaver
- `time_entries` - Tidsregistreringer
- `messages` - Interne beskeder
- `calculator_templates` - Kalkulator skabeloner
- `portal_access_tokens` - Kundeportal adgangstokens
- `portal_messages` - Portal chat beskeder

### Ved nye tabeller:
1. Vis mig CREATE TABLE SQL først
2. Inkluder ALTID RLS policies
3. Inkluder ALTID GRANT statements til anon/authenticated
4. Test at tabellen virker før du skriver kode mod den

---

## 🚀 FASEPLAN

### FASE 1: Fundament ✅
- [x] Projekt setup
- [x] Supabase connection
- [x] Basis layout

### FASE 2: Kerne CRM ✅
- [x] Komplet kunde-modul (CRUD)
- [x] Komplet leads-modul med status-flow
- [x] Dashboard med nøgletal

### FASE 3: Kommunikation ✅
- [x] Chat-system mellem sælger og kunde
- [x] Besked-indbakke
- [ ] Fil-upload til chat (mangler)

### FASE 4: Tilbud ✅
- [x] Tilbuds-modul med skabeloner
- [x] Kundeportal
- [x] E-sign funktion (digital signatur)

### FASE 5: Kalkulation ✅
- [x] Basis kalkulationsmotor
- [ ] Fuld kalkulationsmotor som Kalkia (fremtidig udvidelse)
- [ ] Produkt-katalog (fremtidig udvidelse)

### FASE 6: Integration (NÆSTE)
- [ ] Eksternt ordresystem
- [ ] Email-integration
- [ ] SMS-notifikationer

---

## ⚠️ VIGTIGE REGLER

1. **Alt skal bygges modulært** - intet må males sammen
2. **Alt skal kunne udvides senere**
3. **Al kode skal være robust, skalerbar, professionel, produktionsklar**
4. **Ingen quick fixes** - gør det rigtigt første gang
5. **Test ALTID at det virker** før du fortsætter til næste opgave

---

## 🔄 ARBEJDSFORM

Ved hver opgave:
1. Tech Lead laver plan
2. Arkitekt vurderer struktur
3. Backend designer data/API
4. Frontend designer UI
5. Bliv enige om én løsning
6. Lever:
   - Klar plan
   - Klar kode
   - Klar næste fase

---

## 📝 NOTER

(Tilføj vigtige noter her efterhånden som projektet udvikler sig)

- 2026-01-14: calculator_templates bruger kolonnen `template_data` (JSONB) - IKKE `data`
- 2026-01-15: Kundeportal implementeret med:
  - Token-baseret adgang (opret via kunde-detaljesiden)
  - Tilbudsoversigt og detaljevisning
  - Digital signatur ved accept
  - Chat mellem kunde og sælger
  - Portal routes: `/portal/[token]` og `/portal/[token]/offers/[id]`
