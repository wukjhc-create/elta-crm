/**
 * Component Matcher Engine
 *
 * Maps interpreted project data to:
 * - Calculation components (calc_components)
 * - Packages (calc_packages)
 * - Materials from suppliers
 *
 * Creates a complete bill of materials and labor estimate.
 */

import { createClient } from '@/lib/supabase/server'
import type {
  ProjectInterpretation,
  ElectricalPoints,
  CalculationComponent,
  CalculationMaterial,
} from '@/types/auto-project.types'

// =====================================================
// Types
// =====================================================

interface ComponentMatch {
  component_id?: string
  code: string
  name: string
  quantity: number
  unit: string
  unit_price: number
  time_minutes: number
  category: string
  source: 'database' | 'estimate'
}

interface MaterialMatch {
  material_id?: string
  supplier_product_id?: string
  name: string
  sku?: string
  supplier_name?: string
  quantity: number
  unit: string
  unit_cost: number
  unit_price: number
  source: 'database' | 'estimate'
}

interface MatchingResult {
  components: ComponentMatch[]
  materials: MaterialMatch[]
  unmatchedPoints: string[]
  matchConfidence: number
}

// =====================================================
// Default Component Data
// =====================================================

const DEFAULT_COMPONENTS: Record<string, Omit<ComponentMatch, 'quantity'>> = {
  outlet_single: {
    code: 'outlet_single',
    name: 'Stikkontakt enkelt',
    unit: 'stk',
    unit_price: 450,
    time_minutes: 25,
    category: 'outlet',
    source: 'estimate',
  },
  outlet_double: {
    code: 'outlet_double',
    name: 'Stikkontakt dobbelt',
    unit: 'stk',
    unit_price: 650,
    time_minutes: 30,
    category: 'outlet',
    source: 'estimate',
  },
  switch_single: {
    code: 'switch_single',
    name: 'Afbryder enkelt',
    unit: 'stk',
    unit_price: 350,
    time_minutes: 20,
    category: 'switch',
    source: 'estimate',
  },
  switch_multi: {
    code: 'switch_multi',
    name: 'Korrespondanceafbryder',
    unit: 'stk',
    unit_price: 550,
    time_minutes: 35,
    category: 'switch',
    source: 'estimate',
  },
  dimmer: {
    code: 'dimmer',
    name: 'Dæmper',
    unit: 'stk',
    unit_price: 750,
    time_minutes: 30,
    category: 'switch',
    source: 'estimate',
  },
  spot_light: {
    code: 'spot_light',
    name: 'LED Spot indbygning',
    unit: 'stk',
    unit_price: 350,
    time_minutes: 20,
    category: 'lighting',
    source: 'estimate',
  },
  ceiling_light: {
    code: 'ceiling_light',
    name: 'Loftudtag',
    unit: 'stk',
    unit_price: 400,
    time_minutes: 25,
    category: 'lighting',
    source: 'estimate',
  },
  outdoor_light: {
    code: 'outdoor_light',
    name: 'Udendørs lampeudtag',
    unit: 'stk',
    unit_price: 650,
    time_minutes: 40,
    category: 'lighting',
    source: 'estimate',
  },
  power_16a: {
    code: 'power_16a',
    name: 'Kraftstik 16A',
    unit: 'stk',
    unit_price: 850,
    time_minutes: 35,
    category: 'power',
    source: 'estimate',
  },
  power_32a: {
    code: 'power_32a',
    name: 'Kraftstik 32A',
    unit: 'stk',
    unit_price: 1250,
    time_minutes: 45,
    category: 'power',
    source: 'estimate',
  },
  ev_charger: {
    code: 'ev_charger',
    name: 'Elbillader installation',
    unit: 'stk',
    unit_price: 4500,
    time_minutes: 120,
    category: 'power',
    source: 'estimate',
  },
  data_outlet: {
    code: 'data_outlet',
    name: 'Dataudtag CAT6',
    unit: 'stk',
    unit_price: 550,
    time_minutes: 30,
    category: 'data',
    source: 'estimate',
  },
  tv_outlet: {
    code: 'tv_outlet',
    name: 'Antenne/TV udtag',
    unit: 'stk',
    unit_price: 450,
    time_minutes: 25,
    category: 'data',
    source: 'estimate',
  },
  panel_group: {
    code: 'panel_group',
    name: 'Gruppeudvidelse i tavle',
    unit: 'stk',
    unit_price: 650,
    time_minutes: 30,
    category: 'panel',
    source: 'estimate',
  },
  panel_new: {
    code: 'panel_new',
    name: 'Ny eltavle komplet',
    unit: 'stk',
    unit_price: 8500,
    time_minutes: 240,
    category: 'panel',
    source: 'estimate',
  },
}

