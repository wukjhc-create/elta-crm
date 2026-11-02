# Forslag: eksplicit sagstype på tilbud (tilbud → sag arver typen)

Status: **ANVENDT** — staging 2026-11-01, prod 2026-11-02 (Henriks godkendelse; tilbud/sager-fingeraftryk uændret
før/efter, `scripts/prod-verify-00244.ts`). Afsnittene nedenfor er det oprindelige forslag.
Dato: 2026-11-01. Baggrund: aflevering-tjekliste pr. sagstype (lib/cases/handover-checklist) — solcellekrav kun når
`service_cases.type = 'solar'`.

## Problem

`createServiceCaseFromOffer` (src/lib/services/offer-to-case.ts) sætter altid `type: 'installation'`. Et solcelletilbud
bliver derfor en el-installationssag og får el-tjeklisten (uden inverter-/panelfoto) — medmindre kontoret manuelt skifter
sagstype bagefter. Vi gætter ikke typen ud fra titel, tekst, varenavne, kundenavn eller linjebeskrivelser.

## Inventar (prod, read-only: scripts/prod-offer-model-inventory.ts)

| Kandidat | Egnet? | Hvorfor |
|---|---|---|
| `offers.scope` | Nej | Fritekst ("Opgavens omfang"), vises for kunden på PDF/portal |
| `offers.title/description/notes` | Nej | Fritekst = gætteri |
| `offer_line_items` (varer) | Nej | Varenavne/kategorier = gætteri |
| `offer_packages.job_type` (solar/installation/service) | Nej (alene) | Struktureret, men tilbud gemmer ikke hvilken pakke de kom fra (ingen `package_id` på offers) |
| `offers.billing_model`, `vat_mode`, … | Nej | Andre betydninger |

Ingen eksisterende struktureret kolonne kan bære den tilsigtede sagstype → **ny kolonne**.
Prod i dag: 15 tilbud, 4 sager fra tilbud (alle `installation`), 3 pakker (solar/installation/service).

## Datamodel

`offers.case_type TEXT NULL` med CHECK `case_type IS NULL OR case_type IN ('solar', 'installation')`.

| Værdi | UI-tekst | → `service_cases.type` | Aflevering |
|---|---|---|---|
| `solar` | Solceller / batteri | `solar` | Solcelle-tjekliste (inverter, eltavle, paneler påkrævet) |
| `installation` | Elinstallation / service | `installation` | El-tjekliste (intet påkrævet) |
| `NULL` (historiske tilbud) | "Ikke valgt" | `installation` (= adfærd i dag) | El-tjekliste |

Kun to værdier; ingen klassifikationssystem. Værdierne er en delmængde af `service_cases_type_check`, så sagen kan arve
værdien 1:1.

## Migration 00244 (udkast — IKKE anvendt)

```sql
-- 00244_offer_case_type.sql — eksplicit sagstype på tilbud (tilbud → sag arver typen). Additiv, nullable, ingen backfill.
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS case_type TEXT;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_case_type_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_case_type_check
  CHECK (case_type IS NULL OR case_type IN ('solar', 'installation'));

COMMENT ON COLUMN public.offers.case_type IS
  'Tilsigtet sagstype (solar = Solceller/batteri, installation = Elinstallation/service). Sagen fra tilbuddet arver typen; NULL = ikke valgt (historisk) → installation.';
```

- Ingen ny tabel, ingen ny funktion, ingen RLS-ændring: kolonnen følger de eksisterende offers-politikker (læs/skriv som
  resten af tilbuddet). `check:rls-matrix` påvirkes ikke.
- Ingen backfill; ingen eksisterende tilbud eller sager ændres. `ADD COLUMN` uden default er kun en katalogændring
  (ingen tabelomskrivning, kort lås på en tabel med 15 rækker).
- Rollback: `ALTER TABLE public.offers DROP COLUMN case_type;` (koden falder tilbage til `installation`).

## Kodeændringer (efter godkendelse, i rækkefølgen CODE → TEST → PUSH → MIGRATION → POST-CHECK)

Koden skrives bagudkompatibelt først (læser `case_type` tolerant, fejler ikke hvis kolonnen mangler), så push før
migration er sikkert.

1. **Tilbudsformular** (opret/redigér kladde): obligatorisk valg for NYE tilbud — to knapper "Solceller / batteri" /
   "Elinstallation / service". Historiske tilbud med NULL viser "Ikke valgt" og kan sættes mens tilbuddet er kladde
   (edit-lock uændret: kun kladder kan redigeres).
2. **Tilbud → sag** (`createServiceCaseFromOffer`): `type: offer.case_type ?? 'installation'`. Forhåndsvisningen
   (offer-to-case-card "Sagstype") viser den faktiske værdi; ved NULL: "El-installation (ikke valgt på tilbuddet)".
   Portal-accept bruger samme sti → samme arv.
3. **Kopiér tilbud / revision**: `case_type` kopieres med.
4. **Pakke-genererede tilbud** (sales-engine / auto-offer): sæt `case_type` fra pakkens strukturerede `job_type`
   (`solar` → `solar`; `installation`/`service` → `installation`). Struktureret felt, ikke tekst.
5. Ingen AI-/tekst-inferens nogen steder.

## Tests (krav)

- Rent: mapping `case_type` → sagstype (`solar` → `solar`, `installation` → `installation`, NULL → `installation`).
- UI-harness (staging, efter migration på staging):
  - solcelletilbud accepteret i portalen → sag `type = solar` → "Start aflevering" giver solcelle-tjeklisten;
  - elinstallationstilbud → sag `type = installation` → el-tjekliste, normal lukning uden undtagelse;
  - historisk tilbud (NULL) → sag `installation` (uændret adfærd);
  - nyt tilbud kan ikke gemmes uden valgt type; kopi bevarer typen.
- Prod post-check (read-only): kolonne + CHECK findes; 15 tilbud uændrede (alle NULL); 8 sager uændrede.

## Ikke omfattet

- Eksisterende prod-sager ændres ikke automatisk. Er en af de 4 sager fra tilbud reelt et solcelleanlæg, sætter kontoret
  "Solcelleanlæg" på sagen (tjeklisten følger straks typen).
- Batteri/BESS uden solceller får solcelle-tjeklisten (inverterfoto relevant, panelfoto ikke). Et separat batteri-punktsæt
  kan tilføjes senere som ren kode, hvis Henrik ønsker det.
