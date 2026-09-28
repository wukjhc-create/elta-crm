/**
 * Live-gates for Agent Core (P2-rest B). Bevidst IKKE 'use server'.
 *
 * AGENT_LIVE_SEND_ENABLED (default OFF): haard kill-switch for al ekstern afsendelse fra agenter
 * (side_effect_class send_external / push_external). Er den ikke praecis 'true', afviser Executor
 * enhver saadan action FOER claim (ikke-terminalt: forslaget bliver staaende) — ogsaa med gyldig approval
 * og enabled agent. Send-handleren tjekker det samme (andet lag). Aktivering er en forretningsbeslutning.
 */
export const LIVE_SEND_CLASSES = ['send_external', 'push_external'] as const

export function isLiveSendEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENT_LIVE_SEND_ENABLED === 'true'
}

export function liveSendBlocked(sideEffectClass: string, env: Record<string, string | undefined> = process.env): boolean {
  return (LIVE_SEND_CLASSES as readonly string[]).includes(sideEffectClass) && !isLiveSendEnabled(env)
}

export const LIVE_SEND_OFF_REASON = 'live afsendelse er slået fra (AGENT_LIVE_SEND_ENABLED) — intet sendt'