const DEFAULT_MATERIALS: Record<string, Omit<MaterialMatch, 'quantity'>> = {
  cable_1_5mm: {
    name: 'Installationskabel NYM-J 3x1,5mm²',
    unit: 'm',
    unit_cost: 8.50,
    unit_price: 12.00,
    source: 'estimate',
  },
  cable_2_5mm: {
    name: 'Installationskabel NYM-J 3x2,5mm²',
    unit: 'm',
    unit_cost: 12.50,
    unit_price: 18.00,
    source: 'estimate',
  },
  cable_4mm: {
    name: 'Installationskabel NYM-J 3x4mm²',
    unit: 'm',
    unit_cost: 22.00,
    unit_price: 32.00,
    source: 'estimate',
  },
  cable_6mm: {
    name: 'Installationskabel NYM-J 5x6mm²',
    unit: 'm',
    unit_cost: 45.00,
    unit_price: 65.00,
    source: 'estimate',
  },
  cable_10mm: {
    name: 'Installationskabel NYM-J 5x10mm²',
    unit: 'm',
    unit_cost: 85.00,
    unit_price: 120.00,
    source: 'estimate',
  },
  cable_outdoor: {
    name: 'Jordkabel XPUJ 3x2,5mm²',
    unit: 'm',
    unit_cost: 28.00,
    unit_price: 40.00,
    source: 'estimate',
  },
  cable_data: {
    name: 'Datakabel CAT6 U/UTP',
    unit: 'm',
    unit_cost: 6.50,
    unit_price: 10.00,
    source: 'estimate',
  },
  outlet_material: {
    name: 'Stikkontakt komplet (FUGA)',
    unit: 'stk',
    unit_cost: 85.00,
    unit_price: 120.00,
    source: 'estimate',
  },
  switch_material: {
    name: 'Afbryder komplet (FUGA)',
    unit: 'stk',
    unit_cost: 75.00,
    unit_price: 105.00,
    source: 'estimate',
  },
  spot_material: {
    name: 'LED Spot 7W indbygning',
    unit: 'stk',
    unit_cost: 125.00,
    unit_price: 180.00,
    source: 'estimate',
  },
  junction_box: {
    name: 'Samledåse IP55',
    unit: 'stk',
    unit_cost: 18.00,
    unit_price: 28.00,
    source: 'estimate',
  },
  conduit: {
    name: 'Flexrør 16mm',
    unit: 'm',
    unit_cost: 3.50,
    unit_price: 6.00,
    source: 'estimate',
  },
}

// =====================================================
// Mapping Functions
// =====================================================

const POINT_TO_COMPONENT_MAP: Record<keyof ElectricalPoints, string> = {
  outlets: 'outlet_single',
  double_outlets: 'outlet_double',
  switches: 'switch_single',
  multi_switches: 'switch_multi',
  dimmers: 'dimmer',
  spots: 'spot_light',
  ceiling_lights: 'ceiling_light',
  outdoor_lights: 'outdoor_light',
  power_16a: 'power_16a',
  power_32a: 'power_32a',
  ev_charger: 'ev_charger',
  data_outlets: 'data_outlet',
  tv_outlets: 'tv_outlet',
}

