/**
 * Supplier Adapters Index
 *
 * Imports all supplier adapters to register them with the SupplierAdapterRegistry.
 * Also re-exports legacy compatibility classes and the new adapter classes.
 */

// Import adapters to trigger registration
import './ao-importer'
import './lm-importer'

// Re-export adapter classes
export { AOAdapter, AOImporter, AO_IMPORTER_INFO, AO_COLUMN_MAPPINGS, AO_DEFAULT_CONFIG } from './ao-importer'
export { LMAdapter, LMImporter, LM_IMPORTER_INFO, LM_COLUMN_MAPPINGS, LM_DEFAULT_CONFIG } from './lm-importer'

// Re-export registry
export { SupplierAdapterRegistry } from '../supplier-adapter'
export type { SupplierAdapter, SupplierAdapterInfo } from '../supplier-adapter'

// =====================================================
// Legacy Importer Registry (backwards compatible)
// =====================================================

import { AO_IMPORTER_INFO } from './ao-importer'
import { LM_IMPORTER_INFO } from './lm-importer'

export const IMPORTER_REGISTRY = {
  AO: AO_IMPORTER_INFO,
  LM: LM_IMPORTER_INFO,
} as const

export type ImporterCode = keyof typeof IMPORTER_REGISTRY

/**
 * Get importer info by supplier code
 */
export function getImporterInfo(code: string) {
  return IMPORTER_REGISTRY[code as ImporterCode] || null
}

/**
 * Get all available importers
 */
export function getAllImporters() {
  return Object.values(IMPORTER_REGISTRY)
}
