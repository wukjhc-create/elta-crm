# Supabase Setup Guide for Elta CRM

Denne guide hjælper dig med at oprette og konfigurere din Supabase database til Elta CRM.

## 📋 Forudsætninger

- En Supabase konto (gratis tier er tilstrækkeligt til udvikling)
- Adgang til Supabase Dashboard
- 10-15 minutter til opsætning

## 🚀 Trin-for-Trin Opsætning

### Trin 1: Opret Supabase Projekt

1. **Gå til Supabase Dashboard**
   - Åbn https://supabase.com/dashboard
   - Log ind eller opret en konto

2. **Opret nyt projekt**
   - Klik på "New Project"
   - Vælg din organisation (eller opret en ny)
   - Udfyld projekt detaljer:
     - **Name**: `elta-crm` (eller dit foretrukne navn)
     - **Database Password**: Vælg en stærk adgangskode (GEM DEN!)
     - **Region**: Vælg `Europe West (London)` eller nærmeste region
     - **Pricing Plan**: Free tier er fint til udvikling

3. **Vent på projekt setup**
   - Dette tager cirka 1-2 minutter
   - Du får en notifikation når projektet er klar

### Trin 2: Find dine API Keys

1. **Gå til Project Settings**
   - Klik på "Settings" ikonet (tandhjul) i venstre sidebar
   - Vælg "API" under Project Settings

2. **Kopier følgende værdier:**

   **Project URL:**
   ```
   https://your-project-id.supabase.co
   ```

   **Anon (public) key:**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   **Service Role key:** (vises kun når du klikker "Reveal")
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   ⚠️ **VIGTIGT**: Service Role key er hemmeligt! Del det aldrig og commit det ikke til git.

### Trin 3: Opdater Environment Variables

1. **Åbn `.env.local` i din editor**

