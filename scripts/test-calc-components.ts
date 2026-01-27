// Test script to verify calc_components migration
// Run with: npx ts-node scripts/test-calc-components.ts

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testCalcComponents() {
  console.log('Testing calc_components migration...\n')

  // Test 1: Check categories
  console.log('1. Component Categories:')
  const { data: categories, error: catError } = await supabase
    .from('calc_component_categories')
    .select('name, slug')
    .order('sort_order')

  if (catError) {
    console.error('   ERROR:', catError.message)
  } else {
    categories?.forEach(c => console.log(`   - ${c.name} (${c.slug})`))
  }

  // Test 2: Check components
  console.log('\n2. Components:')
  const { data: components, error: compError } = await supabase
    .from('calc_components')
    .select('code, name, base_time_minutes, difficulty_level')
    .order('code')

  if (compError) {
    console.error('   ERROR:', compError.message)
  } else {
    components?.forEach(c =>
      console.log(`   - ${c.code}: ${c.name} (${c.base_time_minutes} min, level ${c.difficulty_level})`)
    )
  }

  // Test 3: Check variants for Stikkontakt
  console.log('\n3. Variants for STIK-STD:')
  const { data: variants, error: varError } = await supabase
    .from('calc_component_variants')
    .select(`
      name,
      code,
      time_multiplier,
      extra_minutes,
      is_default,
      component:calc_components!inner(code)
    `)
    .eq('component.code', 'STIK-STD')
    .order('sort_order')

  if (varError) {
    console.error('   ERROR:', varError.message)
  } else {
    variants?.forEach(v =>
      console.log(`   - ${v.name} (${v.code}): x${v.time_multiplier} +${v.extra_minutes}min ${v.is_default ? '[DEFAULT]' : ''}`)
    )
  }

  // Test 4: Check materials for Stikkontakt
  console.log('\n4. Materials for STIK-STD:')
  const { data: materials, error: matError } = await supabase
    .from('calc_component_materials')
    .select(`
      material_name,
      quantity,
      unit,
      component:calc_components!inner(code)
    `)
    .eq('component.code', 'STIK-STD')
    .order('sort_order')

  if (matError) {
    console.error('   ERROR:', matError.message)
  } else {
    materials?.forEach(m =>
      console.log(`   - ${m.quantity} ${m.unit} ${m.material_name}`)
    )
  }

  // Test 5: Check labor rules
  console.log('\n5. Labor Rules for STIK-STD:')
  const { data: rules, error: ruleError } = await supabase
    .from('calc_component_labor_rules')
    .select(`
      rule_name,
      condition_type,
      extra_minutes,
      component:calc_components!inner(code)
    `)
    .eq('component.code', 'STIK-STD')

  if (ruleError) {
    console.error('   ERROR:', ruleError.message)
  } else {
    rules?.forEach(r =>
      console.log(`   - ${r.rule_name} (${r.condition_type}): +${r.extra_minutes}min`)
    )
  }

  // Test 6: Summary view
  console.log('\n6. Component Summary View:')
  const { data: summary, error: sumError } = await supabase
    .from('v_calc_components_summary')
    .select('*')
    .limit(5)

  if (sumError) {
    console.error('   ERROR:', sumError.message)
  } else {
    summary?.forEach(s =>
      console.log(`   - ${s.code}: ${s.name} | ${s.variant_count} variants, ${s.material_count} materials, ${s.rule_count} rules`)
    )
  }

  console.log('\n✓ Test complete!')
}

testCalcComponents().catch(console.error)
