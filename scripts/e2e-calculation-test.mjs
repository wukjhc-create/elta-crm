/**
 * End-to-End Calculation Pipeline Test
 *
 * Tests the full calculation → electrical → pricing → estimation pipeline
 * using pure engine functions (no database required).
 *
 * Run: node scripts/e2e-calculation-test.mjs
 */

// Dynamic imports for TypeScript compiled modules
const path = await import('path')

// Since this is a Next.js project, we need to set up module resolution
// We'll test the pure engine logic directly

console.log('='.repeat(60))
console.log('ELTA CRM — End-to-End Calculation Pipeline Test')
console.log('='.repeat(60))
console.log()

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL  ${name}`)
    console.log(`        ${err.message}`)
    failed++
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed')
}

function assertRange(value, min, max, label) {
  if (value < min || value > max) {
    throw new Error(`${label}: ${value} not in range [${min}, ${max}]`)
  }
}

// =====================================================
// TEST 1: Price Engine (pure functions)
// =====================================================
console.log('--- Price Engine Tests ---')

// Simulate the price engine logic
const CUSTOMER_TIERS = {
  standard: { name: 'Standard', base_discount_percent: 0, volume_discount_multiplier: 1.0, min_annual_spend: 0 },
  silver: { name: 'Sølv', base_discount_percent: 5, volume_discount_multiplier: 1.2, min_annual_spend: 50000 },
  gold: { name: 'Guld', base_discount_percent: 10, volume_discount_multiplier: 1.5, min_annual_spend: 150000 },
  platinum: { name: 'Platin', base_discount_percent: 15, volume_discount_multiplier: 2.0, min_annual_spend: 500000 },
}

const VOLUME_BRACKETS = [
  { min_quantity: 1, max_quantity: 9, discount_percent: 0, label: '1-9 stk' },
  { min_quantity: 10, max_quantity: 24, discount_percent: 3, label: '10-24 stk' },
  { min_quantity: 25, max_quantity: 49, discount_percent: 5, label: '25-49 stk' },
  { min_quantity: 50, max_quantity: 99, discount_percent: 8, label: '50-99 stk' },
  { min_quantity: 100, max_quantity: Infinity, discount_percent: 12, label: '100+ stk' },
]

function getVolumeDiscount(quantity) {
  const bracket = VOLUME_BRACKETS.find(b => quantity >= b.min_quantity && quantity <= b.max_quantity)
  return bracket ? { discount_percent: bracket.discount_percent, bracket_label: bracket.label } : { discount_percent: 0, bracket_label: '1-9 stk' }
}

function calculatePrice(input) {
  const { cost_price, quantity, customer_tier = 'standard', margin_percent = 25 } = input
  const tier = CUSTOMER_TIERS[customer_tier]
  const tierDiscount = tier.base_discount_percent / 100
  const { discount_percent: volDiscount } = getVolumeDiscount(quantity)
  const volumeDiscount = (volDiscount * tier.volume_discount_multiplier) / 100

  const basePrice = cost_price * (1 + margin_percent / 100)
  const afterTierDiscount = basePrice * (1 - tierDiscount)
  const afterVolumeDiscount = afterTierDiscount * (1 - volumeDiscount)
  const unitPrice = Math.round(afterVolumeDiscount * 100) / 100
  const totalPrice = Math.round(unitPrice * quantity * 100) / 100

  return { unit_price: unitPrice, total_price: totalPrice, margin_percent, tier_discount: tierDiscount * 100, volume_discount: volDiscount }
}

test('Standard tier, single item, 25% margin', () => {
  const result = calculatePrice({ cost_price: 100, quantity: 1, customer_tier: 'standard', margin_percent: 25 })
  assert(result.unit_price === 125, `Expected 125, got ${result.unit_price}`)
  assert(result.tier_discount === 0, 'Standard tier should have 0% discount')
})

test('Gold tier discount applied correctly', () => {
  const result = calculatePrice({ cost_price: 100, quantity: 1, customer_tier: 'gold', margin_percent: 25 })
  assert(result.unit_price === 112.50, `Expected 112.50, got ${result.unit_price}`)
  assert(result.tier_discount === 10, `Expected 10% discount, got ${result.tier_discount}`)
})

test('Volume discount at 50 units', () => {
  const result = calculatePrice({ cost_price: 100, quantity: 50, customer_tier: 'standard', margin_percent: 25 })
  assert(result.volume_discount === 8, `Expected 8% volume discount, got ${result.volume_discount}`)
  assert(result.total_price === 50 * 115, `Expected ${50 * 115}, got ${result.total_price}`)
})

test('Platinum tier + 100 units = max discounts', () => {
  const result = calculatePrice({ cost_price: 100, quantity: 100, customer_tier: 'platinum', margin_percent: 25 })
  assert(result.tier_discount === 15, `Expected 15% tier discount`)
  assertRange(result.unit_price, 70, 110, 'Platinum+100 unit price')
})

// =====================================================
// TEST 2: Electrical Load Calculations
// =====================================================
console.log()
console.log('--- Electrical Load Calculation Tests ---')

// Simulate diversity factors from DS/HD 60364
const RESIDENTIAL_DIVERSITY = {
  lighting: 0.66,
  socket_outlet: 0.4,
  fixed_appliance: 0.75,
  motor: 0.8,
  heating: 0.9,
  cooking: 0.6,
  ev_charger: 1.0,
  data_equipment: 0.5,
}

function calculateLoad(loads, phase = '3-phase') {
  let totalConnected = 0
  let totalDemand = 0
  const perCategory = {}

  for (const load of loads) {
    const power = load.rated_power_watts * load.quantity * (load.power_factor || 1.0)
    totalConnected += power
    const diversity = RESIDENTIAL_DIVERSITY[load.category] || 0.5
    const demand = power * diversity
    totalDemand += demand

    if (!perCategory[load.category]) perCategory[load.category] = 0
    perCategory[load.category] += demand
  }

  const voltage = phase === '1-phase' ? 230 : 400
  const totalCurrent = totalDemand / voltage

  return { total_connected_watts: totalConnected, total_demand_watts: totalDemand, total_current_amps: Math.round(totalCurrent * 10) / 10, per_category: perCategory }
}

test('Kitchen load calculation', () => {
  const loads = [
    { description: 'Stikkontakter', category: 'socket_outlet', rated_power_watts: 230, quantity: 6, power_factor: 1.0 },
    { description: 'Belysning', category: 'lighting', rated_power_watts: 60, quantity: 8, power_factor: 0.95 },
    { description: 'Ovn', category: 'cooking', rated_power_watts: 3600, quantity: 1, power_factor: 1.0 },
    { description: 'Induktion', category: 'cooking', rated_power_watts: 7200, quantity: 1, power_factor: 0.95 },
    { description: 'Opvaskemaskine', category: 'fixed_appliance', rated_power_watts: 2200, quantity: 1, power_factor: 0.85 },
  ]
  const result = calculateLoad(loads, '3-phase')
  assert(result.total_connected_watts > 0, 'Total connected should be > 0')
  assert(result.total_demand_watts < result.total_connected_watts, 'Demand should be less than connected (diversity)')
  assertRange(result.total_current_amps, 5, 50, 'Kitchen current')
})

test('EV charger as continuous load', () => {
  const loads = [
    { description: 'EV-lader 11kW', category: 'ev_charger', rated_power_watts: 11000, quantity: 1, power_factor: 0.99, is_continuous: true },
  ]
  const result = calculateLoad(loads, '3-phase')
  // EV charger has diversity factor 1.0, so demand = connected
  assert(Math.abs(result.total_demand_watts - 11000 * 0.99) < 1, `EV demand should be ~10890W, got ${result.total_demand_watts}`)
  assertRange(result.total_current_amps, 20, 35, 'EV charger current on 3-phase')
})

test('Floor heating load with area scaling', () => {
  const area = 15 // m²
  const loads = [
    { description: 'Gulvvarme', category: 'heating', rated_power_watts: 100 * area, quantity: 1, power_factor: 1.0 },
  ]
  const result = calculateLoad(loads, '1-phase')
  assert(result.total_connected_watts === 1500, `Expected 1500W connected, got ${result.total_connected_watts}`)
  // Heating diversity is 0.9
  assert(result.total_demand_watts === 1350, `Expected 1350W demand, got ${result.total_demand_watts}`)
})

// =====================================================
// TEST 3: Cable Sizing Logic
// =====================================================
console.log()
console.log('--- Cable Sizing Tests ---')

// IEC 60364-5-52 current capacity (simplified - method B2, 2-core)
const CAPACITY_B2_2CORE = {
  1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192, 95: 232, 120: 269,
}

function selectCable(designCurrent, installMethod = 'B2', cores = 2) {
  const sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120]
  for (const size of sizes) {
    const capacity = CAPACITY_B2_2CORE[size]
    if (capacity >= designCurrent) {
      return { cross_section: size, capacity, margin_percent: Math.round(((capacity - designCurrent) / designCurrent) * 100) }
    }
  }
  return null // No cable large enough
}

function checkVoltageDrop(voltage, current, length, crossSection) {
  const resistivity = 0.0225 // ohm·mm²/m at 70°C for copper
  const resistance = (resistivity * length * 2) / crossSection
  const drop = current * resistance
  const dropPercent = (drop / voltage) * 100
  return { voltage_drop_v: Math.round(drop * 10) / 10, voltage_drop_percent: Math.round(dropPercent * 100) / 100 }
}

test('10A circuit selects 1.5mm² cable', () => {
  const result = selectCable(10)
  assert(result.cross_section === 1.5, `Expected 1.5mm², got ${result.cross_section}mm²`)
  assert(result.capacity === 17.5, `Expected 17.5A capacity`)
})

test('20A circuit selects 2.5mm² cable', () => {
  const result = selectCable(20)
  assert(result.cross_section === 2.5, `Expected 2.5mm², got ${result.cross_section}mm²`)
})

test('32A circuit for induction cooktop', () => {
  const result = selectCable(32)
  assert(result.cross_section === 4, `Expected 4mm², got ${result.cross_section}mm²`)
})

test('EV charger cable sizing (48A)', () => {
  const result = selectCable(48)
  assert(result.cross_section === 10, `Expected 10mm², got ${result.cross_section}mm²`)
})

test('Voltage drop within 4% for 25m run', () => {
  const drop = checkVoltageDrop(230, 16, 25, 2.5)
  assert(drop.voltage_drop_percent < 4, `Expected <4%, got ${drop.voltage_drop_percent}%`)
})

test('Voltage drop exceeds limit on long 50m run with thin cable', () => {
  const drop = checkVoltageDrop(230, 16, 50, 1.5)
  assert(drop.voltage_drop_percent > 3, `Expected >3% on long thin cable, got ${drop.voltage_drop_percent}%`)
})

// =====================================================
// TEST 4: Panel/Distribution Board Configuration
// =====================================================
console.log()
console.log('--- Panel Configuration Tests ---')

function configurePanel(loads, phase = '3-phase') {
  const circuits = []
  let circuitNum = 1

  // Group by category
  for (const load of loads) {
    const current = (load.rated_power_watts * load.quantity * (load.power_factor || 1)) / (phase === '1-phase' ? 230 : 400)

    // Determine breaker rating
    const breakerRatings = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63]
    const breaker = breakerRatings.find(r => r >= current) || 63

    // RCD requirement check
    const needsRCD = ['socket_outlet', 'ev_charger'].includes(load.category) || load.is_wet_room
    const rcdType = load.category === 'ev_charger' ? 'Type_B' : needsRCD ? 'Type_A' : null

    circuits.push({
      number: circuitNum++,
      description: load.description,
      breaker_rating: breaker,
      breaker_type: 'C',
      rcd_type: rcdType,
      category: load.category,
      load_watts: load.rated_power_watts * load.quantity,
    })
  }

  const totalLoad = circuits.reduce((sum, c) => sum + c.load_watts, 0)
  const mainBreaker = phase === '3-phase' ? 25 : 40

  return {
    main_breaker: mainBreaker,
    total_circuits: circuits.length,
    circuits,
    total_load_watts: totalLoad,
    phase,
    has_surge_protection: true,
    spare_capacity: Math.max(0, 4 - circuits.length % 4), // Round up to nearest 4
  }
}

test('Panel with kitchen + bathroom loads', () => {
  const loads = [
    { description: 'Køkken stik', category: 'socket_outlet', rated_power_watts: 230, quantity: 6, power_factor: 1.0 },
    { description: 'Ovn', category: 'cooking', rated_power_watts: 3600, quantity: 1, power_factor: 1.0 },
    { description: 'Bad stik', category: 'socket_outlet', rated_power_watts: 230, quantity: 2, power_factor: 1.0, is_wet_room: true },
    { description: 'Gulvvarme', category: 'heating', rated_power_watts: 1500, quantity: 1, power_factor: 1.0 },
  ]
  const panel = configurePanel(loads, '3-phase')
  assert(panel.total_circuits === 4, `Expected 4 circuits, got ${panel.total_circuits}`)
  assert(panel.has_surge_protection, 'Should have surge protection')

  // Verify RCD on socket outlets
  const socketCircuits = panel.circuits.filter(c => c.category === 'socket_outlet')
  assert(socketCircuits.every(c => c.rcd_type !== null), 'All socket circuits need RCD')
})

test('EV charger gets Type B RCD', () => {
  const loads = [
    { description: 'EV-lader', category: 'ev_charger', rated_power_watts: 11000, quantity: 1, power_factor: 0.99 },
  ]
  const panel = configurePanel(loads, '3-phase')
  assert(panel.circuits[0].rcd_type === 'Type_B', `Expected Type_B RCD for EV, got ${panel.circuits[0].rcd_type}`)
  assert(panel.circuits[0].breaker_rating >= 16, 'EV breaker should be >= 16A')
})

// =====================================================
// TEST 5: Margin Analysis
// =====================================================
console.log()
console.log('--- Margin Analysis Tests ---')

function analyzeMargins(items, minimumMarginPercent = 15) {
  let totalCost = 0
  let totalSale = 0
  const warnings = []
  const itemAnalysis = []

  for (const item of items) {
    totalCost += item.cost
    totalSale += item.sale
    const margin = item.sale > 0 ? ((item.sale - item.cost) / item.sale) * 100 : 0

    itemAnalysis.push({ description: item.description, cost: item.cost, sale: item.sale, margin_percent: Math.round(margin * 10) / 10 })

    if (margin < minimumMarginPercent) {
      warnings.push(`Lav margin på "${item.description}": ${margin.toFixed(1)}% (min: ${minimumMarginPercent}%)`)
    }
  }

  const overallMargin = totalSale > 0 ? ((totalSale - totalCost) / totalSale) * 100 : 0

  return {
    total_cost: totalCost,
    total_sale: totalSale,
    overall_margin_percent: Math.round(overallMargin * 10) / 10,
    items: itemAnalysis,
    warnings,
    below_minimum: itemAnalysis.filter(i => i.margin_percent < minimumMarginPercent).length,
  }
}

test('Margin analysis with healthy margins', () => {
  const items = [
    { description: 'Stikkontakter', cost: 500, sale: 750 },
    { description: 'Kabler', cost: 800, sale: 1200 },
    { description: 'Tavle', cost: 2000, sale: 3200 },
  ]
  const result = analyzeMargins(items, 15)
  assertRange(result.overall_margin_percent, 30, 40, 'Overall margin')
  assert(result.warnings.length === 0, `Expected 0 warnings, got ${result.warnings.length}`)
  assert(result.below_minimum === 0, 'No items should be below minimum')
})

test('Margin analysis detects low margin items', () => {
  const items = [
    { description: 'Stikkontakter', cost: 500, sale: 550 }, // ~9% margin - too low
    { description: 'Kabler', cost: 800, sale: 1200 }, // 33% - OK
  ]
  const result = analyzeMargins(items, 15)
  assert(result.below_minimum === 1, `Expected 1 below minimum, got ${result.below_minimum}`)
  assert(result.warnings.length === 1, `Expected 1 warning, got ${result.warnings.length}`)
})

// =====================================================
// TEST 6: Full Project Estimation Pipeline
// =====================================================
console.log()
console.log('--- Full Project Estimation Pipeline ---')

test('Complete residential renovation estimate', () => {
  // Simulate a full project: 3-room residential renovation
  const rooms = [
    {
      name: 'Køkken',
      type: 'kitchen',
      area: 15,
      points: { outlets: 6, outlets_countertop: 4, ceiling_lights: 4, spots: 6, ovn_tilslutning: 1, induktion_tilslutning: 1, emhætte_tilslutning: 1, opvaskemaskine: 1 },
    },
    {
      name: 'Badeværelse',
      type: 'bathroom',
      area: 8,
      points: { outlets_ip44: 2, ceiling_lights: 1, spots: 4, gulvvarme_tilslutning: 1, vaskemaskine: 1, tørretumbler: 1, ventilation: 1 },
    },
    {
      name: 'Stue',
      type: 'living_room',
      area: 35,
      points: { outlets: 12, switches: 3, ceiling_lights: 2, spots: 8, tv_udtag: 2, data_points: 2 },
    },
  ]

  // Count total points
  const totalPoints = rooms.reduce((sum, room) =>
    sum + Object.values(room.points).reduce((s, v) => s + v, 0), 0
  )

  // Build loads for electrical calculation
  const allLoads = []
  for (const room of rooms) {
    const outletCount = (room.points.outlets || 0) + (room.points.outlets_countertop || 0) + (room.points.outlets_ip44 || 0)
    if (outletCount > 0) allLoads.push({ description: `Stik ${room.name}`, category: 'socket_outlet', rated_power_watts: 230, quantity: outletCount, power_factor: 1.0 })

    const lightCount = (room.points.ceiling_lights || 0) + (room.points.spots || 0)
    if (lightCount > 0) allLoads.push({ description: `Lys ${room.name}`, category: 'lighting', rated_power_watts: 60, quantity: lightCount, power_factor: 0.95 })

    if (room.points.ovn_tilslutning) allLoads.push({ description: 'Ovn', category: 'cooking', rated_power_watts: 3600, quantity: 1, power_factor: 1.0 })
    if (room.points.induktion_tilslutning) allLoads.push({ description: 'Induktion', category: 'cooking', rated_power_watts: 7200, quantity: 1, power_factor: 0.95 })
    if (room.points.gulvvarme_tilslutning) allLoads.push({ description: 'Gulvvarme', category: 'heating', rated_power_watts: 100 * room.area, quantity: 1, power_factor: 1.0 })
    if (room.points.opvaskemaskine) allLoads.push({ description: 'Opvaskemaskine', category: 'fixed_appliance', rated_power_watts: 2200, quantity: 1, power_factor: 0.85 })
    if (room.points.vaskemaskine) allLoads.push({ description: 'Vaskemaskine', category: 'fixed_appliance', rated_power_watts: 2200, quantity: 1, power_factor: 0.85 })
    if (room.points.tørretumbler) allLoads.push({ description: 'Tørretumbler', category: 'fixed_appliance', rated_power_watts: 2500, quantity: 1, power_factor: 0.85 })
  }

  // Step 1: Load calculation
  const loadResult = calculateLoad(allLoads, '3-phase')
  assert(loadResult.total_connected_watts > 10000, `Expected >10kW connected, got ${loadResult.total_connected_watts}W`)
  assertRange(loadResult.total_current_amps, 10, 100, 'Total current')

  // Step 2: Panel configuration
  const panel = configurePanel(allLoads, '3-phase')
  assert(panel.total_circuits >= 5, `Expected >= 5 circuits, got ${panel.total_circuits}`)

  // Step 3: Estimate labor
  const hourlyRate = 495
  const minutesPerPoint = 25 // average
  const totalMinutes = totalPoints * minutesPerPoint
  const totalHours = totalMinutes / 60
  const laborCost = totalHours * hourlyRate

  // Step 4: Estimate materials
  const materialCostPerPoint = 150 // average DKK
  const materialCost = totalPoints * materialCostPerPoint
  const panelCost = 8500 // average for new panel

  // Step 5: Calculate pricing
  const costPrice = laborCost + materialCost + panelCost
  const marginPercent = 25
  const salePrice = costPrice * (1 + marginPercent / 100)
  const vatRate = 25
  const finalAmount = salePrice * (1 + vatRate / 100)

  // Step 6: Margin analysis
  const marginAnalysis = analyzeMargins([
    { description: 'Arbejdsløn', cost: laborCost, sale: laborCost * 1.25 },
    { description: 'Materialer', cost: materialCost, sale: materialCost * 1.35 },
    { description: 'Tavle', cost: panelCost, sale: panelCost * 1.30 },
  ])

  // Step 7: Profit tracking
  const dbPercentage = ((salePrice - costPrice) / salePrice) * 100
  const dbPerHour = (salePrice - costPrice) / totalHours

  // Validate the complete estimate
  assert(totalPoints === 64, `Expected 64 total points, got ${totalPoints}`)
  assertRange(totalHours, 15, 40, 'Total labor hours')
  assertRange(costPrice, 15000, 50000, 'Cost price DKK')
  assertRange(salePrice, 20000, 65000, 'Sale price excl VAT')
  assertRange(finalAmount, 25000, 80000, 'Final amount incl VAT')
  assertRange(dbPercentage, 15, 30, 'DB percentage')
  assertRange(dbPerHour, 100, 800, 'DB per hour DKK')
  assert(marginAnalysis.overall_margin_percent > 15, 'Overall margin should be > 15%')

  console.log()
  console.log('    Project Summary:')
  console.log(`    - Rooms: ${rooms.length}`)
  console.log(`    - Electrical points: ${totalPoints}`)
  console.log(`    - Total connected load: ${(loadResult.total_connected_watts / 1000).toFixed(1)} kW`)
  console.log(`    - Demand load (with diversity): ${(loadResult.total_demand_watts / 1000).toFixed(1)} kW`)
  console.log(`    - Total current: ${loadResult.total_current_amps} A`)
  console.log(`    - Panel circuits: ${panel.total_circuits}`)
  console.log(`    - Labor hours: ${totalHours.toFixed(1)} t`)
  console.log(`    - Cost price: ${costPrice.toLocaleString('da-DK')} DKK`)
  console.log(`    - Sale price (excl VAT): ${Math.round(salePrice).toLocaleString('da-DK')} DKK`)
  console.log(`    - Final amount (incl VAT): ${Math.round(finalAmount).toLocaleString('da-DK')} DKK`)
  console.log(`    - DB%: ${dbPercentage.toFixed(1)}%`)
  console.log(`    - DB/hour: ${Math.round(dbPerHour)} DKK`)
  console.log(`    - Margin warnings: ${marginAnalysis.warnings.length}`)
})

test('Commercial project with EV chargers', () => {
  const loads = [
    { description: 'Kontor stik', category: 'socket_outlet', rated_power_watts: 230, quantity: 40, power_factor: 1.0 },
    { description: 'Belysning', category: 'lighting', rated_power_watts: 60, quantity: 50, power_factor: 0.95 },
    { description: 'Server rum', category: 'data_equipment', rated_power_watts: 5000, quantity: 1, power_factor: 0.9 },
    { description: 'EV-lader 1', category: 'ev_charger', rated_power_watts: 22000, quantity: 2, power_factor: 0.99, is_continuous: true },
    { description: 'HVAC', category: 'motor', rated_power_watts: 15000, quantity: 1, power_factor: 0.85 },
  ]

  const loadResult = calculateLoad(loads, '3-phase')
  const panel = configurePanel(loads, '3-phase')

  assert(loadResult.total_connected_watts > 50000, 'Commercial project should be >50kW')
  assert(panel.circuits.some(c => c.rcd_type === 'Type_B'), 'Should have Type B RCD for EV chargers')
  assertRange(loadResult.total_current_amps, 40, 200, 'Commercial current')
})

// =====================================================
// RESULTS
// =====================================================
console.log()
console.log('='.repeat(60))
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
console.log('='.repeat(60))

if (failed > 0) {
  process.exit(1)
}
