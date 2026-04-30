import { Metadata } from 'next'
import { BankTransactionsClient } from './bank-client'
import { listUnmatchedBankTransactions } from '@/lib/actions/bank-payments'

export const metadata: Metadata = {
  title: 'Bankafstemning',
  description: 'Umatchede banktransaktioner',
}

export const dynamic = 'force-dynamic'

export default async function BankPage() {
  const rows = await listUnmatchedBankTransactions(200)
  return <BankTransactionsClient initialRows={rows} />
}
