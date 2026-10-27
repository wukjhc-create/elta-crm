/** Delte SELECT'er (read-only) til at sammenligne en kolonnes præcise definition mellem staging og prod. */
export function columnDetailQueries(table: string, col: string): Record<string, string> {
  if (!/^[a-z_0-9]+$/.test(table) || !/^[a-z_0-9]+$/.test(col)) throw new Error('ugyldig tabel/kolonne')
  const att = `(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.${table}'::regclass AND attname = '${col}')`
  return {
    column: `SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${col}'`,
    fk: `SELECT conname, pg_get_constraintdef(oid) def, convalidated FROM pg_constraint WHERE conrelid = 'public.${table}'::regclass AND contype = 'f' AND conkey @> ARRAY[${att}]::smallint[] ORDER BY 1`,
    indexes: `SELECT i.relname indexname, pg_get_indexdef(i.oid) def FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid = 'public.${table}'::regclass AND ${att} = ANY (x.indkey::smallint[]) ORDER BY 1`,
    stats: `SELECT count(*)::int n, count(${col})::int n_set FROM public.${table}`,
  }
}

/** Politikker for kommaseparerede tabeller (kun [a-z_0-9]) — samme SELECT på staging og prod */
export function tablePoliciesQuery(tablesCsv: string): string {
  const tables = tablesCsv.split(',').map((t) => t.trim()).filter(Boolean)
  if (!tables.length || tables.some((t) => !/^[a-z_0-9]+$/.test(t))) throw new Error('ugyldige tabeller')
  return `SELECT tablename, policyname, cmd, roles::text roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${tables.map((t) => `'${t}'`).join(', ')}) ORDER BY tablename, cmd, policyname`
}
