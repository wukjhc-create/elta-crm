# Forslag: arbejdsordre-faktura og arbejdsordre-avance (F-5 / F-12) — kræver godkendelse

**Status:** FORSLAG (2026-10-16, review NEXT-20). Ingen migration skrevet/kørt. App-værn for F-5 er i prod (a74486b4).

## F-5 — `create_invoice_from_work_order` (SQL, senest 00202)
**Problem:** funktionen opretter fakturaen UDEN `case_id`, prissætter timer med live sats/fallback (ikke det frosne
`sale_amount`-snapshot) og ser ikke sagens afregningsform. Sagens fakturering (rest/slutfaktura, "netto faktureret")
kan derfor ikke se fakturaen → dobbeltfakturering mulig.
**App-værn (i prod nu):** `createInvoiceFromWorkOrder` afviser arbejdsordrer på sager med afregningsform eller
kontraktsum ("fakturér via sagen"). Tilbage er kun gamle sager uden begge.
**Forslag (00235):** funktionen sætter `case_id` fra arbejdsordren, bruger `sale_amount`/`sale_rate_snapshot` som
`priceTimeLog`, kun godkendte timer, og afviser når sagen har `billing_model`. Alternativt: fjern automatikken helt og
lad al fakturering gå via sagen (anbefalet — én vej at fakturere).

## F-12 — `work_order_profit`-snapshots (00222 i prod)
**Restgab:** materialer konverteret fra leverandørfakturaer har ingen `work_order_id` og tælles derfor ikke på
arbejdsordren; omsætning læses kun fra fakturaer med `work_order_id`, men sagsfakturaer sætter det ikke → omsætning er
altid "planlagt". `low_profit`-flaget og AI-indsigter læser snapshot'et.
**Forslag (00236):** beregn avance pr. SAG (via `work_orders.case_id`) og fordel sagsniveau-rækker (materialer/øvrige
uden arbejdsordre, sagsfakturaer) forholdsmæssigt efter timer pr. arbejdsordre — eller vis avance kun på sagsniveau og
lad arbejdsordre-flaget læse sagens tal. Kræver Henriks valg af fordelingsnøgle.

## Rækkefølge (procesregel 2026-10-16)
Kode der tåler både før/efter pushes først → migration (efter godkendelse pr. migration) → post-check (checksums på
fakturaer/snapshots) → DB-audit.
