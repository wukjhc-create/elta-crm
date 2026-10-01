/** Rå PostgREST-filterstrenge til udforskning af escaping (harness or-filter --explore). String.raw = præcis det der sendes. */
export const OR_FILTER_PROBES: string[] = [
  String.raw`company_name.ilike."%\%%"`,        // én backslash før %
  String.raw`company_name.ilike."%\\%%"`,       // to backslashes før %
  String.raw`company_name.ilike."%\\\%%"`,      // tre
  String.raw`company_name.ilike."%\\\\%%"`,     // fire
  String.raw`company_name.ilike."%\_x%"`,       // _ med én backslash
  String.raw`company_name.ilike."%\\_x%"`,      // _ med to
  String.raw`company_name.ilike."%back\slash%"`,
  String.raw`company_name.ilike."%back\\slash%"`,
  String.raw`company_name.ilike."%back\\\\slash%"`,
  String.raw`company_name.ilike."%\"A\"%"`,
]
export const OR_FILTER_NAMES: string[] = [
  'Kabel 3x1,5 mm', 'Hansen, Jens (VVS)', 'Citat "A"', '50% rabat_x', String.raw`back\slash`, 'rabatXx',
]
/** [søgetekst, forventede træf (indeks i OR_FILTER_NAMES)] — helperen skal matche bogstaveligt. */
export const OR_FILTER_CASES: Array<[string, number[]]> = [
  ['3x1,5', [0]],
  ['Hansen, Jens (VVS)', [1]],
  ['(VVS', [1]],
  ['"A"', [2]],
  ['50%', [3]],
  ['%', [3]],          // bogstaveligt % — ikke wildcard
  ['_x', [3]],         // bogstaveligt _ — ikke "rabatXx"
  [String.raw`back\slash`, [4]],
  [String.fromCharCode(92), [4]], // én backslash
  ['rabat', [3, 5]],
]
