'use server'

import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import type {
  CreateTemplateInput,
  TemplateWithCreator,
} from '@/types/calculator.types'

export async function getTemplates(): Promise<{
  success: boolean
  data?: TemplateWithCreator[]
  error?: string
}> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calculator_templates')
      .select('*')
      .order('name')

    if (error) {
      console.error('Database error:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error fetching templates:', error)
    return { success: false, error: 'Kunne ikke hente skabeloner' }
  }
}

export async function createTemplate(input: CreateTemplateInput): Promise<{
  success: boolean
  data?: { id: string }
  error?: string
}> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calculator_templates')
      .insert({
        name: input.name,
        description: input.description || null,
        template_data: {
          config: input.config,
          systemSize: input.systemSize,
          totalPrice: input.totalPrice,
        },
      })
      .select('id')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return { success: false, error: `Database fejl: ${error.message}` }
    }

    revalidatePath('/calc')
    return { success: true, data: { id: data.id } }
  } catch (error) {
    console.error('Error creating template:', error)
    const message = error instanceof Error ? error.message : 'Ukendt fejl'
    return { success: false, error: `Kunne ikke gemme skabelon: ${message}` }
  }
}

export async function deleteTemplate(id: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    validateUUID(id, 'template ID')
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('calculator_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/calc')
    return { success: true }
  } catch (error) {
    console.error('Error deleting template:', error)
    return { success: false, error: 'Kunne ikke slette skabelon' }
  }
}
