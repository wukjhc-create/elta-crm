import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { da } from 'date-fns/locale'
import { FileText, Eye, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Offer {
  id: string
  offer_number: string
  title: string
  customer_name: string
  total_amount: number
  status: string
  created_at: string
}

interface PendingOffersProps {
  offers: Offer[]
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PendingOffers({ offers }: PendingOffersProps) {
  if (offers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Ingen afventende tilbud</p>
      </div>
    )
  }

  const totalValue = offers.reduce((sum, offer) => sum + offer.total_amount, 0)

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm pb-2 border-b">
        <span className="text-muted-foreground">Samlet værdi:</span>
        <span className="font-semibold text-primary">{formatCurrency(totalValue)}</span>
      </div>

      {/* Offers list */}
      {offers.map((offer) => {
        const isViewed = offer.status === 'viewed'

        return (
          <Link
            key={offer.id}
            href={`/dashboard/offers/${offer.id}`}
            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div
              className={cn(
                'p-1.5 rounded-full flex-shrink-0',
                isViewed ? 'bg-green-100' : 'bg-purple-100'
              )}
            >
              {isViewed ? (
                <Eye className="w-4 h-4 text-green-600" />
              ) : (
                <Send className="w-4 h-4 text-purple-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{offer.offer_number}</p>
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded',
                    isViewed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  )}
                >
                  {isViewed ? 'Set' : 'Sendt'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {offer.customer_name}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="font-medium text-sm">
                {formatCurrency(offer.total_amount)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(offer.created_at), {
                  addSuffix: true,
                  locale: da,
                })}
              </span>
            </div>
          </Link>
        )
      })}

      <div className="pt-2 text-center">
        <Link href="/dashboard/offers" className="text-sm text-primary hover:underline">
          Se alle tilbud →
        </Link>
      </div>
    </div>
  )
}
