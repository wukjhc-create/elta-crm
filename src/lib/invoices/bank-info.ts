/**
 * Bankoplysninger på kundefakturaer (PDF + mailtekst) — én kilde.
 *
 * Primært env (INVOICE_BANK_REG_NO / INVOICE_BANK_ACCOUNT, som fakturaerne
 * altid har brugt), med firmaindstillingernes bank_reg_no / bank_account som
 * fallback. Bruges også til advarslen på fakturasiden, så den viser præcis
 * det kunden får.
 */

export interface InvoiceBankInfo {
  regNo: string | null
  account: string | null
  configured: boolean
}

export function invoiceBankInfo(
  company?: { bank_reg_no?: string | null; bank_account?: string | null } | null
): InvoiceBankInfo {
  const regNo = process.env.INVOICE_BANK_REG_NO?.trim() || company?.bank_reg_no?.trim() || null
  const account = process.env.INVOICE_BANK_ACCOUNT?.trim() || company?.bank_account?.trim() || null
  return { regNo, account, configured: !!regNo && !!account }
}
