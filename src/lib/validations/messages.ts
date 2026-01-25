import { z } from 'zod'
import { MESSAGE_STATUSES, MESSAGE_TYPES } from '@/types/messages.types'

// Create message schema
export const createMessageSchema = z.object({
  subject: z
    .string()
    .min(1, 'Emne er påkrævet')
    .max(200, 'Emne må højst være 200 tegn'),
  body: z
    .string()
    .min(1, 'Besked er påkrævet')
    .max(10000, 'Besked må højst være 10000 tegn'),
  message_type: z.enum(MESSAGE_TYPES).default('internal'),
  to_user_id: z.string().uuid('Vælg en modtager'),
  to_email: z.string().email().nullable().optional(),
  cc: z.array(z.string().email()).optional().default([]),
  bcc: z.array(z.string().email()).optional().default([]),
  reply_to: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
})

export type CreateMessageInput = z.infer<typeof createMessageSchema>

// Message filter schema
export const messageFilterSchema = z.object({
  status: z.enum(MESSAGE_STATUSES).optional(),
  message_type: z.enum(MESSAGE_TYPES).optional(),
  search: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
})

export type MessageFilterInput = z.infer<typeof messageFilterSchema>
