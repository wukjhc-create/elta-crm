# ELTA Assistant / Telegram — design fase 1 (T1–T10)

**Princip:** CRM er source of truth. Telegram-laget gemmer KUN koblingen Telegram-chat ↔ CRM-bruger. Opgaver,
tidspunkter, noter og aftaler ligger i CRM's eksisterende tabeller; Telegram læser dem ved hver handling.
**Gate:** ingen live bot (token/webhook/afsendelse) i prod uden separat godkendelse. Alt bygges og testes på staging.

## Dataflow
```
Telegram-besked → /api/assistant/telegram (webhook, hemmelig header) → kobling → CRM-bruger + rolle
  → parseAssistantCommand (ren)           src/lib/assistant/command-parser.ts   ✅ T1
  → resolveTarget (kunde/sag, aldrig gæt)  src/lib/assistant/resolve-target.ts   ✅ T1
  → handling i CRM (samme rettigheder som brugerens rolle i CRM) → audit_logs
  → svar i Telegram (knapper: Ring nu · Åbn kunde · Udsæt · Udført)
Påmindelser: cron læser customer_tasks.reminder_at (CRM) → sender → audit-række markerer "sendt" for netop det
tidspunkt. Flyttes/ændres tiden i CRM, gælder den nye tid automatisk (ingen kopi i Telegram-laget) — T4.
```

## Kortlægning til eksisterende CRM-tabeller (verificeret skema 2026-10-07)
| Kommando | CRM | Bemærkning |
|---|---|---|
| Ring til X … (T1) | `customer_tasks` (title "Ring til …", due_date, reminder_at, assigned_to = brugeren, auto_rule `assistant_callback`, service_case_id ved sag) | kræver kunde (customer_id NOT NULL) |
| Mind mig om … (T7) | `customer_tasks` | **Beslutning:** customer_id er NOT NULL → påmindelse UDEN kunde kan ikke gemmes i dag. Muligheder: (a) kræv kunde/sag i kommandoen, (b) migration: customer_id nullable (påvirker mange joins), (c) egen tabel (bryder "ét datasæt"). Anbefaling: (a) nu, (b) senere hvis behov |
| Note på kunde/sag (T6) | kundens/sagens eksisterende note-mekanisme (afklares: `customers.notes` er ét felt — overskrivning uønsket) | **Afklares** før build: tilføj som opgave-kommentar/aktivitet i stedet for at overskrive notes |
| Besigtigelse/aftale (T5) | `bookBesigtigelse`-flowet (customer_tasks "Besigtigelse") | genbrug eksisterende logik |
| Opslag (T8) | customers / service_cases med brugerens rettigheder | montør kun eget scope |
| Kalender (T2) | Kalenderens månedsvisning viser i dag kun besigtigelses-opgaver; dag/uge kun arbejdsordrer | udvid månedsvisning med assistent-callbacks |
| Audit (T9) | `audit_logs` (entity_type `assistant`, action `assistant_<handling>`, metadata: kanal, kommando-type, mål-id) | ingen ny tabel |

## Ny tabel (KRÆVER GODKENDELSE — SQL vist her, ikke anvendt)
`assistant_links`: kobling af én Telegram-chat til én aktiv CRM-bruger via engangskode genereret i CRM
(Indstillinger → Profil → "Forbind Telegram"). Kun inviterede medarbejdere; deaktiveret bruger = ingen adgang.
Se `supabase/migrations/00195_assistant_links.sql` (udkast).

## Sikkerhed
- Webhook: Telegrams `X-Telegram-Bot-Api-Secret-Token` sammenlignes timing-safe; ukendt chat → ingen data, kun
  "forbind din konto i CRM".
- Rettigheder: brugerens CRM-rolle (permissions.ts) håndhæves server-side for hver handling (admin-klient + eksplicit
  rolle-tjek, da webhook ikke har browser-session). Montør ser kun eget scope.
- Ingen persondata i Telegram ud over det brugeren selv spørger om; ingen kost/løn i svar.
- Alle handlinger audit-logges (T9).
