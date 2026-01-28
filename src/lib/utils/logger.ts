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
      break
    case 'error':
      console.error(logLine)
      if (context?.error) {
        if (context.error instanceof Error) {
          console.error(`  Error: ${context.error.message}`)
          if (context.error.stack) {
            console.error(`  Stack: ${context.error.stack.split('\n').slice(1, 4).join('\n')}`)
          }
        } else {
          console.error(`  Error details:`, context.error)
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
