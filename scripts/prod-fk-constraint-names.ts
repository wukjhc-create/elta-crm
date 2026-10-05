/** PRODUCTION read-only: navne + definition på FK'erne customers.created_by og offers.customer_id (til migration). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-fk-constraint-names', async (run) => {
  const rows = await run(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE contype = 'f' AND ((conrelid = 'public.customers'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.customers'::regclass AND attname = 'created_by')])
      OR (conrelid = 'public.offers'::regclass AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.offers'::regclass AND attname = 'customer_id')]))`)
  for (const r of rows) console.log(`${r.t}: ${r.conname} — ${r.def}`)
  const [n] = await run(`SELECT (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'created_by') created_by_nullable`)
  console.log(JSON.stringify(n))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
