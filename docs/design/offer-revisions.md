# Tilbudsrevisioner — sendt version er uforanderlig (Henrik 2026-10-07)

Beslutning: *"Sendte tilbud må ikke redigeres frit. Sent version er immutable; ændring = ny revision/version;
audit trail; kundeportal viser korrekt gældende version."*

## Leveret nu (uden skemaændring)
- **Server-lås** (`src/lib/offers/edit-lock.ts`): alle redigerende tilbuds-actions afviser ikke-kladder —
  updateOffer, updateOfferField (undtagen interne noter), create/update/deleteLineItem, addProductToOffer,
  importCalculationToOffer, createLineItemFromSupplierProduct, refreshLineItemPrice, optimizeOfferPrices,
  updateOfferParties. Linje-actions slår linjens EGET tilbud op (klientens offer_id stoles ikke på).
- **Accepteret er endeligt**: overgangen accepteret → kladde er fjernet (underskrevet indhold kan ikke ændres).
- **UI**: "Rediger" vises kun på kladder; ellers "Låst" med forklaring (U146).
- Mellemløsning til ændring af sendte tilbud: "Tilbage til kladde" (statusændring logges i offer_activities), ret,
  send igen. Mangler: den oprindeligt sendte version bevares ikke → derfor revisioner nedenfor.

## Forslag: migration 00203 (BLOCKED_APPROVAL — SQL vises her først jf. CLAUDE.md)

```sql
BEGIN;

-- 1) Revision-kæde på tilbuddet
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_of uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_offers_revision_of ON public.offers(revision_of);

-- 2) Uforanderligt øjebliksbillede af det SENDTE indhold (hvad kunden så/underskrev)
CREATE TABLE IF NOT EXISTS public.offer_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  snapshot jsonb NOT NULL,          -- hoved (titel, beskrivelse, vilkår, parter, gyldighed) + linjer (salgsfelter) + totaler
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (offer_id, revision_number)
);
ALTER TABLE public.offer_snapshots ENABLE ROW LEVEL SECURITY;
-- Læs: samme roller som kan se tilbud (offers.view: admin/serviceleder/salg/bogholderi); skriv: KUN service-role
-- (snapshot skrives server-side ved afsendelse) → ingen INSERT/UPDATE/DELETE-politik for authenticated = uforanderlig.
CREATE POLICY offer_snapshots_select ON public.offer_snapshots FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi'));
REVOKE ALL ON public.offer_snapshots FROM anon;
GRANT SELECT ON public.offer_snapshots TO authenticated;

-- 3) Underskriften bindes til den underskrevne version
ALTER TABLE public.offer_signatures ADD COLUMN IF NOT EXISTS snapshot_id uuid NULL REFERENCES public.offer_snapshots(id);

COMMIT;
```

## Flow efter 00203
1. **Send** (kladde → sendt): server skriver `offer_snapshots` (revision_number) før mailen; låsen gælder herefter.
2. **Ny revision** (knap på sendt/set tilbud): kopierer tilbuddet til ny kladde med `revision_of` = gammel,
   `revision_number` + 1, samme tilbudsnummer + "-R2" (visning). Audit i offer_activities (`revision_created`).
3. **Send revisionen**: den gamle får `superseded_by`/`superseded_at` og kan ikke længere accepteres (portal +
   acceptOffer tjekker `superseded_by IS NULL`). Portalen viser altid seneste ikke-afløste revision; et gammelt link
   viser "Erstattet af revision 2" med link.
4. **Accept**: underskriften gemmes med `snapshot_id` = den aktuelle revisions snapshot → bevis for præcist hvad der
   blev underskrevet. Tilbud→sag bruger den accepterede revision.
5. **Historik** på tilbudssiden: liste over revisioner med snapshot-visning (læsbar, ikke redigerbar).

Test-plan: staging-migration, persona-RLS (snapshot ikke skrivbar for nogen bruger-rolle), UI: send → lås → ny
revision → send → gammel afløst i portal → accept binder snapshot; regression U7–U60 salg + portal U10/U22/U23.
