'use server'

import { revalidatePath } from 'next/cache'
import { validateUUID } from '@/lib/validations/common'
import { ImportEngine, decodeFileContent, detectColumnMappings, createImportResult, calculatePriceChange } from '@/lib/services/import-engine'
import { AOImporter, AO_DEFAULT_CONFIG, AO_COLUMN_MAPPINGS } from '@/lib/services/importers/ao-importer'
import { LMImporter, LM_DEFAULT_CONFIG, LM_COLUMN_MAPPINGS } from '@/lib/services/importers/lm-importer'
import type { ActionResult, PaginatedResponse } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import type {
  ImportBatch,
  ImportBatchSummary,
  ImportBatchFilters,
  ImportPreview,
  ImportResult,
  ValidatedRow,
  PriceChange,
  ColumnMappings,
} from '@/types/suppliers.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
/**
 * Get importer config based on supplier code
 */
function getImporterConfig(supplierCode: string | null) {
  switch (supplierCode?.toUpperCase()) {
    case 'AO':
      return { ...AO_DEFAULT_CONFIG, columnMappings: AO_COLUMN_MAPPINGS }
    case 'LM':
      return { ...LM_DEFAULT_CONFIG, columnMappings: LM_COLUMN_MAPPINGS }
    default:
      return { format: 'csv' as const, delimiter: ';', encoding: 'utf-8', columnMappings: {} }
  }
}

// =====================================================
// Preview Import
// =====================================================

export async function previewImport(
  supplierId: string,
  fileContent: string,
  customMappings?: ColumnMappings
): Promise<ActionResult<ImportPreview>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    // Get supplier info and settings
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .eq('id', supplierId)
      .single()

    if (supplierError || !supplier) {
      return { success: false, error: 'Leverandøren blev ikke fundet' }
    }

    // Get supplier settings
    const { data: settings } = await supabase
      .from('supplier_settings')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle()

    // Get importer config
    const config = getImporterConfig(supplier.code)

    // Use settings column mappings if available, otherwise use defaults
    const columnMappings = customMappings ||
      (settings?.column_mappings as ColumnMappings) ||
      config.columnMappings

    const engine = new ImportEngine({
      supplier_id: supplierId,
      format: config.format,
      delimiter: settings?.csv_delimiter || config.delimiter || ';',
      encoding: settings?.csv_encoding || config.encoding || 'utf-8',
      column_mappings: columnMappings,
      skip_header_rows: 0,
      has_header: true,
    })

    // Get headers for detection
    const headers = await engine.getHeaders(fileContent)

    // Auto-detect mappings if no custom mappings provided
    const detectedMappings = customMappings ||
      detectColumnMappings(headers, config.columnMappings)

    // Parse CSV
    const parsedRows = await engine.parseCSV(fileContent)

    // Apply supplier-specific transformations
    let transformedRows = parsedRows
    if (supplier.code === 'AO') {
      transformedRows = parsedRows.map((row) => AOImporter.transformRow(row))
    } else if (supplier.code === 'LM') {
      transformedRows = parsedRows.map((row) => LMImporter.transformRow(row))
    }

    // Get existing products by SKU
    const skus = transformedRows.map((r) => r.parsed.sku).filter(Boolean)
    const { data: existingProducts } = await supabase
      .from('supplier_products')
      .select('id, supplier_sku')
      .eq('supplier_id', supplierId)
      .in('supplier_sku', skus)

    const existingMap = new Map(
      (existingProducts || []).map((p) => [p.supplier_sku, p.id])
    )

    // Validate rows
    const validatedRows = await engine.validateRows(transformedRows, existingMap)

    // Count stats
    const validRows = validatedRows.filter((r) => r.isValid)
    const newProducts = validRows.filter((r) => !r.isUpdate).length
    const updatedProducts = validRows.filter((r) => r.isUpdate).length
    const skippedRows = validatedRows.length - validRows.length

    // Get sample rows (first 10)
    const sampleRows = validatedRows.slice(0, 10)

    // Collect errors
    const errors = validatedRows
      .filter((r) => !r.isValid)
      .flatMap((r) =>
        r.errors.map((message) => ({
          row: r.rowNumber,
          message,
        }))
      )

    // Collect warnings
    const warnings: string[] = []
    if (newProducts === 0 && updatedProducts === 0) {
      warnings.push('Ingen produkter vil blive importeret')
    }
    if (skippedRows > 10) {
      warnings.push(`${skippedRows} rækker vil blive sprunget over pga. fejl`)
    }

    const preview: ImportPreview = {
      totalRows: validatedRows.length,
      validRows: validRows.length,
      invalidRows: skippedRows,
      newProducts,
      updatedProducts,
      skippedRows,
      sampleRows,
      errors: errors.slice(0, 50), // Limit errors shown
      warnings,
      columnHeaders: headers,
      detectedMappings,
    }

    return { success: true, data: preview }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke læse fil') }
  }
}

