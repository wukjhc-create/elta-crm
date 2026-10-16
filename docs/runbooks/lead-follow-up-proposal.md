# Forslag: fælles opfølgning på leads (00233) — kræver Henriks godkendelse

**Status:** FORSLAG (2026-10-16). Migrationen er skrevet (`supabase/migrations/00233_lead_follow_up.sql`) men IKKE kørt
nogen steder. Kode bygges, så den virker både før og efter migrationen (procesregel 2026-10-16).

## Hvorfor
Henrik 2026-10-16: lead-opfølgning skal være fælles salgsdata (ikke private påmindelser): hvornår, hvem, forfalden,
synlig i lead-liste/tavle og i kalender/opgaver. Interimsløsningen (W-9 "Påmind mig" som .ics) gemmer intet i CRM'et.

## Schema (kun nye, valgfrie kolonner på `leads`)
| Kolonne | Type | Betydning |
|---|---|---|
| `follow_up_at` | timestamptz NULL | Hvornår der skal følges op (vises/indtastes i dansk tid) |
| `follow_up_owner` | uuid NULL → profiles(id) ON DELETE SET NULL | Hvem (standard i UI: leadets ansvarlige) |
| `follow_up_note` | text NULL, ≤ 500 tegn | Hvad opfølgningen går ud på |

- "Forfalden" afledes: `follow_up_at < nu` og lead ikke vundet/tabt — intet statusfelt at holde i sync.
- Indeks: `idx_leads_follow_up_open (follow_up_at) WHERE follow_up_at IS NOT NULL AND status NOT IN ('won','lost')`.
- RLS: eksisterende leads-politikker gælder (samme synlighed som leadet). Ingen nye tabeller, ingen backfill.

## Risiko
Lav: additive, nullable kolonner; eksisterende rækker og beløb uændrede. Rollback = DROP INDEX + DROP COLUMN (står i
migrationen).

## Pre/post-check
- Pre: kolonnerne findes ikke; antal leads + checksum (id, status, assigned_to).
- Post: kolonnerne findes (alle NULL), samme antal/checksum, prod-db-audit 0/0/0.

## Rækkefølge (procesregel)
1. Kode med feature-flag `LEAD_FOLLOW_UP_ENABLED` (læser/skriver kun kolonnerne når flaget er sat) → test på staging
   (00233 på staging) → push (flag slået fra i prod).
2. Migration i prod efter godkendelse → post-check → flag til i prod.

## UI (efter godkendelse)
- Lead-detalje: "Opfølgning" (dato/tid, ejer, note) — gem/ryd; vises som mærke "Opfølg i dag" / "Forfalden".
- Leadliste/tavle: kolonne/mærke + filter "Forfaldne opfølgninger".
- Kalender/opgaver: forfaldne/dagens opfølgninger i "Mine opgaver" for ejeren (læses fra leads — ingen kopi).
- Rettigheder: læs = leads.view; ændre = leads.edit. Negative rolletests (montør ser intet).
