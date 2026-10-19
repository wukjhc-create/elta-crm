/**
 * Structured logging utility for critical operations
 * Provides consistent log format with context and metadata
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  userId?: string
  action?: string
  entity?: string
  entityId?: string
  metadata?: Record<string, unknown>
  error?: Error | unknown
  duration?: number
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
}

/**
 * LG-3/LG-4 (log-review 2026-10-18): fejl skrives som {code, message, hint} — aldrig PostgREST/Postgres `details`, der
 * kan være "Failing row contains (…)" med en hel persondata-række (navn, mail, telefon, adresse) eller
 * "Key (email)=(x@y.dk) already exists". Bruges for både warn og error (før smed warn fejlen helt væk).
 */
export function safeErrorSummary(err: unknown): string {
  if (err == null) return ''
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; hint?: unknown }
    const parts = [
      e.code ? `code=${String(e.code)}` : '',
      e.message ? String(e.message) : '',
      e.hint ? `hint=${String(e.hint)}` : '',
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : '[ukendt fejlobjekt]'
  }
  return String(err)
}

function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, message, context } = entry
  const levelStr = level.toUpperCase().padEnd(5)

  let logLine = `[${timestamp}] ${levelStr} ${message}`

  if (context) {
    const contextParts: string[] = []
    if (context.userId) contextParts.push(`user=${context.userId.substring(0, 8)}...`)
    if (context.action) contextParts.push(`action=${context.action}`)
    if (context.entity) contextParts.push(`entity=${context.entity}`)
    if (context.entityId) contextParts.push(`id=${context.entityId.substring(0, 8)}...`)
    if (context.duration !== undefined) contextParts.push(`duration=${context.duration}ms`)

    if (contextParts.length > 0) {
      logLine += ` | ${contextParts.join(' ')}`
    }

    if (context.metadata && Object.keys(context.metadata).length > 0) {
      logLine += ` | metadata=${JSON.stringify(context.metadata)}`
    }
  }

  return logLine
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  }

  const logLine = formatLogEntry(entry)

  switch (level) {
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(logLine)
      }
      break
    case 'info':
      console.info(logLine)
      break
    case 'warn':
      console.warn(logLine)
      if (context?.error) console.warn(`  Error: ${safeErrorSummary(context.error)}`)
      break
    case 'error':
      console.error(logLine)
      if (context?.error) {
        console.error(`  Error: ${safeErrorSummary(context.error)}`)
        if (context.error instanceof Error && context.error.stack) {
          console.error(`  Stack: ${context.error.stack.split('\n').slice(1, 4).join('\n')}`)
        }
      }
      break
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),

  /**
   * Log an action with timing
   */
  action: (action: string, userId: string | undefined, entity: string, entityId?: string, metadata?: Record<string, unknown>) => {
    log('info', `Action: ${action}`, {
      userId,
      action,
      entity,
      entityId,
      metadata,
    })
  },

  /**
   * Log an error with full context
   */
  actionError: (action: string, userId: string | undefined, error: unknown, entity?: string, entityId?: string) => {
    log('error', `Action failed: ${action}`, {
      userId,
      action,
      entity,
      entityId,
      error,
    })
  },

  /**
   * Log authentication events
   */
  auth: (event: 'login' | 'logout' | 'register' | 'password_reset' | 'auth_error', userId?: string, metadata?: Record<string, unknown>) => {
    log('info', `Auth: ${event}`, {
      userId,
      action: event,
      entity: 'auth',
      metadata,
    })
  },

  /**
   * Log security events
   */
  security: (event: string, userId?: string, metadata?: Record<string, unknown>) => {
    log('warn', `Security: ${event}`, {
      userId,
      action: event,
      entity: 'security',
      metadata,
    })
  },
}

export default logger
