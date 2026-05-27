#!/usr/bin/env node
/**
 * Sprint 12C + 13A.1 - CI guard against PGRST201 regression.
 *
 * Scans src/ for PostgREST customer-embeds where the nearest preceding
 * .from(...) parent has multiple FKs to customers, but the embed lacks
 * the disambiguator (!<table>_customer_id_fkey).
 *
 * Guarded parent tables (extend here when new sagspartner-tables ship):
 *   - offers   (migration 00118 added orderer/end/payer FKs)
 *   - invoices (migration 00119 added orderer/end/payer FKs)
 *
 * Detected ambiguous embed forms (both PostgREST syntaxes):
 *   - customer:customers(...)                   ← aliased child
 *   - customer:customers ( ... )                ← aliased + whitespace
 *   - customers(...)                            ← anonymous child
 *   - customers ( ... )                         ← anonymous + whitespace
 *
 * Safe forms (NOT flagged) - "!" between "customers" and "(":
 *   - customer:customers!<table>_customer_id_fkey(...)
 *   - customers!<table>_customer_id_fkey(...)
 *
 * Other parent tables (projects, customer_tasks, messages, etc.) are
 * never flagged regardless of embed form.
 *
 * Exit 0 on no violations, exit 1 with file:line list + suggested fix.
 * Uses only Node stdlib.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(process.cwd(), 'src')

// Tables whose customer embeds need disambiguation.
const GUARDED_PARENTS = [
  { table: 'offers', fk: 'offers_customer_id_fkey' },
  { table: 'invoices', fk: 'invoices_customer_id_fkey' },
]
const GUARDED_TABLE_NAMES = new Set(GUARDED_PARENTS.map((g) => g.table))

const violations = []
let filesScanned = 0

// Match `.from('<table>')` / `.from("<table>")` / `.from(`<table>`)` with optional whitespace.
const FROM_ANY = /\.from\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)/g

// Match AMBIGUOUS customer-embed forms. We use word-boundary \b so we
// don't match inside identifiers like `customers_special`. The character
// after `customers` is captured to verify it's NOT `!` (disambiguator).
//
// Captures:
//   - "customers" followed by optional whitespace then "(" → ambiguous
//   - the safe form "customers!fk(" has `!` after `customers` and is
//     not matched by `customers\s*\(`.
const AMBIGUOUS = /\bcustomers\s*\(/g

function lineOf(content, index) {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++
  }
  return line
}

async function scanFile(filePath) {
  filesScanned++
  let content
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (err) {
    console.warn(`  warn: could not read ${filePath}: ${err.message}`)
    return
  }

  // Collect all .from(<table>) positions
  const fromPositions = []
  FROM_ANY.lastIndex = 0
  let fm
  while ((fm = FROM_ANY.exec(content)) !== null) {
    fromPositions.push({ index: fm.index, table: fm[1] })
  }

  // For each ambiguous embed, find nearest preceding .from()
  AMBIGUOUS.lastIndex = 0
  let am
  while ((am = AMBIGUOUS.exec(content)) !== null) {
    let nearest = null
    for (const fp of fromPositions) {
      if (fp.index < am.index) {
        if (!nearest || fp.index > nearest.index) nearest = fp
      } else {
        break
      }
    }
    if (nearest && GUARDED_TABLE_NAMES.has(nearest.table)) {
      const fk = GUARDED_PARENTS.find((g) => g.table === nearest.table).fk
      const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
      violations.push({
        file: rel,
        line: lineOf(content, am.index),
        parent: nearest.table,
        fk,
      })
    }
  }
}

async function walk(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walk(full)
    } else if (e.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      await scanFile(full)
    }
  }
}

await walk(ROOT)

const guardedList = GUARDED_PARENTS.map((g) => g.table).join('/')

if (violations.length === 0) {
  console.log(
    `check-offers-customer-embeds: OK - no ambiguous customer embeds on ${guardedList} parent (scanned ${filesScanned} files).`
  )
  process.exit(0)
}

console.error(
  `\ncheck-offers-customer-embeds: FAILED - found ${violations.length} ambiguous customers(...) embed(s) on guarded parent tables (${guardedList}).`
)
console.error(
  `  These will trigger PGRST201 in production (offers: 00118, invoices: 00119).`
)
console.error(`  Replace each ambiguous embed with the disambiguated form:\n`)
for (const v of violations) {
  console.error(
    `  ${v.file}:${v.line}    parent=${v.parent}    use: customers!${v.fk}(...)`
  )
}
console.error('')
process.exit(1)