// =====================================================
// Execute Import
// =====================================================

export async function executeImport(
  supplierId: string,
  fileContent: string,
  filename: string,
  options: { dryRun?: boolean; customMappings?: ColumnMappings }
): Promise<ActionResult<ImportResult>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(supplierId, 'leverandør ID')

    // Get supplier info and settings
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, code, name')
      .eq('id', supplierId)
      .single()

    if (supplierError || !supplier) {
      return { success: false, error: 'Leverandøren blev ikke fundet' }
    }

    // Get supplier settings
    const { data: settings } = await supabase
      .from('supplier_settings')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle()

    // Create import batch record
    const { data: batch, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        supplier_id: supplierId,
        filename,
        file_size_bytes: new TextEncoder().encode(fileContent).length,
        status: options.dryRun ? 'dry_run' : 'processing',
        is_dry_run: options.dryRun || false,
        started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single()

    if (batchError || !batch) {
      console.error('Error creating import batch:', batchError)
      return { success: false, error: 'Kunne ikke starte import' }
    }

    try {
      // Get importer config
      const config = getImporterConfig(supplier.code)

      // Use settings column mappings if available, otherwise use defaults
      const columnMappings = options.customMappings ||
        (settings?.column_mappings as ColumnMappings) ||
        config.columnMappings

      const engine = new ImportEngine({
        supplier_id: supplierId,
        format: config.format,
        delimiter: settings?.csv_delimiter || config.delimiter || ';',
        encoding: settings?.csv_encoding || config.encoding || 'utf-8',
        column_mappings: columnMappings,
        skip_header_rows: 0,
        has_header: true,
      })

      // Parse CSV
      const parsedRows = await engine.parseCSV(fileContent)

      // Apply supplier-specific transformations
      let transformedRows = parsedRows
      if (supplier.code === 'AO') {
        transformedRows = parsedRows.map((row) => AOImporter.transformRow(row))
      } else if (supplier.code === 'LM') {
        transformedRows = parsedRows.map((row) => LMImporter.transformRow(row))
      }

      // Get existing products by SKU
      const skus = transformedRows.map((r) => r.parsed.sku).filter(Boolean)
      const { data: existingProducts } = await supabase
        .from('supplier_products')
        .select('id, supplier_sku, cost_price, list_price')
        .eq('supplier_id', supplierId)
        .in('supplier_sku', skus)

      const existingMap = new Map(
        (existingProducts || []).map((p) => [p.supplier_sku, p.id])
      )

      const existingPriceMap = new Map(
        (existingProducts || []).map((p) => [p.supplier_sku, { cost: p.cost_price, list: p.list_price }])
      )

      // Validate rows
      const validatedRows = await engine.validateRows(transformedRows, existingMap)

      if (options.dryRun) {
        // Dry run - just return results without making changes
        const result = createImportResult(batch.id, validatedRows, [], 'dry_run')

        // Update batch with results
        await supabase
          .from('import_batches')
          .update({
            total_rows: result.total_rows,
            processed_rows: result.total_rows,
            new_products: result.new_products,
            updated_products: result.updated_products,
            skipped_rows: result.skipped_rows,
            errors: result.errors,
            status: 'dry_run',
            completed_at: new Date().toISOString(),
          })
          .eq('id', batch.id)

        return { success: true, data: result }
      }

      // Execute real import
      const validRows = validatedRows.filter((r) => r.isValid)
      const priceChanges: PriceChange[] = []

      // Process in batches to avoid overwhelming the database
      const BATCH_SIZE = 100
      let newProducts = 0
      let updatedProducts = 0

      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const rowBatch = validRows.slice(i, i + BATCH_SIZE)
        const now = new Date().toISOString()

        // Separate updates from inserts
        const toUpdate = rowBatch.filter((r) => r.existingProductId)
        const toInsert = rowBatch.filter((r) => !r.existingProductId)

        // Parallelize updates (each row needs individual update due to different IDs)
        if (toUpdate.length > 0) {
          const updateResults = await Promise.allSettled(
            toUpdate.map((row) =>
              supabase
                .from('supplier_products')
                .update({
                  supplier_name: row.parsed.name,
                  cost_price: row.parsed.cost_price,
                  list_price: row.parsed.list_price,
                  unit: row.parsed.unit,
                  category: row.parsed.category,
                  sub_category: row.parsed.sub_category,
                  manufacturer: row.parsed.manufacturer,
                  ean: row.parsed.ean,
                  min_order_quantity: row.parsed.min_order_quantity,
                  last_synced_at: now,
                })
                .eq('id', row.existingProductId!)
            )
          )

          // Count successes and collect price changes
          const priceHistoryBatch: Array<Record<string, unknown>> = []
          for (let j = 0; j < toUpdate.length; j++) {
            const result = updateResults[j]
            if (result.status === 'fulfilled' && !result.value.error) {
              updatedProducts++
              const row = toUpdate[j]
              const existingPrice = existingPriceMap.get(row.parsed.sku)

              if (existingPrice && row.parsed.cost_price !== null) {
                const oldPrice = existingPrice.cost
                const newPrice = row.parsed.cost_price

                if (oldPrice !== newPrice) {
                  const changePercent = calculatePriceChange(oldPrice, newPrice)
                  priceChanges.push({
                    supplier_product_id: row.existingProductId!,
                    supplier_sku: row.parsed.sku,
                    product_name: row.parsed.name,
                    old_cost_price: oldPrice,
                    new_cost_price: newPrice,
                    old_list_price: existingPrice.list,
                    new_list_price: row.parsed.list_price,
                    change_percentage: changePercent,
                  })
                  priceHistoryBatch.push({
                    supplier_product_id: row.existingProductId,
                    old_cost_price: oldPrice,
                    new_cost_price: newPrice,
                    old_list_price: existingPrice.list,
                    new_list_price: row.parsed.list_price,
                    change_percentage: changePercent,
                    change_source: 'import',
                    import_batch_id: batch.id,
                  })
                }
              }
            }
          }

          // Batch-insert price history records
          if (priceHistoryBatch.length > 0) {
            await supabase.from('price_history').insert(priceHistoryBatch)
          }
        }

        // Batch-insert new products
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('supplier_products')
            .insert(
              toInsert.map((row) => ({
                supplier_id: supplierId,
                supplier_sku: row.parsed.sku,
                supplier_name: row.parsed.name,
                cost_price: row.parsed.cost_price,
                list_price: row.parsed.list_price,
                unit: row.parsed.unit,
                category: row.parsed.category,
                sub_category: row.parsed.sub_category,
                manufacturer: row.parsed.manufacturer,
                ean: row.parsed.ean,
                min_order_quantity: row.parsed.min_order_quantity,
                is_available: true,
                last_synced_at: now,
              }))
            )

          if (!insertError) {
            newProducts += toInsert.length
          }
        }
      }

      // Update supplier settings with last import time
      await supabase
        .from('supplier_settings')
        .upsert({
          supplier_id: supplierId,
          last_import_at: new Date().toISOString(),
        })

      const result: ImportResult = {
        batch_id: batch.id,
        total_rows: validatedRows.length,
        new_products: newProducts,
        updated_products: updatedProducts,
        skipped_rows: validatedRows.length - validRows.length,
        errors: validatedRows
          .filter((r) => !r.isValid)
          .flatMap((r) =>
            r.errors.map((message) => ({
              row: r.rowNumber,
              message,
            }))
          ),
        price_changes: priceChanges,
        status: 'completed',
      }

      // Update batch with final results
      await supabase
        .from('import_batches')
        .update({
          total_rows: result.total_rows,
          processed_rows: result.total_rows,
          new_products: result.new_products,
          updated_products: result.updated_products,
          skipped_rows: result.skipped_rows,
          errors: result.errors,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id)

      revalidatePath('/dashboard/settings/suppliers')
      revalidatePath(`/dashboard/settings/suppliers/${supplierId}`)

      return { success: true, data: result }
    } catch (err) {
      // Update batch with error status
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          errors: [{ row: 0, message: err instanceof Error ? err.message : 'Ukendt fejl' }],
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id)

      throw err
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Import fejlede') }
  }
}

