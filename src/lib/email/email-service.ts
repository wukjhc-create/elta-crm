import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { logger } from '@/lib/utils/logger'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  senderName?: string
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
}

// Create transporter from config or env vars
function createTransporter(config?: Partial<SmtpConfig>): Transporter {
  // Use config if provided, otherwise fall back to env vars
  const host = config?.host || process.env.SMTP_HOST
  const port = config?.port || parseInt(process.env.SMTP_PORT || '587', 10)
  const user = config?.user || process.env.SMTP_USER
  const password = config?.password || process.env.SMTP_PASSWORD

  if (!host || !user || !password) {
    throw new Error('SMTP configuration is incomplete. Please configure SMTP settings.')
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass: password,
    },
  })
}

// Send email
export async function sendEmail(
  options: EmailOptions,
  config?: Partial<SmtpConfig>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = createTransporter(config)

    // Get from address
    const fromEmail = config?.fromEmail || process.env.SMTP_FROM_EMAIL
    const defaultFromName = config?.fromName || process.env.SMTP_FROM_NAME || 'Elta Solar'

    // Dynamic sender: "Jens Jensen | Elta Solar" or fallback to default
    const displayName = options.senderName
      ? `${options.senderName} | ${defaultFromName}`
      : defaultFromName

    if (!fromEmail) {
      throw new Error('From email is not configured')
    }

    const mailOptions = {
      from: `"${displayName}" <${fromEmail}>`,
      replyTo: options.replyTo || fromEmail,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    }

    const info = await transporter.sendMail(mailOptions)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (error) {
    logger.error('Error sending email', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Kunne ikke sende email',
    }
  }
}

// Verify SMTP connection
export async function verifySmtpConnection(
  config?: Partial<SmtpConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(config)
    await transporter.verify()
    return { success: true }
  } catch (error) {
    logger.error('SMTP verification failed', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMTP forbindelse fejlede',
    }
  }
}
