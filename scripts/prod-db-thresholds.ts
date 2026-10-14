/** PRODUCTION read-only: DB-tærskler i calculation_settings (PE-7).  npx tsx scripts/prod-db-thresholds.ts */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-db-thresholds', async (run) => {
  const rows = (await run(`SELECT setting_key, setting_value FROM calculation_settings WHERE setting_key IN ('minimum_db','default_db_target','db_green_threshold','db_yellow_threshold','db_red_threshold') ORDER BY setting_key`)) as Array<{ setting_key: string; setting_value: unknown }>
  for (const r of rows) console.log(`${r.setting_key}: ${JSON.stringify(r.setting_value)}`)
  if (rows.length === 0) console.log('ingen rækker (kode-standarder gælder)')
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