async function fetchDatabaseComponents(): Promise<Map<string, ComponentMatch>> {
  try {
    const supabase = await createClient()

    const { data: components } = await supabase
      .from('calc_components')
      .select('id, name, code, price, time_estimate, unit, category')
      .eq('is_active', true)

    const map = new Map<string, ComponentMatch>()

    for (const comp of components || []) {
      map.set(comp.code, {
        component_id: comp.id,
        code: comp.code,
        name: comp.name,
        unit: comp.unit || 'stk',
        unit_price: comp.price || 0,
        time_minutes: comp.time_estimate || 30,
        category: comp.category || 'general',
        source: 'database',
        quantity: 0,
      })
    }

    return map
  } catch {
    return new Map()
  }
}

async function fetchSupplierMaterials(names: string[]): Promise<Map<string, MaterialMatch>> {
  try {
    const supabase = await createClient()

    // Search for materials in supplier products
    const { data: products } = await supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_sku,
        cost_price,
        list_price,
        product:product_catalog(
          id,
          name,
          sku,
          unit
        ),
        supplier:suppliers(
          name
        )
      `)
      .eq('is_active', true)
      .limit(100)

    const map = new Map<string, MaterialMatch>()

    for (const prod of products || []) {
      const product = prod.product as unknown as { id: string; name?: string; sku?: string; unit?: string } | null
      const supplier = prod.supplier as unknown as { name?: string } | null

      if (product) {
        const key = product.name?.toLowerCase().replace(/\s+/g, '_') || prod.id

        map.set(key, {
          material_id: product.id,
          supplier_product_id: prod.id,
          name: product.name || 'Ukendt produkt',
          sku: prod.supplier_sku || product.sku,
          supplier_name: supplier?.name || 'Ukendt',
          unit: product.unit || 'stk',
          unit_cost: prod.cost_price || 0,
          unit_price: prod.list_price || prod.cost_price * 1.25 || 0,
          source: 'database',
          quantity: 0,
        })
      }
    }

    return map
  } catch {
    return new Map()
  }
}

function mapPointsToComponents(
  points: ElectricalPoints,
  dbComponents: Map<string, ComponentMatch>
): ComponentMatch[] {
  const components: ComponentMatch[] = []

  for (const [pointKey, componentCode] of Object.entries(POINT_TO_COMPONENT_MAP)) {
    const quantity = points[pointKey as keyof ElectricalPoints] || 0

    if (quantity > 0) {
      // Try database first
      const dbComp = dbComponents.get(componentCode)

      if (dbComp) {
        components.push({
          ...dbComp,
          quantity,
        })
      } else if (DEFAULT_COMPONENTS[componentCode]) {
        // Fall back to defaults
        components.push({
          ...DEFAULT_COMPONENTS[componentCode],
          quantity,
        })
      }
    }
  }

  return components
}

function calculateMaterials(
  interpretation: ProjectInterpretation,
  components: ComponentMatch[]
): MaterialMatch[] {
  const materials: MaterialMatch[] = []

  // Cable requirements
  const cables = interpretation.cable_requirements

  if (cables.nym_1_5mm > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_1_5mm,
      quantity: cables.nym_1_5mm,
    })
  }

  if (cables.nym_2_5mm > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_2_5mm,
      quantity: cables.nym_2_5mm,
    })
  }

  if (cables.nym_4mm > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_4mm,
      quantity: cables.nym_4mm,
    })
  }

  if (cables.nym_6mm > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_6mm,
      quantity: cables.nym_6mm,
    })
  }

  if (cables.nym_10mm > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_10mm,
      quantity: cables.nym_10mm,
    })
  }

  if (cables.outdoor_cable > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_outdoor,
      quantity: cables.outdoor_cable,
    })
  }

  if (cables.data_cable > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.cable_data,
      quantity: cables.data_cable,
    })
  }

  // Components materials
  for (const comp of components) {
    if (comp.category === 'outlet') {
      materials.push({
        ...DEFAULT_MATERIALS.outlet_material,
        quantity: comp.quantity,
      })
    } else if (comp.category === 'switch') {
      materials.push({
        ...DEFAULT_MATERIALS.switch_material,
        quantity: comp.quantity,
      })
    } else if (comp.code === 'spot_light') {
      materials.push({
        ...DEFAULT_MATERIALS.spot_material,
        quantity: comp.quantity,
      })
    }
  }

  // Junction boxes (estimate 1 per 4 points)
  const totalPoints = components.reduce((sum, c) => sum + c.quantity, 0)
  const junctionBoxes = Math.ceil(totalPoints / 4)

  materials.push({
    ...DEFAULT_MATERIALS.junction_box,
    quantity: junctionBoxes,
  })

  // Conduit (estimate based on cable lengths)
  const totalCable = cables.nym_1_5mm + cables.nym_2_5mm + cables.nym_4mm
  const conduitLength = Math.round(totalCable * 0.7) // 70% of cable in conduit

  if (conduitLength > 0) {
    materials.push({
      ...DEFAULT_MATERIALS.conduit,
      quantity: conduitLength,
    })
  }

  return materials
}

function addPanelComponents(
  interpretation: ProjectInterpretation,
  components: ComponentMatch[],
  dbComponents: Map<string, ComponentMatch>
): void {
  const panel = interpretation.panel_requirements

  if (panel.new_panel_needed) {
    const dbComp = dbComponents.get('panel_new')
    components.push(dbComp ? { ...dbComp, quantity: 1 } : { ...DEFAULT_COMPONENTS.panel_new, quantity: 1 })
  } else if (panel.upgrade_needed) {
    const groupsToAdd = Math.max(panel.required_groups - (panel.current_groups || 8), 0)
    if (groupsToAdd > 0) {
      const dbComp = dbComponents.get('panel_group')
      components.push(
        dbComp
          ? { ...dbComp, quantity: groupsToAdd }
          : { ...DEFAULT_COMPONENTS.panel_group, quantity: groupsToAdd }
      )
    }
  }
}

// =====================================================
// Main Export
// =====================================================

export async function matchComponents(
  interpretation: ProjectInterpretation
): Promise<MatchingResult> {
  const unmatchedPoints: string[] = []

  // Fetch database components
  const dbComponents = await fetchDatabaseComponents()

  // Map electrical points to components
  const components = mapPointsToComponents(interpretation.electrical_points, dbComponents)

  // Add panel work if needed
  addPanelComponents(interpretation, components, dbComponents)

  // Calculate materials
  const materials = calculateMaterials(interpretation, components)

  // Calculate confidence based on database matches
  const totalComponents = components.length
  const dbMatchedComponents = components.filter(c => c.source === 'database').length
  const matchConfidence = totalComponents > 0 ? dbMatchedComponents / totalComponents : 0.5

  return {
    components,
    materials,
    unmatchedPoints,
    matchConfidence,
  }
}

// Convert to final format
export function toCalculationComponents(matches: ComponentMatch[]): CalculationComponent[] {
  return matches.map(m => ({
    component_id: m.component_id,
    name: m.name,
    code: m.code,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: m.unit_price,
    total: m.quantity * m.unit_price,
    time_minutes: m.time_minutes * m.quantity,
    category: m.category,
  }))
}

export function toCalculationMaterials(matches: MaterialMatch[]): CalculationMaterial[] {
  return matches.map(m => ({
    material_id: m.material_id,
    supplier_product_id: m.supplier_product_id,
    name: m.name,
    sku: m.sku,
    supplier_name: m.supplier_name,
    quantity: m.quantity,
    unit: m.unit,
    unit_cost: m.unit_cost,
    unit_price: m.unit_price,
    total_cost: m.quantity * m.unit_cost,
    total_price: m.quantity * m.unit_price,
  }))
}

export type { MatchingResult }
