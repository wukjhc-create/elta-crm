#!/usr/bin/env node
/**
 * Sprint 12C - CI guard against PGRST201 regression.
 *
 * Scans src/ for `customer:customers(...)` PostgREST embeds where the
 * nearest preceding `.from(...)` parent is `offers`. After migration
 * 00118 (Sprint 12A), offers has multiple FKs to customers, so the
 * undisambiguated embed triggers PGRST201 at runtime.
 *
 * Safe form (NOT flagged): customer:customers!offers_customer_id_fkey(...)
 * Other parent tables (projects, customer_tasks, messages, etc.) are
 * never flagged.
 *
 * Exit 0 on no violations, exit 1 with file:line list on violations.
 * Uses only Node stdlib.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(process.cwd(), 'src')
const violations = []
let filesScanned = 0

// Match `.from('<table>')` / `.from("<table>")` / `.from(`<table>`)` with optional whitespace.
const FROM_ANY = /\.from\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)/g

// Match the AMBIGUOUS form `customer:customers(`. The safe form
// `customer:customers!offers_customer_id_fkey(` has `!` after `customers`,
// so this regex auto-excludes it.
const AMBIGUOUS = /customer:customers\(/g

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

  const fromPositions = []
  FROM_ANY.lastIndex = 0
  let fm
  while ((fm = FROM_ANY.exec(content)) !== null) {
    fromPositions.push({ index: fm.index, table: fm[1] })
  }

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
    if (nearest && nearest.table === 'offers') {
      const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
      violations.push({ file: rel, line: lineOf(content, am.index) })
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

if (violations.length === 0) {
  console.log(
    `check-offers-customer-embeds: OK - no ambiguous customer embeds on .from('offers') parent (scanned ${filesScanned} files).`
  )
  process.exit(0)
}

console.error(
  `\ncheck-offers-customer-embeds: FAILED - found ${violations.length} ambiguous customer:customers(...) embed(s) on .from('offers') parent.`
)
console.error(
  `  These will trigger PGRST201 in production after migration 00118.`
)
console.error(
  `  Use customer:customers!offers_customer_id_fkey(...) instead.\n`
)
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`)
}
console.error('')
process.exit(1)