// =====================================================
// Import History
// =====================================================

export async function getImportBatches(
  filters?: ImportBatchFilters
): Promise<ActionResult<PaginatedResponse<ImportBatchSummary>>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    let countQuery = supabase
      .from('v_import_batches_summary')
      .select('*', { count: 'exact', head: true })

    let dataQuery = supabase
      .from('v_import_batches_summary')
      .select('*')

    // Apply filters
    if (filters?.supplier_id) {
      validateUUID(filters.supplier_id, 'leverandør ID')
      countQuery = countQuery.eq('supplier_id', filters.supplier_id)
      dataQuery = dataQuery.eq('supplier_id', filters.supplier_id)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.is_dry_run !== undefined) {
      countQuery = countQuery.eq('is_dry_run', filters.is_dry_run)
      dataQuery = dataQuery.eq('is_dry_run', filters.is_dry_run)
    }

    // Sorting
    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Database error counting import batches:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching import batches:', dataResult.error)
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: (dataResult.data || []) as ImportBatchSummary[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente importhistorik') }
  }
}

export async function getImportBatch(
  batchId: string
): Promise<ActionResult<ImportBatchSummary>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(batchId, 'batch ID')

    const { data, error } = await supabase
      .from('v_import_batches_summary')
      .select('*')
      .eq('id', batchId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Import batch ikke fundet' }
      }
      console.error('Database error fetching import batch:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as ImportBatchSummary }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente import batch') }
  }
}

