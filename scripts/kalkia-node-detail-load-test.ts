/** Kalkia-noden siger naar laesningen fejler. Et aegte ukendt id bliver vaek. Koer: npx tsx scripts/kalkia-node-detail-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/[id]/page.tsx', 'utf8')
eq('ukendt bliver', page.includes("nodeResult.error !== 'Noden blev ikke fundet'") && page.includes('notFound()'), true)
eq('laese-fejl', page.includes('data-testid="kalkia-node-detail-load-error"') && page.includes('Det tælles ikke som at noden mangler.'), true)
eq('kategorier bliver', page.includes('categoriesResult.success && categoriesResult.data ? categoriesResult.data : []'), true)

const action = fs.readFileSync('src/lib/actions/kalkia-nodes.ts', 'utf8')
eq('ikke-fundet bliver', action.includes("return { success: false, error: 'Noden blev ikke fundet' }"), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-node-detail-load-test OK')
process.exitCode = fail ? 1 : 0
