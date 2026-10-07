/**
 * Begrundede undtagelser fra rettighedstjek paa skrivende server actions (P-006, RBAC runde 3).
 *
 * Hver undtagelse har en KATEGORI som `action-gate-audit.ts --strict` BEVISER automatisk — en undtagelse er
 * ikke en tillidserklaering:
 *   server-only  navnet forekommer ikke i nogen 'use client'-fil -> intet action-id i klient-bundlen, kan ikke
 *                kaldes udefra (Next fjerner ubrugte actions). Bliver den senere importeret i klientkode, FEJLER audit.
 *   token        kroppen validerer et kunde-token (validatePortalToken/validatePartnerToken/.eq('token', ...)) —
 *                ekstern kunde uden login; adgangen er token-bundet (udloeb/aktiv status i valideringen).
 *   self         kroppen er bundet til den indloggede bruger (.eq('id'|'to_user_id'|'user_id', userId) eller
 *                from_user_id: userId) — brugeren kan kun aendre egne data.
 * Nye undtagelser kraever en konkret grund. Stale undtagelser (funktion fjernet eller nu gatet) FEJLER audit.
 */
export type ExemptionKind = 'server-only' | 'token' | 'self' | 'public'
export interface Exemption { kind: ExemptionKind; reason: string }

const S = (reason: string): Exemption => ({ kind: 'server-only', reason })
const T = (reason: string): Exemption => ({ kind: 'token', reason })
/** Bevidst offentlig (uden login) — skal ogsaa staa i INTENTIONALLY_PUBLIC i action-gate-audit.ts. */
const P = (reason: string): Exemption => ({ kind: 'public', reason })
const U = (reason: string): Exemption => ({ kind: 'self', reason })

export const ACTION_GATE_EXEMPTIONS: Record<string, Exemption> = {
  // ---- server-only (kaldes kun fra andre server-actions/crons/services)
  'audit.ts:createAuditLog': S('audit-hjælper kaldt af andre actions efter deres egen gate'),
  'auto-tasks.ts:createAutoTasksForUnansweredEmails': S('cron-/service-hjælper (unanswered-mails-check)'),
  'auto-tasks.ts:autoCloseRespondedTasks': S('cron-/service-hjælper (unanswered-mails-check)'),
  'calculation-intelligence.ts:createSystemAlert': S('intern alarm-skrivning fra motorer'),
  'document-confirmations.ts:createConfirmationRequests': S('kaldes af gatede sags-/tilbudsflows'),
  'document-confirmations.ts:getConfirmationContext': S('læses server-side af den token-validerede bekræftelsesside'),
  'document-confirmations.ts:markConfirmationMailSent': S('mail-status fra afsendelsesflowet'),
  'document-confirmations.ts:markConfirmationMailFailed': S('mail-status fra afsendelsesflowet'),
  'document-confirmations.ts:revokeConfirmation': S('kaldes af gatede sagsflows'),
  'email.ts:createEmailThread': S('intern hjælper for gatede mail-actions'),
  'email.ts:createEmailMessage': S('intern hjælper for gatede mail-actions'),
  'email.ts:logEmailEvent': S('logning fra afsendelsesflowet'),
  'email.ts:trackEmailOpen': S('åbningssporing fra tracking-route'),
  'email.ts:logIncomingEmail': S('logning fra mail-synk'),
  'employee-events.ts:logEmployeeEvent': S('hændelseslog fra gatede medarbejder-actions'),
  'incoming-emails.ts:quickCreateCustomerFromEmail': S('intern hjælper; UI bruger createCustomerFromEmail (gatet)'),
  'learning.ts:recordProjectFeedback': S('intern læringshjælper'),
  'learning.ts:collectProjectFeedback': S('intern læringshjælper'),
  'offer-activities.ts:logOfferActivity': S('aktivitetslog fra gatede tilbuds-actions'),
  'offer-activities.ts:logOfferActivities': S('aktivitetslog fra gatede tilbuds-actions'),
  'partner-portal.ts:validatePartnerToken': S('token-validering brugt server-side af partnerportalen'),
  'portal.ts:validatePortalToken': S('token-validering brugt server-side af portalen'),
  'portal.ts:getPortalOffer': S('læses server-side af portalsiden efter token-validering'),
  'portal.ts:portalBookBesigtigelse': T('kunden booker besigtigelse via portal-token (N31; validering + maks 3 åbne; kundemail gated)'),
  'system-alerts-admin.ts:createSystemAlertAdmin': S('intern alarm-skrivning (service-role)'),
  // ---- token-valideret ekstern kunde (portal / bekræftelse / fuldmagt)
  'portal.ts:acceptOffer': T('kunden accepterer via portal-token'),
  'portal.ts:rejectOffer': T('kunden afviser via portal-token'),
  'portal.ts:sendPortalMessage': T('kundens chatbesked via portal-token'),
  'portal.ts:getPortalOffers': T('kundens tilbudsliste via portal-token (validering opdaterer last_accessed_at)'),
  'portal.ts:getPortalMessages': T('kundens chat via portal-token'),
  'portal.ts:getAttachmentUrl': T('signeret fil-URL til kundens egne vedhaeftninger via portal-token'),
  'portal.ts:getPortalInvoices': T('kundens fakturaer via portal-token'),
  'portal.ts:getPortalDocuments': T('kundens dokumenter via portal-token (scopet til token-kunden)'),
  'portal.ts:getPortalBesigtigelser': T('kundens besigtigelser via portal-token'),
  'partner-portal.ts:getPartnerServiceCases': T('partnerens sager via partner-token'),
  'partner-portal.ts:getPartnerDocuments': T('partnerens dokumenter via partner-token'),
  'password-reset.ts:requestPasswordReset': P('glemt-password: bevidst uden login; svaret afsloerer ikke om kontoen findes'),
  'portal.ts:uploadPortalAttachment': T('kundens fil-upload via portal-token; sti bygges af token-kundens id'),
  'portal.ts:markPortalMessagesAsRead': T('kundens læst-status via portal-token'),
  'portal.ts:portalConfirmBesigtigelse': T('kunden bekræfter besigtigelse via portal-token'),
  'portal.ts:portalRequestReschedule': T('kunden beder om ny tid via portal-token'),
  'document-confirmations.ts:submitConfirmation': T('kunden bekræfter dokument via engangstoken (status + udløb i opdateringen)'),
  'fuldmagt.ts:submitSignedFuldmagt': T('kunden underskriver fuldmagt via aktivt portal-token'),
  // ---- egne data
  'messages.ts:sendMessage': U('afsender = den indloggede bruger (from_user_id)'),
  'messages.ts:markAsRead': U('kun egne modtagne beskeder (to_user_id)'),
  'messages.ts:markAsUnread': U('kun egne modtagne beskeder (to_user_id)'),
  'messages.ts:archiveMessage': U('kun egne modtagne beskeder (to_user_id)'),
  'messages.ts:unarchiveMessage': U('kun egne modtagne beskeder (to_user_id)'),
  'messages.ts:deleteMessage': U('kun egne modtagne beskeder (to_user_id)'),
  'settings.ts:updateProfile': U('egen profil (id = userId)'),
  'settings.ts:uploadProfileAvatar': U('egen avatar (id = userId)'),
  'settings.ts:deleteProfileAvatar': U('egen avatar (id = userId)'),
  'settings.ts:saveNotificationPreferences': U('egne notifikationsvalg (id = userId)'),
}
