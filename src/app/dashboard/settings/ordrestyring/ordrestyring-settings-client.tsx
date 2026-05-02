'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  Clock,
  Server,
  Key,
  ExternalLink,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { testOrdrestyringConnectionAction } from '@/lib/actions/ordrestyring'
import type { OrdrestyringConnectionTest, RawAttempt } from '@/lib/actions/ordrestyring'

const CHIP_API_URL = 'https://api.ordrestyring.dk/chip-api'

// ---------------------------------------------------------------------------
// Confetti 🎉
// ---------------------------------------------------------------------------

function launchConfetti(container: HTMLElement) {
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  const count = 80

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const size = Math.random() * 8 + 4
    el.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      top: 0;
      left: ${Math.random() * 100}%;
      opacity: 1;
      pointer-events: none;
      z-index: 50;
    `
    container.appendChild(el)

    const angle = Math.random() * Math.PI * 2
    const velocity = Math.random() * 300 + 150
    const vx = Math.cos(angle) * velocity
    const vy = Math.sin(angle) * velocity - 200
    const rotation = Math.random() * 720 - 360

    el.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${vx}px, ${vy + 400}px) rotate(${rotation}deg)`, opacity: 0 },
      ],
      { duration: 1200 + Math.random() * 800, easing: 'cubic-bezier(.25,.46,.45,.94)', fill: 'forwards' },
    )

    setTimeout(() => el.remove(), 2200)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrdrestyringSettingsClient() {
  const [isTesting, setIsTesting] = useState(false)
  const [result, setResult] = useState<OrdrestyringConnectionTest | null>(null)
  const [confettiRef, setConfettiRef] = useState<HTMLDivElement | null>(null)

  const handleTest = useCallback(async () => {
    setIsTesting(true)
    setResult(null)
    const res = await testOrdrestyringConnectionAction()
    setIsTesting(false)
    if (res.success && res.data) {
      setResult(res.data)
      if (res.data.ok && confettiRef) {
        launchConfetti(confettiRef)
      }
    } else {
      setResult({
        ok: false,
        endpoint: CHIP_API_URL,
        configPresent: false,
        error: res.error || 'Ukendt fejl',
      })
    }
  }, [confettiRef])

  return (
    <div className="space-y-6">
      {/* Connection test card */}
      <div className="bg-white rounded-lg border p-6 relative overflow-hidden" ref={setConfettiRef}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Server className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Forbindelsestest</h2>
              <p className="text-sm text-gray-500">
                Chip-API V2 — Basic Auth
              </p>
            </div>
          </div>
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isTesting ? 'Tester V2 endpoint...' : 'Test forbindelse'}
          </button>
        </div>

        {/* Result display */}
        {result && (
          <div className="space-y-4">
            {/* Status banner */}
            <div
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                result.ok
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {result.ok ? (
                <Wifi className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <WifiOff className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${result.ok ? 'text-green-800' : 'text-red-800'}`}>
                  {result.ok ? '🎉 Forbindelse OK — Chip-API V2!' : 'Forbindelse fejlet'}
                </p>
                {result.ok && (
                  <p className="text-sm text-green-600 mt-1">
                    {result.endpoint} via {result.method || 'POST'} — {result.latencyMs} ms
                  </p>
                )}
                {!result.ok && result.error && (
                  <div className="text-sm text-red-600 mt-1 whitespace-pre-line break-all">
                    {result.error}
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DiagRow
                icon={<Server className="w-4 h-4" />}
                label="Aktivt endpoint"
                value={result.endpoint}
                mono
                status={result.ok ? 'ok' : 'error'}
              />
              <DiagRow
                icon={<Key className="w-4 h-4" />}
                label="API-nøgle"
                value={result.configPresent ? 'Konfigureret ✓' : 'Mangler ✗'}
                status={result.configPresent ? 'ok' : 'error'}
              />
              {result.httpStatus !== undefined && (
                <DiagRow
                  icon={<CheckCircle className="w-4 h-4" />}
                  label="HTTP Status"
                  value={String(result.httpStatus)}
                  status={result.httpStatus === 200 ? 'ok' : 'error'}
                />
              )}
              {result.method && (
                <DiagRow
                  icon={<Zap className="w-4 h-4" />}
                  label="HTTP Method"
                  value={result.method}
                  status="ok"
                />
              )}
              {result.latencyMs !== undefined && (
                <DiagRow
                  icon={<Clock className="w-4 h-4" />}
                  label="Svartid"
                  value={`${result.latencyMs} ms`}
                  status={result.latencyMs < 2000 ? 'ok' : 'warn'}
                />
              )}
              {result.graphqlType && (
                <DiagRow
                  icon={<CheckCircle className="w-4 h-4" />}
                  label="API Type"
                  value={result.graphqlType}
                  status="ok"
                />
              )}
            </div>

            {/* Endpoints tried - discovery log */}
            {result.endpointsTried && result.endpointsTried.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  API probe-log ({result.endpointsTried.length} paths testet):
                </p>
                <div className="space-y-1">
                  {result.endpointsTried.map((ep) => {
                    const isWinner = result.ok && ep === result.endpoint
                    return (
                      <div key={ep} className="flex items-center gap-2 text-xs font-mono">
                        {isWinner ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        )}
                        <span className={isWinner ? 'text-green-700' : 'text-gray-500'}>
                          {ep}
                        </span>
                        {isWinner && (
                          <span className="text-green-600 font-sans font-medium text-[10px] bg-green-100 px-1.5 py-0.5 rounded">
                            200 OK via {result.method || 'POST'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw response log — shows full headers for debugging */}
        {result && !result.ok && result.rawAttempts && result.rawAttempts.length > 0 && (
          <RawLog attempts={result.rawAttempts} />
        )}

        {/* Initial state */}
        {!result && !isTesting && (
          <div className="text-center py-8 text-gray-400">
            <Server className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Klik &quot;Test forbindelse&quot; for at teste Chip-API V2</p>
            <p className="text-xs mt-1 text-gray-300">
              {CHIP_API_URL}
            </p>
          </div>
        )}
      </div>

      {/* Configuration info card */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Konfiguration</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-start justify-between py-2 border-b">
            <span className="text-gray-500">Base URL</span>
            <code className="text-xs px-2 py-1 rounded bg-gray-100">
              {CHIP_API_URL}
            </code>
          </div>
          <div className="flex items-start justify-between py-2 border-b">
            <span className="text-gray-500">Workflow</span>
            <div className="text-right space-y-1 text-gray-700">
              <div><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">POST /debitor</code> → debitor_id</div>
              <div><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">POST /sag</code> → sagsnummer</div>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-gray-500">Auth</span>
            <span className="text-gray-700">Basic Auth + query params + x-partner-id: aceve</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-gray-500">Headers</span>
            <span className="text-gray-700 text-xs">Authorization, x-api-key, x-company-code, x-partner-id</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-500">Miljøvariable</span>
            <span className="text-gray-700">ORDRESTYRING_API_KEY, ORDRESTYRING_COMPANY_CODE</span>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hurtige links</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://app.ordrestyring.dk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Åbn Ordrestyring
          </a>
          <a
            href="https://admin.ordrestyring.dk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Admin Portal
          </a>
        </div>
      </div>
    </div>
  )
}

function DiagRow({
  icon,
  label,
  value,
  status,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  status?: 'ok' | 'warn' | 'error'
  mono?: boolean
}) {
  const statusColor =
    status === 'ok'
      ? 'text-green-700'
      : status === 'error'
        ? 'text-red-700'
        : status === 'warn'
          ? 'text-amber-700'
          : 'text-gray-700'

  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
      <div className="text-gray-400 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-medium truncate ${statusColor} ${mono ? 'font-mono text-xs' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

function RawLog({ attempts }: { attempts: RawAttempt[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-gray-300 max-h-[500px] overflow-auto">
      <p className="text-gray-500 mb-3 font-sans text-xs font-medium">
        RAW RESPONSE LOG — {attempts.length} forsøg
      </p>
      {attempts.map((a, i) => (
        <div key={i} className="mb-3 border-b border-gray-700 pb-3 last:border-0">
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full text-left flex items-center gap-2"
          >
            <span className={a.ok ? 'text-green-400' : 'text-red-400'}>
              {a.ok ? '✓' : '✗'}
            </span>
            <span className="text-blue-400">{a.method}</span>
            <span className="text-gray-400 truncate flex-1">{a.url}</span>
            <span className={`${a.status === 200 ? 'text-green-400' : 'text-red-400'}`}>
              {a.status ?? 'ERR'}
            </span>
            <span className="text-gray-600">{a.latencyMs}ms</span>
            <span className="text-gray-600">{expanded === i ? '▼' : '▶'}</span>
          </button>

          {expanded === i && (
            <div className="mt-2 ml-4 space-y-2">
              {a.error && (
                <div>
                  <span className="text-red-500">Error: </span>
                  <span className="text-red-300">{a.error}</span>
                </div>
              )}

              {Object.keys(a.headers).length > 0 && (
                <div>
                  <p className="text-gray-500 mb-1">Response Headers:</p>
                  {Object.entries(a.headers).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-cyan-400 shrink-0">{k}:</span>
                      <span className="text-gray-300 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {a.bodySnippet && (
                <div>
                  <p className="text-gray-500 mb-1">Response Body (first 500 chars):</p>
                  <pre className="text-gray-400 whitespace-pre-wrap break-all bg-gray-800 rounded p-2">
                    {a.bodySnippet}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
