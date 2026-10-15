/**
 * Unit-test (ingen netværk) for GP-7: klienter uden live-API markeres, så sync ikke stempler gamle priser som friske.
 *   npx tsx scripts/supplier-client-catalog-test.ts
 */
import { LMClassicClient, AOAPIClient } from '../src/lib/services/supplier-api-client'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
ok(new LMClassicClient('00000000-0000-0000-0000-000000000000', { baseUrl: 'https://example.invalid' }).readsLocalCatalog === true, 'LM Classic: læser lokalt katalog (ingen live-sync)')
ok(new AOAPIClient('00000000-0000-0000-0000-000000000000', { baseUrl: 'https://example.invalid' }).readsLocalCatalog === false, 'AO: live-API')
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ klient-katalogmarkering ok')
process.exitCode = bad ? 1 : 0
