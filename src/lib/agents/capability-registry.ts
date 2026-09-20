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
  description: 'Koble en indgaaende mail til en eksisterende kunde (kun efter approval).',
  // Approval-gated (Executor kraever approval fordi requires_approval=true).
  // INGEN auto-link ved tvetydighed: linker KUN naar der er praecis én kandidat
  // og ingen conflicts. Ellers refuseres -> manuel udvaelgelse (fremtidig picker).
  handler: async (ctx) => {
    const payload = (ctx.action.payload ?? {}) as {
      email_id?: string
      conflicts?: boolean
      candidates?: Array<{ id: string; company_name?: string }>
      selected_customer_id?: string
    }
    const emailId = payload.email_id
    const candidates = payload.candidates ?? []
    const selected = payload.selected_customer_id
    if (!emailId) return { ok: false, error: 'mangler email_id i payload' }

    // Bestem hvilken kunde der maa linkes:
    //  - præcis én kandidat uden conflict => den (uændret adfaerd)
    //  - ellers KUN et eksplicit reviewer-valg der findes blandt kandidaterne
    //    (tamper-resistant: selected skal vaere en af forslagets kandidater)
    let customerId: string | undefined
    if (candidates.length === 1 && !payload.conflicts) {
      customerId = candidates[0].id
    } else if (selected && candidates.some((c) => c.id === selected)) {
      customerId = selected
    }
    if (!customerId) {
      return {
        ok: false,
        error: `manuel udvaelgelse paakraevet eller ugyldigt valg (kandidater=${candidates.length}, valgt=${selected ?? 'ingen'})`,
      }
    }
    const { error } = await ctx.admin
      .from('incoming_emails')
      .update({ customer_id: customerId, link_status: 'linked', linked_by: 'agent' })
      .eq('id', emailId)
    if (error) return { ok: false, error: (error as { message?: string }).message ?? 'kunne ikke linke' }
    return { ok: true, data: { email_id: emailId, linked_customer_id: customerId } }
  },
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
