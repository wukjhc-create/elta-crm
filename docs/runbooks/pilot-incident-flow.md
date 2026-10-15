# Pilotfejl-flow (Henrik 2026-10-15)

Gælder fra pilotstart. Formål: hver fejl en pilotbruger møder bliver set, klassificeret, rettet eller parkeret — med spor.

## 1. Hvor fejl kommer ind
| Kilde | Hvor ses den | Mail? |
|---|---|---|
| Kritisk driftsfejl (invoice/bank/economic/email/cron, `logHealth(..., 'error')`) | Pilot Health + klokken (kritisk) | Ja — straks til aktive admin + serviceleder, højst 1 pr. service pr. time (`lib/alerts/alert-policy.ts`) |
| Øvrige driftsfejl og advarsler (AI/auto-flows, e-conomic ikke sat op, bank-import gammel) | Pilot Health + klokken (advarsel, én åben pr. type) | Nej |
| Klient-crash i appen (error boundary → `system_health_log` service `ui`) | Pilot Health "Brugerfejl" (fejlkode, side uden query, kort tekst) | Nej |
| Bruger melder fejl (telefon/mail/Teams) | Registreres manuelt i [pilot-incidents.md](../pilot-incidents.md) | — |

## 2. Klassifikation
| Niveau | Definition | Eksempler | Reaktion |
|---|---|---|---|
| **S1** | Sikkerhed, datatab eller forretningskritisk stop | Bruger ser andres/kostdata uden ret, data slettet/overskrevet, kan ikke fakturere/logge ind | Straks. Code-only fix må deployes direkte; ellers stop flowet (feature-flag/gate) og eskalér til Henrik |
| **S2** | Større workflow-fejl eller økonomisk ukorrekthed | Forkert beløb/moms/avance, timer tæller forkert, mail sendes ikke, sag kan ikke lukkes | Samme dag. Code-only fix må deployes direkte |
| **S3** | Brugervenlighed / kosmetik | Uklar tekst, layout på mobil, ekstra klik | Samles i backlog (NEXT-x), rettes i bølger |

Tvivl mellem to niveauer → vælg det højeste, nedgradér når årsagen er kendt.

## 3. Hvad må rettes uden godkendelse
- **Må straks (S1/S2):** code-only rettelse der ikke ændrer schema, data eller forretningsregel. Gates (tsc, check:rls-matrix, check:rbac) + målrettet test skal være grønne før push.
- **Kræver Henriks godkendelse:** migration (nr., formål, risiko, pre/post-check — hver migration for sig), dataændring i prod, ændret forretningsregel (priser, moms, godkendelsesflow, hvem-må-hvad), live mail/SMS/cron.
- Rollback må aldrig automatisk genåbne anon-adgang.

## 4. Checkpoint pr. fejl
Én linje pr. fejl i [pilot-incidents.md](../pilot-incidents.md): dato · kilde · niveau · kort beskrivelse (ingen persondata) · årsag · handling (commit/migration/beslutning) · status (ÅBEN / RETTET / AFVENTER HENRIK / PARKERET).
Ved S1: også en linje i `docs/DEVELOPMENT_STATUS.md` og besked til Henrik samme dag.

## 5. Daglig rutine i piloten
1. Åbn Pilot Health: nye fejl, "Brugerfejl", aktive brugere der aldrig har logget ind.
2. Klokken: åbne systemalarmer → klassificér, registrér, afvis (dismiss) når håndteret — så kommer en ny alarm af samme type igen næste gang.
3. Daglig digest (samlet mail) er planlagt senere — ikke bygget.
