/** ELTA Assistant: auto_rule-markering på customer_tasks (kilde = assistenten). Delt af server og kalender-UI. */
export const ASSISTANT_RULE = {
  callback: 'assistant_callback',
  reminder: 'assistant_reminder',
  appointment: 'assistant_appointment',
  /** T12: tilbageringning efter ubesvaret opkald (Relatel) */
  missedCall: 'assistant_missed_call',
} as const

/** Alle assistent-regler (kalender + påmindelser) */
export const ASSISTANT_RULES: string[] = Object.values(ASSISTANT_RULE)