// =====================================================
// Retry Import
// =====================================================

export async function retryImport(
  batchId: string
): Promise<ActionResult<ImportResult>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(batchId, 'batch ID')

    // Get original batch info
    const { data: batch, error } = await supabase
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .single()

    if (error || !batch) {
      return { success: false, error: 'Import batch ikke fundet' }
    }

    if (batch.status === 'completed') {
      return { success: false, error: 'Denne import er allerede gennemført' }
    }

    // Note: Retry would require storing the original file content
    // For now, return an error indicating the user needs to upload again
    return {
      success: false,
      error: 'Genimport kræver at filen uploades igen',
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke genstarte import') }
  }
}

// =====================================================
// Price Changes from Import
// =====================================================

export async function getPriceChangesFromImport(
  batchId: string
): Promise<ActionResult<PriceChange[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(batchId, 'batch ID')

    const { data, error } = await supabase
      .from('price_history')
      .select(`
        id,
        supplier_product_id,
        old_cost_price,
        new_cost_price,
        old_list_price,
        new_list_price,
        change_percentage,
        created_at,
        supplier_products!inner(supplier_sku, supplier_name)
      `)
      .eq('import_batch_id', batchId)
      .order('change_percentage', { ascending: false })

    if (error) {
      console.error('Database error fetching price changes:', error)
      throw new Error('DATABASE_ERROR')
    }

    const priceChanges: PriceChange[] = (data || []).map((row) => {
      const supplierProduct = row.supplier_products as unknown as { supplier_sku: string; supplier_name: string }
      return {
        supplier_product_id: row.supplier_product_id,
        supplier_sku: supplierProduct.supplier_sku,
        product_name: supplierProduct.supplier_name,
        old_cost_price: row.old_cost_price,
        new_cost_price: row.new_cost_price,
        old_list_price: row.old_list_price,
        new_list_price: row.new_list_price,
        change_percentage: row.change_percentage,
      }
    })

    return { success: true, data: priceChanges }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente prisændringer') }
  }
}
