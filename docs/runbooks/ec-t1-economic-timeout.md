# EC-T1 — afgrænset timeout for e-conomic-kald (forslag)

**Status:** FORSLAG (Henrik 2026-10-24: "propose a deliberate bounded timeout policy"). Intet er ændret.
Kodeændring, ingen migration. Kill-switch og `ECONOMIC_PUSH_ENABLED` er uændrede.

## Problem

`economicFetch` (`src/lib/services/economic-client.ts`, ét HTTP-punkt med 9 kald, heraf 5 skrivende) kalder `fetch` uden
eget timeout. Et hængende e-conomic-kald venter derfor på Node/undici-standarden (headers ca. 300 s).

**Konsekvenser:**
- En server-action eller cron kan blive dræbt af Vercels funktionsgrænse midt i forløbet. Så logges hverken succes eller
  UVIST, og A-4/A-4b's krav står uden UNCERTAIN-log.
- Kravet tages ikke over før 15 min (stale), og bagefter kan det tages over uden låsen.

## Forslag

1. **AbortController pr. kald** i `economicFetch`, med timeout efter kaldstype:
   - skrivende kald (POST/PUT/DELETE): **25 s**
   - læsende kald (GET): **10 s**
   - Værdierne er konstanter i koden og kan justeres samlet.
2. **Udfald ved timeout:** `{ ok: false, status: 0, error: 'ECONOMIC_TIMEOUT' }`.
   - `exportOutcomeUncertain` klassificerer det allerede som **UVIST** (status 0 ≠ kill-switch). For skrivende kald betyder
     det, at kravet bliver låst, der skrives en UNCERTAIN-log, og intet genforsøges automatisk (A-4/A-4b).
   - Læsende opslag (fx kundenummer før oprettelse) er ikke uvisse. Kaldet fejler normalt med en dansk fejltekst og kan
     gentages.
3. **Ingen automatisk genforsøg** af skrivende kald, hverken ved timeout, 5xx eller netværksfejl. Det gælder også
   cron-stierne.
4. **Tidsbudget:** 25 s skrivning + 10 s læsning holder forløbet under funktionsgrænsen (60 s). Hvis grænsen alligevel
   rammes, er kravet sat, men UNCERTAIN-loggen kan mangle. Derfor tilføjes, at et krav ældre end 15 min **uden** log
   behandles som uvist (låst til manuel frigivelse) i stedet for at blive taget over.
   - Det er en adfærdsændring for stale-overtagelse og skal godkendes særskilt.
5. **UI** genbruger A-4/A-4b-teksterne ("Uvist om … — kontrollér e-conomic før du frigiver"). Ingen rå fejl.

## Test (uden live e-conomic)

- Unit:
  - `economicFetch` med en fetch-mock der aldrig svarer → `ECONOMIC_TIMEOUT` efter timeout
  - en skrivende sti → uvist
  - en læsende sti → normal fejl
  - et mutationstjek: ingen genforsøg
- Staging: kill-switchen er fortsat slået fra, så intet sendes. Testene kører med mock på HTTP-punktet.

## Beslutninger Henrik skal træffe

1. Timeout-værdierne (25 s skriv / 10 s læs).
2. Om punkt 4 skal med: et forældet krav **uden** log behandles som uvist i stedet for at blive overtaget.
