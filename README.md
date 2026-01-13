# Elta CRM

En professionel CRM-løsning bygget med moderne teknologier.

## 🚀 Teknologi Stack

- **Framework**: Next.js 16 (App Router)
- **Sprog**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Autentificering**: Supabase Auth med rollebaseret adgangskontrol
- **UI**: shadcn/ui + Tailwind CSS
- **Formularhåndtering**: React Hook Form + Zod
- **Containerization**: Docker + Docker Compose

## 📋 Funktioner

- ✅ Brugerautentificering med roller (Admin, Bruger, Tekniker)
- 📊 **Leads**: Administrer potentielle kunder
- 📬 **Indbakke**: Intern kommunikation
- 💼 **Tilbud**: Opret og administrer tilbud
- 👥 **Kunder**: Komplet kundedatabase
- 🔨 **Projekter**: Projektstyring med opgaver og tidssporing

## 🏗️ Projekt Struktur

```
elta-crm/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/          # Autentificeringssider
│   │   ├── (dashboard)/     # Beskyttede dashboard-ruter
│   │   └── api/             # API-ruter
│   ├── components/          # React komponenter
│   │   ├── ui/              # shadcn/ui komponenter
│   │   ├── modules/         # Modul-specifikke komponenter
│   │   └── shared/          # Delte komponenter
│   ├── lib/                 # Hjælpefunktioner
│   ├── types/               # TypeScript typer
│   └── locales/             # Danske oversættelser
├── supabase/
│   └── migrations/          # Database migrationer
├── docker/                  # Docker konfiguration
└── .github/workflows/       # CI/CD pipelines
```

## 🛠️ Forudsætninger

- Node.js 20+
- npm eller pnpm
- Supabase konto
- Docker (valgfrit)

## 📦 Installation

1. **Klon repositoriet**
   ```bash
   git clone https://github.com/yourusername/elta-crm.git
   cd elta-crm
   ```

2. **Installer dependencies**
   ```bash
   npm install
   ```

3. **Konfigurer miljøvariabler**

   Kopier `.env.example` til `.env.local` og opdater med dine Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

   Rediger `.env.local` og tilføj dine Supabase project detaljer:
   - `NEXT_PUBLIC_SUPABASE_URL`: Din Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Din Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY`: Din Supabase service role key

4. **Kør database migrationer**

   Du skal køre SQL migrations i din Supabase project:
   - Gå til din Supabase dashboard → SQL Editor
   - Kør alle migrations fra `supabase/migrations/` i rækkefølge

5. **Start udviklings-serveren**
   ```bash
   npm run dev
   ```

   Åbn [http://localhost:3000](http://localhost:3000) i din browser.

## 🐳 Docker

### Udvikling

```bash
cd docker
docker-compose up
```

### Production Build

```bash
docker build -f docker/Dockerfile -t elta-crm:latest .
docker run -p 3000:3000 elta-crm:latest
```

## 🗄️ Database

Projektet bruger Supabase PostgreSQL med Row Level Security (RLS) policies.

### Migrationer

Alle database migrationer findes i `supabase/migrations/`:
- `00000_initial_schema.sql`: Basis schema og extensions
- `00001_auth_tables.sql`: Bruger profiler og roller
- `00002_leads_module.sql`: Leads tabeller
- `00003_inbox_module.sql`: Besked-system
- `00004_offers_module.sql`: Tilbud og linjeemner
- `00005_customers_module.sql`: Kunder og kontakter
- `00006_projects_module.sql`: Projekter og opgaver
- `00007_rls_policies.sql`: Row Level Security policies

## 🔐 Autentificering & Authorization

Systemet bruger Supabase Auth med tre roller:

- **Admin**: Fuld adgang til alle moduler
- **Bruger**: Kan oprette og administrere leads, kunder, tilbud og projekter
- **Tekniker**: Læseadgang og opgavehåndtering

## 🧪 Testing

```bash
# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests (when implemented)
npm test
```

## 🚀 Deployment

### Vercel (Anbefalet)

1. Push til GitHub
2. Importer project i Vercel
3. Tilføj miljøvariabler i Vercel dashboard
4. Deploy

### Docker

Brug production Dockerfile til at bygge og deploye:

```bash
docker build -f docker/Dockerfile -t elta-crm .
```

## 📖 Udviklingsguide

### Tilføj en ny komponent

```bash
# Brug shadcn/ui CLI
npx shadcn-ui@latest add [component-name]
```

### Kodestil

Projektet bruger ESLint og Prettier:

```bash
# Format kode
npm run format

# Check formatting
npm run format:check
```

## 🤝 Bidrag

Se [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📝 Licens

Denne software er proprietær og ejet af Elta.

## 📧 Kontakt

For spørgsmål, kontakt udviklingsteamet.

---

Bygget med ❤️ af Elta development team
