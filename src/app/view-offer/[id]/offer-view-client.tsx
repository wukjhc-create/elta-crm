'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  CheckCircle,
  Shield,
  Clock,
  Loader2,
  ChevronDown,
  Sun,
  Zap,
  Battery,
  TrendingUp,
  Phone,
  Mail,
  ArrowRight,
  Sparkles,
  PartyPopper,
  FileText,
  XCircle,
  MessageCircle,
  Send,
  User,
} from 'lucide-react'
import {
  acceptPublicOffer,
  rejectPublicOffer,
  getPublicOfferMessages,
  sendPublicOfferMessage,
  type PublicOffer,
  type PublicOfferMessage,
} from '@/lib/actions/public-offer'
import { BRAND } from '@/lib/brand'

interface OfferViewClientProps {
  offer: PublicOffer
}

export function OfferViewClient({ offer }: OfferViewClientProps) {
  const [accepterName, setAccepterName] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(offer.status === 'accepted')
  const [rejected, setRejected] = useState(offer.status === 'rejected')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Messaging state
  const [messages, setMessages] = useState<PublicOfferMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [senderName, setSenderName] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [showMessages, setShowMessages] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      const msgs = await getPublicOfferMessages(offer.id)
      setMessages(msgs)
    }
    loadMessages()
    // Poll every 30 seconds
    const interval = setInterval(loadMessages, 30000)
    return () => clearInterval(interval)
  }, [offer.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAccept = async () => {
    if (!accepterName.trim()) {
      setError('Indtast dit fulde navn for at acceptere')
      return
    }
    setAccepting(true)
    setError(null)
    const result = await acceptPublicOffer(offer.id, accepterName)
    setAccepting(false)
    if (result.success) {
      setAccepted(true)
      setShowConfetti(true)
    } else {
      setError(result.error || 'Kunne ikke acceptere tilbuddet')
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    setError(null)
    const result = await rejectPublicOffer(offer.id, rejectReason || undefined)
    setRejecting(false)
    if (result.success) {
      setRejected(true)
      setShowRejectForm(false)
    } else {
      setError(result.error || 'Kunne ikke afvise tilbuddet')
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !senderName.trim()) return
    setSendingMessage(true)
    const result = await sendPublicOfferMessage(offer.id, senderName, newMessage)
    setSendingMessage(false)
    if (result.success) {
      setNewMessage('')
      // Reload messages
      const msgs = await getPublicOfferMessages(offer.id)
      setMessages(msgs)
    }
  }

  const fmt = (amount: number) =>
    new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: offer.currency || 'DKK',
      maximumFractionDigits: 0,
    }).format(amount)

  const isExpired = offer.valid_until && new Date(offer.valid_until) < new Date()
  const customerName = offer.customer?.contact_person || 'Kunde'
  const companyName = offer.customer?.company_name || ''
  const canAct = !accepted && !rejected && !isExpired

  // Group line items by section
  const sections: { name: string | null; items: PublicOffer['line_items'] }[] = []
  let currentSection: string | null = '__none__'
  for (const item of offer.line_items || []) {
    if (item.section !== currentSection) {
      currentSection = item.section
      sections.push({ name: currentSection, items: [] })
    }
    sections[sections.length - 1]?.items.push(item)
  }
  if (sections.length === 0) {
    sections.push({ name: null, items: offer.line_items || [] })
  }

  // Detect solar-specific items
  const allDescriptions = (offer.line_items || []).map((i) => i.description.toLowerCase()).join(' ')
  const hasSolarPanels = /panel|modul|solcelle/i.test(allDescriptions)
  const hasBattery = /batteri|battery|powerwall|lagring/i.test(allDescriptions)
  const hasInverter = /inverter|vekselretter|omformer/i.test(allDescriptions)

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* ═══════════════════════════════════════════════ */}
      {/* HERO HEADER                                    */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 60%, #1a5c1a 100%)` }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10 bg-white" />
          <div className="absolute top-1/2 -left-16 w-48 h-48 rounded-full opacity-10 bg-white" />
          <div className="absolute bottom-0 right-1/4 w-32 h-32 rounded-full opacity-5 bg-white" />
          <div className="absolute top-8 right-8 md:right-16">
            <Sun className="w-24 h-24 md:w-32 md:h-32 text-white/[0.06]" strokeWidth={1} />
          </div>
        </div>
        <div className="h-1" style={{ backgroundColor: BRAND.orange }} />
        <div className="relative max-w-4xl mx-auto px-6 pt-10 pb-14 md:pt-14 md:pb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <Sun className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="text-white font-extrabold text-xl tracking-wider">ELTA SOLAR</div>
              <div className="text-white/60 text-xs tracking-widest uppercase">El- & solcelleinstallationer</div>
            </div>
          </div>
          <p className="text-white/70 text-sm mb-2 tracking-wide uppercase">
            Tilbud {offer.offer_number}
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-3">
            Dit personlige<br />
            <span style={{ color: BRAND.orange }}>solcelletilbud</span>
          </h1>
          {offer.customer && (
            <p className="text-white/80 text-lg mt-2">
              Til <span className="font-semibold text-white">{customerName}</span>
              {companyName && companyName !== customerName && (
                <span className="text-white/60"> — {companyName}</span>
              )}
            </p>
          )}
          {offer.description && (
            <p className="text-white/60 mt-3 max-w-2xl">{offer.description}</p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {accepted ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white/20 text-white border border-white/30">
                <CheckCircle className="w-4 h-4" /> Accepteret
              </div>
            ) : rejected ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-red-500/20 text-red-100 border border-red-400/30">
                <XCircle className="w-4 h-4" /> Afvist
              </div>
            ) : isExpired ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-red-500/20 text-red-100 border border-red-400/30">
                <Clock className="w-4 h-4" /> Udl&oslash;bet
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-white/10 text-white border border-white/20">
                <Clock className="w-4 h-4" />
                {offer.valid_until
                  ? `Gyldig til ${format(new Date(offer.valid_until), 'd. MMMM yyyy', { locale: da })}`
                  : 'Intet udl\u00F8b'}
              </div>
            )}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm bg-white/10 text-white/80 border border-white/10">
              <Shield className="w-4 h-4" /> Sikker forbindelse
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* PRICE CARD                                      */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-6 -mt-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-8 md:p-10 text-center md:text-left md:border-r border-gray-100">
              <p className="text-sm text-gray-500 font-medium uppercase tracking-wide mb-1">Samlet pris inkl. moms</p>
              <div className="text-4xl md:text-5xl font-extrabold" style={{ color: BRAND.green }}>
                {fmt(offer.final_amount)}
              </div>
              {offer.discount_amount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: BRAND.orangeLight, color: BRAND.orange }}>
                  <Sparkles className="w-3.5 h-3.5" /> Du sparer {fmt(offer.discount_amount)}
                </div>
              )}
            </div>
            <div className="flex-1 p-8 md:p-10 grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Antal poster</p>
                <p className="text-2xl font-bold text-gray-900">{offer.line_items?.length || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Moms</p>
                <p className="text-2xl font-bold text-gray-900">{fmt(offer.tax_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Subtotal</p>
                <p className="text-lg font-semibold text-gray-700">{fmt(offer.total_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
                <p className="text-lg font-semibold" style={{ color: accepted ? BRAND.green : rejected ? '#dc2626' : BRAND.orange }}>
                  {accepted ? 'Accepteret' : rejected ? 'Afvist' : 'Afventer'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* CONTENT                                        */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Feature cards */}
        {(hasSolarPanels || hasBattery || hasInverter) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasSolarPanels && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND.greenLight }}>
                  <Sun className="w-6 h-6" style={{ color: BRAND.green }} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Solcelleanl&aelig;g</h3>
                <p className="text-sm text-gray-500">Premium solcellepaneler med garanti og professionel installation.</p>
              </div>
            )}
            {(hasBattery || hasInverter) && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND.orangeLight }}>
                  <Battery className="w-6 h-6" style={{ color: BRAND.orange }} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1">{hasBattery ? 'Batterilagring' : 'Inverter'}</h3>
                <p className="text-sm text-gray-500">{hasBattery ? 'Lagr din solenergi og brug den n\u00E5r du har brug for den.' : 'Effektiv vekselretter til optimal energiudnyttelse.'}</p>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND.greenLight }}>
                <TrendingUp className="w-6 h-6" style={{ color: BRAND.green }} />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Besparelse</h3>
              <p className="text-sm text-gray-500">Reducer din elregning markant og tj&aelig;n din investering hjem.</p>
            </div>
          </div>
        )}

        {/* Scope */}
        {offer.scope && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3" style={{ backgroundColor: BRAND.greenLight }}>
              <FileText className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.green }} />
              <h3 className="font-bold" style={{ color: BRAND.green }}>Opgavens omfang</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{offer.scope}</p>
            </div>
          </div>
        )}

        {/* Specification sections */}
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3" style={{ backgroundColor: sIdx === 0 ? BRAND.greenLight : '#f9fafb' }}>
              <Zap className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.green }} />
              <h3 className="font-bold text-gray-900">{section.name || 'Specifikation'}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {section.items.map((item, iIdx) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors group">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono text-gray-300 mt-1 w-6 text-right flex-shrink-0">{iIdx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 group-hover:text-[#2D8A2D] transition-colors">{item.description}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {item.quantity} {item.unit} &times; {fmt(item.unit_price)}
                        {item.discount_percentage > 0 && (
                          <span className="ml-2 font-medium" style={{ color: BRAND.green }}>(-{item.discount_percentage}%)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="font-bold text-gray-900">{fmt(item.total)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-between" style={{ backgroundColor: '#fafbfc' }}>
              <span className="text-sm font-medium text-gray-500">Subtotal</span>
              <span className="text-sm font-bold text-gray-700">
                {fmt(section.items.reduce((sum, i) => sum + i.total, 0))}
              </span>
            </div>
          </div>
        ))}

        {/* Totals */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100" style={{ backgroundColor: BRAND.greenLight }}>
            <h3 className="font-bold text-gray-900">Prisopsummering</h3>
          </div>
          <div className="px-6 py-6 space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (ekskl. moms)</span>
              <span className="font-medium">{fmt(offer.total_amount)}</span>
            </div>
            {offer.discount_amount > 0 && (
              <div className="flex justify-between font-medium" style={{ color: BRAND.green }}>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Rabat ({offer.discount_percentage}%)
                </span>
                <span>-{fmt(offer.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Moms ({offer.tax_percentage}%)</span>
              <span className="font-medium">{fmt(offer.tax_amount)}</span>
            </div>
            <div className="border-t-2 pt-4 flex justify-between items-baseline" style={{ borderColor: BRAND.green }}>
              <span className="text-2xl font-extrabold text-gray-900">I alt</span>
              <span className="text-3xl font-extrabold" style={{ color: BRAND.green }}>{fmt(offer.final_amount)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {offer.terms_and_conditions && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowTerms(!showTerms)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-bold text-gray-900">Vilk&aring;r & betingelser</h3>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showTerms ? 'rotate-180' : ''}`} />
            </button>
            {showTerms && (
              <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                <p className="text-gray-600 whitespace-pre-wrap text-sm leading-relaxed">{offer.terms_and_conditions}</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* MESSAGE HISTORY & CHAT                         */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5" style={{ color: BRAND.green }} />
              <h3 className="font-bold text-gray-900">Beskeder</h3>
              {messages.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{messages.length}</span>
              )}
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${showMessages ? 'rotate-180' : ''}`} />
          </button>

          {showMessages && (
            <div className="border-t border-gray-100">
              {/* Messages list */}
              <div className="max-h-96 overflow-y-auto px-6 py-4 space-y-4">
                {messages.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">
                    Ingen beskeder endnu. Skriv en besked herunder, hvis du har sp&oslash;rgsm&aring;l.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${msg.sender_type === 'customer' ? 'order-2' : ''}`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.sender_type === 'customer'
                            ? 'bg-green-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        </div>
                        <div className={`flex items-center gap-2 mt-1 px-1 ${msg.sender_type === 'customer' ? 'justify-end' : ''}`}>
                          <User className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-400">{msg.sender_name || (msg.sender_type === 'employee' ? 'Elta Solar' : 'Kunde')}</span>
                          <span className="text-xs text-gray-300">
                            {format(new Date(msg.created_at), 'd. MMM HH:mm', { locale: da })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* New message form */}
              <div className="border-t border-gray-100 p-4">
                <div className="flex gap-3 mb-3">
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Dit navn"
                    className="flex-shrink-0 w-40 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                      placeholder="Skriv en besked..."
                      className="w-full px-3 py-2 pr-12 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      disabled={sendingMessage}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sendingMessage || !newMessage.trim() || !senderName.trim()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-green-50 disabled:opacity-30 transition-colors"
                    >
                      {sendingMessage
                        ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        : <Send className="w-4 h-4" style={{ color: BRAND.green }} />
                      }
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Beskeder sendes direkte til Elta Solar og besvares hurtigst muligt.</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* ACCEPT / REJECT SECTION                        */}
        {/* ═══════════════════════════════════════════════ */}
        {canAct && (
          <div className="relative rounded-2xl overflow-hidden border-2 shadow-lg" style={{ borderColor: BRAND.green }}>
            <div className="h-2" style={{ background: `linear-gradient(90deg, ${BRAND.green}, ${BRAND.orange}, ${BRAND.green})` }} />
            <div className="p-8 md:p-12" style={{ background: `linear-gradient(135deg, white 0%, ${BRAND.greenLight} 100%)` }}>
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: BRAND.greenLight }}>
                  <Sun className="w-8 h-8" style={{ color: BRAND.green }} />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
                  Klar til at komme i gang?
                </h2>
                <p className="text-gray-600 text-lg max-w-md mx-auto">
                  Accept&eacute;r dit tilbud herunder og vi tager os af resten.
                </p>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dit fulde navn (som underskrift)</label>
                  <input
                    type="text"
                    value={accepterName}
                    onChange={(e) => { setAccepterName(e.target.value); setError(null) }}
                    placeholder="F.eks. Henrik Jensen"
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl text-lg focus:outline-none transition-colors focus:border-green-600"
                    style={{ borderColor: accepterName ? BRAND.green : undefined }}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full py-5 text-white text-lg font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                    boxShadow: `0 8px 24px rgba(45,138,45,0.35)`,
                  }}
                >
                  {accepting ? (
                    <><Loader2 className="w-6 h-6 animate-spin" /> Behandler din accept...</>
                  ) : (
                    <><CheckCircle className="w-6 h-6" /> Accept&eacute;r og bestil — {fmt(offer.final_amount)} <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>

                <p className="text-xs text-gray-500 text-center leading-relaxed">
                  Ved at klikke &ldquo;Accept&eacute;r&rdquo; bekr&aelig;fter du tilbuddet og dets betingelser.
                </p>

                {/* Reject option */}
                <div className="pt-4 border-t border-gray-200">
                  {!showRejectForm ? (
                    <button
                      onClick={() => setShowRejectForm(true)}
                      className="w-full py-3 text-gray-500 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" /> Jeg &oslash;nsker ikke at acceptere
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Valgfrit: Fort&aelig;l os gerne hvorfor (hj&aelig;lper os med at forbedre fremtidige tilbud)"
                        rows={3}
                        className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowRejectForm(false)}
                          className="flex-1 py-2.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          Annuller
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={rejecting}
                          className="flex-1 py-2.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          Afvis tilbud
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* ACCEPTED CONFIRMATION                          */}
        {/* ═══════════════════════════════════════════════ */}
        {accepted && (
          <div className="relative rounded-2xl overflow-hidden border-2 shadow-lg" style={{ borderColor: BRAND.green }}>
            <div className="h-2" style={{ backgroundColor: BRAND.green }} />
            <div className="p-8 md:p-12 text-center" style={{ background: `linear-gradient(135deg, white 0%, ${BRAND.greenLight} 100%)` }}>
              {showConfetti && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <PartyPopper className="w-32 h-32 text-green-200 animate-bounce" />
                </div>
              )}
              <div className="relative z-10">
                <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: BRAND.green }}>
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-extrabold mb-3" style={{ color: BRAND.green }}>
                  Tilbuddet er accepteret!
                </h2>
                <p className="text-gray-600 text-lg max-w-md mx-auto mb-6">
                  Tak for din tillid, {customerName}. Vi gl&aelig;der os til at komme i gang med dit projekt.
                </p>
                <div className="inline-flex items-center gap-6 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> Vi ringer inden 24 timer</span>
                  <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> Bekr&aelig;ftelse sendt</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REJECTED CONFIRMATION */}
        {rejected && (
          <div className="relative rounded-2xl overflow-hidden border-2 shadow-lg border-gray-200">
            <div className="h-2 bg-gray-300" />
            <div className="p-8 md:p-12 text-center bg-gray-50">
              <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-gray-200">
                <XCircle className="w-10 h-10 text-gray-500" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-gray-700">
                Tilbuddet er afvist
              </h2>
              <p className="text-gray-500 max-w-md mx-auto mb-6">
                Vi respekterer din beslutning. Kontakt os gerne, hvis du ombestemmer dig eller har sp&oslash;rgsm&aring;l.
              </p>
              <div className="inline-flex items-center gap-6 text-sm text-gray-500">
                <a href="mailto:ordre@eltasolar.dk" className="flex items-center gap-1.5 hover:text-gray-700">
                  <Mail className="w-4 h-4" /> ordre@eltasolar.dk
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* FOOTER                                         */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: BRAND.green }}>
          <div className="h-1" style={{ backgroundColor: BRAND.orange }} />
          <div className="p-8 md:p-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/15">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-white font-bold text-lg">ELTA SOLAR</div>
                  <div className="text-white/60 text-xs">Professionelle el- & solcelleinstallationer</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-white/80">
                <a href="mailto:ordre@eltasolar.dk" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <Mail className="w-4 h-4" /> ordre@eltasolar.dk
                </a>
                <a href="https://eltasolar.dk" className="hover:text-white transition-colors">
                  eltasolar.dk
                </a>
              </div>
            </div>
            <div className="border-t border-white/10 mt-6 pt-6 text-center text-white/50 text-xs">
              Elta Solar ApS &bull; CVR: 44291028 &bull; Dette tilbud er personligt og fortroligt.
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