2. **Erstat placeholder-værdierne med dine faktiske keys:**

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-actual-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... (din anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (din service role key)

# Resten forbliver det samme
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Elta CRM"
NEXT_PUBLIC_DEFAULT_LOCALE=da
```

3. **Gem filen**

### Trin 4: Kør Database Migrations

#### Metode 1: Via Supabase Dashboard (Anbefalet for første gang)

1. **Gå til SQL Editor**
   - Klik på "SQL Editor" i venstre sidebar
   - Klik på "New Query"

2. **Kør hver migration i rækkefølge:**

   **Migration 1: Initial Schema**
   - Åbn `supabase/migrations/00000_initial_schema.sql`
   - Kopier hele indholdet
   - Indsæt i SQL Editor
   - Klik "Run" (eller tryk Ctrl+Enter)
   - Vent på "Success" besked

   **Migration 2: Auth Tables**
   - Åbn `supabase/migrations/00001_auth_tables.sql`
   - Kopier og kør som ovenfor
   - Gentag for alle migrations i rækkefølge

   **Fortsæt med:**
   - `00002_leads_module.sql`
   - `00003_inbox_module.sql`
   - `00004_customers_module.sql`
   - `00005_offers_module.sql`
   - `00006_projects_module.sql`
   - `00007_rls_policies.sql`

3. **Verificer Success**
   - Hver migration skulle vise "Success" ✓
   - Hvis fejl opstår, læs fejlbeskeden og ret problemet

#### Metode 2: Via Supabase CLI (Avanceret)

```bash
# Installer Supabase CLI
npm install -g supabase

# Login
supabase login

# Link til dit projekt
supabase link --project-ref your-project-ref

# Push alle migrations
supabase db push

# Eller kør individuelle migrations
supabase db execute -f supabase/migrations/00000_initial_schema.sql
```

### Trin 5: Verificer Database Setup

1. **Tjek Tables**
   - Gå til "Table Editor" i Supabase Dashboard
   - Du skulle se følgende tables:
     - profiles
     - leads
     - lead_activities
     - messages
     - customers
     - customer_contacts
     - offers
     - offer_line_items
     - projects
     - project_tasks
     - time_entries

2. **Tjek RLS Policies**
   - Vælg en table (f.eks. "leads")
   - Klik på "RLS" fanen
   - Du skulle se flere policies aktiveret

### Trin 6: Opret din første Admin Bruger

#### Via Supabase Dashboard

1. **Gå til Authentication**
   - Klik på "Authentication" i sidebar
   - Klik på "Users" tab
   - Klik "Add User" eller "Invite"

2. **Udfyld brugerdata:**
   - **Email**: din-email@elta.dk
   - **Password**: Vælg en stærk adgangskode
   - **Auto Confirm User**: ✓ (vælg denne)
   - Klik "Create User"

3. **Opdater brugerens rolle til Admin**

   Gå til SQL Editor og kør:

   ```sql
   -- Find din bruger ID først
   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

   -- Opdater rollen (erstat UUID med din bruger ID)
   UPDATE profiles
   SET role = 'admin'
   WHERE id = 'din-bruger-uuid-her';

   -- Verificer
   SELECT email, role, is_active FROM profiles WHERE email = 'din-email@elta.dk';
   ```

### Trin 7: Konfigurer Auth Settings

1. **Gå til Authentication Settings**
   - Authentication → Settings

2. **Site URL** (under Configuration)
   - Tilføj: `http://localhost:3000`
   - Tilføj: `http://localhost:3000/**` (for wildcards)

3. **Redirect URLs** (under Configuration)
   - Tilføj: `http://localhost:3000/auth/callback`
   - Når du deployer, tilføj også production URL

4. **Email Templates** (valgfrit - kan gøres senere)
   - Authentication → Email Templates
   - Tilpas emails til dansk sprog

### Trin 8: Test Forbindelsen

1. **Start din Next.js app:**
   ```bash
   npm run dev
   ```

2. **Åbn browser:**
   - Gå til http://localhost:3000
   - Tjek browser console for fejl
   - Ingen Supabase fejl = success! ✅

### Trin 9: Generer TypeScript Types (Valgfrit men anbefalet)

Dette genererer TypeScript types fra din database:

```bash
# Installer Supabase CLI hvis du ikke har det
npm install -g supabase

# Login og link projekt
supabase login
supabase link --project-ref your-project-ref

# Generer types
supabase gen types typescript --linked > src/types/database.types.ts
```

Eller manuelt via dashboard:
1. Gå til API Docs
2. Find "TypeScript" section
3. Kopier types til `src/types/database.types.ts`

## ✅ Verification Checklist

Brug denne checklist til at verificere alt er sat korrekt op:

- [ ] Supabase projekt oprettet
- [ ] API keys kopieret til `.env.local`
- [ ] Alle 8 migrations kørt successfully
- [ ] 11 tables synlige i Table Editor
- [ ] RLS policies aktiveret på alle tables
- [ ] Admin bruger oprettet og rolle sat til 'admin'
- [ ] Site URL og Redirect URLs konfigureret
- [ ] Next.js app starter uden Supabase fejl
- [ ] (Valgfrit) TypeScript types genereret

## 🐛 Fejlfinding

### Fejl: "relation does not exist"
**Problem**: Tables er ikke oprettet korrekt
**Løsning**: Kør migrations igen i korrekt rækkefølge

### Fejl: "permission denied for table"
**Problem**: RLS policies mangler eller er forkerte
**Løsning**: Kør `00007_rls_policies.sql` igen

### Fejl: "new row violates row-level security policy"
**Problem**: Din bruger har ikke admin rolle
**Løsning**: Kør SQL query i Trin 6 for at opdatere rolle

### Fejl: "Failed to fetch"
**Problem**: Forkerte API keys eller URL
**Løsning**: Dobbelttjek `.env.local` keys matcher Supabase dashboard

### Fejl: "Invalid JWT"
**Problem**: Anon key er forkert eller udløbet
**Løsning**: Kopier fresh anon key fra Supabase dashboard

## 📊 Næste Trin

Efter succesfuld opsætning:

1. ✅ **Test Authentication**
   - Prøv at logge ind med din admin bruger
   - Verificer at du kan tilgå dashboard

2. ✅ **Udforsyk Database**
   - Opret en test lead i dashboard
   - Verificer at RLS policies virker

3. ✅ **Add Seed Data** (valgfrit)
   - Kør `supabase/seed.sql` for testdata
   - Husk at opdatere UUIDs først

4. ✅ **Fortsæt Udvikling**
   - Nu er backend klar!
   - Byg frontend komponenter
   - Test alle moduler

## 🔒 Sikkerhedstjekliste

- [ ] Service Role Key er ALDRIG exposed i frontend
- [ ] `.env.local` er i `.gitignore`
- [ ] RLS policies er aktiveret på alle tables
- [ ] Database password er stærk og gemt sikkert
- [ ] Production keys er forskellige fra development

## 📞 Support

**Supabase Documentation:**
- https://supabase.com/docs

**Elta CRM Specifik Hjælp:**
- Se `supabase/SCHEMA.md` for database dokumentation
- Se `README.md` for generel setup

**Problemer?**
- Tjek Supabase Logs: Dashboard → Logs
- Tjek Browser Console for frontend fejl
- Verificer alle environment variables er sat

---

**Status**: 🟢 Klar til udvikling når alle steps er completed!
