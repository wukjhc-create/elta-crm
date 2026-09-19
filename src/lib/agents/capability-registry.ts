/**
 * Agent Core — Capability Registry.
 *
 * Den ENESTE kode Executor maa kalde for at udfoere en side-effekt. Hver
 * capability er en tynd, individuelt reviewet wrapper om én eksisterende
 * funktion. Agenten kalder ALDRIG raa mutatorer direkte — den skriver kun
 * agent_actions med en `capability`-noegle, som Executor slaar op her.
 *
 * Fase 2: rammen + metadata for Mailagent-MVP'ens read/draft-capabilities.
 * Handlers er bevidst endnu IKKE wired (handler === undefined) — Executor
 * naegter at udfoere en capability uden handler (fail-safe). Wiring til
 * konkrete draft-funktioner sker per agent i senere faser.
 */

import type { CapabilityDefinition } from '@/types/agent-core.types'

const registry = new Map<string, CapabilityDefinition>()

/** Registrér en capability. Kaster ved dublet-noegle (fejl-tidligt). */
export function registerCapability(def: CapabilityDefinition): void {
  if (registry.has(def.key)) {
    throw new Error(`Capability allerede registreret: ${def.key}`)
  }
  if (def.minApprovals < 1) {
    throw new Error(`Capability ${def.key}: minApprovals skal vaere >= 1`)
  }
  registry.set(def.key, def)
}

export function getCapability(key: string): CapabilityDefinition | undefined {
  return registry.get(key)
}

export function listCapabilities(): CapabilityDefinition[] {
  return [...registry.values()]
}

/** Kun til tests: nulstil registry. */
export function __resetRegistryForTests(): void {
  registry.clear()
}

// ---------------------------------------------------------------------
// Mailagent MVP — read/draft capabilities (metadata only, handlers wires senere)
// ---------------------------------------------------------------------
// Alle er 'read'/'create' (intern) — INGEN send/push/finance/delete her.
// Draft betyder: opret kladde/forslag; sender/deler aldrig noget eksternt.

registerCapability({
  key: 'mail.draft_reply',
  sideEffectClass: 'read',
  requiredScope: 'agent.mail.draft',
  defaultRequiresApproval: false,
  minApprovals: 1,
  description: 'Foreslå et svar-udkast til en indgaaende mail (sender aldrig).',
  // Kontrolleret intern execution: materialisér udkastet fra payload til
  // result. INGEN ekstern effekt — sender ikke, gemmer ikke uden for agent-
  // tabellerne. Dette er den sikre "execution" der demonstreres i MVP-slicen.
  handler: async (ctx) => {
    const draft = (ctx.action.payload?.draft as string | undefined) ?? ''
    if (!draft) return { ok: false, error: 'intet udkast i payload' }
    return { ok: true, data: { draft, materialized_at: new Date().toISOString() } }
  },
})

registerCapability({
  key: 'mail.link_customer',
  sideEffectClass: 'update',
  requiredScope: 'agent.mail.link',
  defaultRequiresApproval: true,
  minApprovals: 1,
  description: 'Foreslå at koble en indgaaende mail til en eksisterende kunde.',
})

registerCapability({
  key: 'case.propose_from_email',
  sideEffectClass: 'create',
  requiredScope: 'agent.case.draft',
  defaultRequiresApproval: true,
  minApprovals: 1,
  description: 'Foreslå oprettelse af en service-case ud fra en mail (kladde).',
})

registerCapability({
  key: 'offer.propose_draft_from_case',
  sideEffectClass: 'create',
  requiredScope: 'agent.offer.draft',
  defaultRequiresApproval: true,
  minApprovals: 1,
  description: 'Foreslå oprettelse af en tom offer-draft ud fra en case (sender aldrig).',
})
