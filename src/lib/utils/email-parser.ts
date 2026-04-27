/**
 * Email body parser — extracts customer information from email content.
 *
 * Designed for the scenario where a supplier (e.g. MikMa) sends an email
 * containing the actual customer's details in the body text.
 * The parser IGNORES the email sender and focuses on body content only.
 */

export interface ParsedCustomerData {
  name: string | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  postalCode: string | null
  city: string | null
}

/**
 * Parse email body to extract customer data.
 * Prioritizes labeled fields (Navn:, Adresse:, etc.) over heuristics.
 */
export function parseCustomerFromEmail(
  bodyText: string | null,
  bodyHtml: string | null,
  senderEmail?: string | null
): ParsedCustomerData {
  // Use plain text first, fall back to stripped HTML
  let text = bodyText || ''
  if (!text && bodyHtml) {
    text = stripHtml(bodyHtml)
  }
  // Also try HTML-stripped version if plain text is very short
  if (text.length < 50 && bodyHtml) {
    const htmlText = stripHtml(bodyHtml)
    if (htmlText.length > text.length) text = htmlText
  }

  if (!text) {
    return emptyResult()
  }

  // Step 1: Try labeled field extraction first (most reliable)
  const labeled = extractLabeledFields(text, senderEmail || null)

  // Step 2: Fill gaps with heuristic extraction
  const email = labeled.email || extractEmailHeuristic(text, senderEmail || null)
  const phone = labeled.phone || extractPhoneHeuristic(text)
  const name = labeled.name || extractNameHeuristic(text)
  const contactPerson = labeled.contactPerson || name
  const address = labeled.address
  const postalCode = labeled.postalCode
  const city = labeled.city

  // Step 3: If we got address from heuristics but not from labels
  let finalAddress = address
  let finalPostal = postalCode
  let finalCity = city
  if (!finalAddress && !finalPostal) {
    const addrResult = extractAddressHeuristic(text)
    finalAddress = addrResult.address
    finalPostal = addrResult.postalCode
    finalCity = addrResult.city
  }

  return {
    name,
    contactPerson,
    email,
    phone,
    address: finalAddress,
    postalCode: finalPostal,
    city: finalCity || city,
  }
}

function emptyResult(): ParsedCustomerData {
  return { name: null, contactPerson: null, email: null, phone: null, address: null, postalCode: null, city: null }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&aelig;/gi, 'æ')
    .replace(/&oslash;/gi, 'ø')
    .replace(/&aring;/gi, 'å')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// =====================================================
// LABELED FIELD EXTRACTION (highest priority)
// Handles: "Navn: Tina Larsen", "Adresse: Skovvej 12", etc.
// =====================================================

interface LabeledResult {
  name: string | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  postalCode: string | null
  city: string | null
}

// Regex that matches the start of ANY known label line — used to detect where a block ends
const LABEL_LINE_RE = /^(?:navn|kundenavn|kunde|kontaktperson|kontakt|bestiller|rekvirent|att\.?|attention|name|customer|beboer|ejer|lejer|e-?mail|email|mail|e-post|tlf\.?|tel\.?|telefon|phone|mobil|mob\.?|mobilnr\.?|telefonnr\.?|nr\.?|ring|adresse|adr\.?|installationsadresse|leveringsadresse|arbejdssted|projektadresse|address|by|city|postnr\.?(?:\s*(?:\/|og|&)\s*by)?|post|postnummer|oplysninger)\s*[:=]/i

// Section headers that contain customer data — parser will prioritize lines AFTER these
const SECTION_HEADER_RE = /^(?:oplysninger\s+p[åa]\s+kunden|kundeoplysninger|kunde\s*data|kundeinfo|customer\s*info)\s*:?\s*$/i

function extractLabeledFields(text: string, senderEmail: string | null): LabeledResult {
  const allLines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // If there's a "Oplysninger på kunden:" section, prioritize lines after it
  let lines = allLines
  const sectionIdx = allLines.findIndex((l) => SECTION_HEADER_RE.test(l))
  if (sectionIdx >= 0) {
    // Use lines after the section header — these are the customer data lines
    const sectionLines = allLines.slice(sectionIdx + 1)
    if (sectionLines.length > 0) {
      lines = sectionLines
    }
  }

  const result: LabeledResult = {
    name: null, contactPerson: null, email: null, phone: null,
    address: null, postalCode: null, city: null,
  }

  // Name patterns
  const namePatterns = [
    /^(?:navn|kundenavn|kunde|kontaktperson|kontakt|bestiller|rekvirent|att\.?|attention|name|customer)\s*[:=]\s*(.+)/i,
    /^(?:beboer|ejer|lejer)\s*[:=]\s*(.+)/i,
  ]

  // Email patterns
  const emailPatterns = [
    /^(?:e-?mail|email|mail|e-post)\s*[:=]\s*([\w.+-]+@[\w-]+\.[\w.-]+)/i,
  ]

  // Phone patterns
  const phonePatterns = [
    /^(?:tlf\.?|tel\.?|telefon|phone|mobil|mob\.?|mobilnr\.?|telefonnr\.?|nr\.?)\s*[:=]\s*(.+)/i,
    /^(?:ring)\s*[:=]\s*(.+)/i,
  ]

  // Address patterns — note: (.*) not (.+) so we also match "Adresse:" with nothing after the colon
  const addressPatterns = [
    /^(?:adresse|adr\.?|installationsadresse|leveringsadresse|arbejdssted|projektadresse|address)\s*[:=]\s*(.*)/i,
  ]

  // City/postal patterns
  const cityPatterns = [
    /^(?:by|city|postnr\.?(?:\s*(?:\/|og|&)\s*by)?|post)\s*[:=]\s*(.+)/i,
    /^(?:postnummer)\s*[:=]\s*(.+)/i,
  ]

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    // Name
    if (!result.name) {
      for (const pattern of namePatterns) {
        const match = line.match(pattern)
        if (match) {
          const val = match[1].trim()
          if (val.length > 1 && val.length < 80) {
            result.name = val
            result.contactPerson = val
          }
          break
        }
      }
    }

    // Email
    if (!result.email) {
      for (const pattern of emailPatterns) {
        const match = line.match(pattern)
        if (match) {
          const val = match[1].trim().toLowerCase()
          // Skip if it's the sender's email
          if (senderEmail && val === senderEmail.toLowerCase()) continue
          result.email = val
          break
        }
      }
      // Also check: line contains "mail" label and an email somewhere
      if (!result.email && /(?:e-?mail|mail)\s*[:=]/i.test(line)) {
        const emailInLine = line.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/)
        if (emailInLine) {
          const val = emailInLine[1].toLowerCase()
          if (!senderEmail || val !== senderEmail.toLowerCase()) {
            result.email = val
          }
        }
      }
    }

    // Phone
    if (!result.phone) {
      for (const pattern of phonePatterns) {
        const match = line.match(pattern)
        if (match) {
          const raw = match[1].trim()
          const cleaned = cleanPhoneNumber(raw)
          if (cleaned) result.phone = cleaned
          break
        }
      }
    }

    // Address — BLOCK-BASED: read from "Adresse:" until the next label or empty gap
    // Handles both "Adresse: Skovvej 12" (value on same line) and:
    //   Adresse:
    //   Olskervej 36
    //   4583, Sjællands Odde
    if (!result.address) {
      for (const pattern of addressPatterns) {
        const match = line.match(pattern)
        if (match) {
          // Collect the full address block: first line value + continuation lines
          const blockParts: string[] = []
          const firstLineVal = (match[1] || '').trim()
          if (firstLineVal) blockParts.push(firstLineVal)

          // Read continuation lines until we hit another label or run out
          for (let j = lineIdx + 1; j < lines.length; j++) {
            const nextLine = lines[j]
            // Stop if this line starts a new label
            if (LABEL_LINE_RE.test(nextLine)) break
            // Stop if line looks like a signature / greeting
            if (/^(?:venlig hilsen|med venlig hilsen|mvh|vh|best regards|hilsen)/i.test(nextLine)) break
            // Stop if line looks like a section header (e.g. "Oplysninger på kunden:")
            if (/^[A-ZÆØÅa-zæøå\s]+:$/.test(nextLine)) break
            // Stop after collecting enough (max 4 continuation lines)
            if (blockParts.length >= 4) break
            blockParts.push(nextLine)
          }

          if (blockParts.length > 0) {
            // Parse each part separately first to identify street vs postal/city
            const streetParts: string[] = []
            let foundPostal: string | null = null
            let foundCity: string | null = null

            for (const part of blockParts) {
              // Check if this part is a postal code + city line: "4583, Sjællands Odde" or "4583 Sjællands Odde"
              const postalCityMatch = part.match(/^(\d{4})[,\s]+\s*(.+)$/)
              if (postalCityMatch && !foundPostal) {
                foundPostal = postalCityMatch[1]
                foundCity = postalCityMatch[2].replace(/[,.\s]+$/, '').trim()
              } else if (/^\d{4}$/.test(part.trim()) && !foundPostal) {
                foundPostal = part.trim()
              } else {
                // This is a street/address part
                streetParts.push(part)
              }
            }

            if (streetParts.length > 0) {
              result.address = streetParts.join(', ').replace(/,\s*,/g, ',').replace(/[,\s]+$/, '').trim()
            }
            if (foundPostal) result.postalCode = foundPostal
            if (foundCity) result.city = foundCity

            // If we still haven't split postal from address, try parseFullAddressBlock as fallback
            if (result.address && !result.postalCode) {
              const fullBlock = blockParts.join(', ').replace(/,\s*,/g, ',').trim()
              const parsed = parseFullAddressBlock(fullBlock)
              if (parsed.postalCode) {
                result.address = parsed.address
                result.postalCode = parsed.postalCode
                result.city = parsed.city
              }
            }
          }
          break
        }
      }
    }

    // City/Postal
    if (!result.postalCode) {
      for (const pattern of cityPatterns) {
        const match = line.match(pattern)
        if (match) {
          const val = match[1].trim()
          const postalMatch = val.match(/^(\d{4})\s+(.+)/)
          if (postalMatch) {
            result.postalCode = postalMatch[1]
            result.city = postalMatch[2].trim()
          } else if (/^\d{4}$/.test(val)) {
            result.postalCode = val
          } else {
            result.city = val
          }
          break
        }
      }
    }
  }

  // If address was found but no postal/city, scan address text for embedded postal code
  if (result.address && !result.postalCode) {
    const embedded = result.address.match(/(\d{4})\s+([A-ZÆØÅa-zæøå].+?)$/)
    if (embedded) {
      result.postalCode = embedded[1]
      result.city = embedded[2].trim()
      // Remove postal+city from address string
      result.address = result.address.slice(0, result.address.indexOf(embedded[1])).replace(/[,\s]+$/, '').trim()
    }
  }

  return result
}

// =====================================================
// HEURISTIC EXTRACTION (fallback for unlabeled content)
// =====================================================

function extractEmailHeuristic(text: string, senderEmail: string | null): string | null {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g
  const allEmails = text.match(emailRegex) || []

  const senderDomain = senderEmail?.split('@')[1]?.toLowerCase()

  const filtered = allEmails.filter((e) => {
    const lower = e.toLowerCase()
    // Skip sender email
    if (senderEmail && lower === senderEmail.toLowerCase()) return false
    // Skip sender's domain emails (likely colleagues, not customers)
    if (senderDomain && lower.endsWith(`@${senderDomain}`)) return false
    // Skip system emails
    if (lower.includes('noreply') || lower.includes('no-reply')) return false
    if (lower.includes('mailer-daemon') || lower.includes('postmaster')) return false
    if (lower.endsWith('.png') || lower.endsWith('.jpg')) return false
    return true
  })

  return filtered[0] || null
}

function extractPhoneHeuristic(text: string): string | null {
  const patterns = [
    /(?:\+45|0045)\s*(\d{2})\s*(\d{2})\s*(\d{2})\s*(\d{2})/,
    /\b(\d{2})\s(\d{2})\s(\d{2})\s(\d{2})\b/,
    /\b(\d{2})-(\d{2})-(\d{2})-(\d{2})\b/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const digits = match.slice(1).join('')
      if (digits.length === 8 && digits[0] >= '2' && digits[0] <= '9') {
        return formatPhone(digits)
      }
    }
  }

  // Find 8-digit sequences
  const allDigits = [...text.matchAll(/\b(\d{8})\b/g)]
  for (const m of allDigits) {
    const d = m[1]
    if (d[0] >= '2' && d[0] <= '9') {
      // Make sure it's not a postal code (4 digits) or date-like
      return formatPhone(d)
    }
  }

  return null
}

function extractNameHeuristic(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Look for "Venlig hilsen" → next line is name
  for (let i = 0; i < lines.length; i++) {
    if (/^(?:venlig hilsen|med venlig hilsen|mvh|vh|best regards|regards|hilsen)/i.test(lines[i])) {
      const nextLine = lines[i + 1]
      if (nextLine && nextLine.length > 2 && nextLine.length < 60 &&
          !nextLine.includes('@') && !/^\d/.test(nextLine) &&
          !/^(?:tlf|tel|mob|www|http)/i.test(nextLine)) {
        return nextLine
      }
    }
  }

  return null
}

function extractAddressHeuristic(text: string): { address: string | null; postalCode: string | null; city: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Look for postal code pattern: 4 digits + city name
  for (let i = 0; i < lines.length; i++) {
    const postalMatch = lines[i].match(/\b(\d{4})\s+([A-ZÆØÅa-zæøå][a-zæøå]+(?:\s+[A-ZÆØÅa-zæøå][a-zæøå]+)*)\b/)
    if (postalMatch) {
      const postalCode = postalMatch[1]
      const city = postalMatch[2]
      const fullLine = lines[i]
      const beforePostal = fullLine.slice(0, fullLine.indexOf(postalCode)).replace(/[,\s]+$/, '').trim()

      // Street on same line as postal code
      if (beforePostal && /\d/.test(beforePostal) && beforePostal.length > 3) {
        return { address: beforePostal, postalCode, city }
      }

      // Street on the previous line
      if (i > 0) {
        const prevLine = lines[i - 1]
        if (prevLine.length > 3 && prevLine.length < 80 && /\d/.test(prevLine) && !prevLine.includes('@')) {
          return { address: prevLine.replace(/[,]+$/, '').trim(), postalCode, city }
        }
      }

      return { address: null, postalCode, city }
    }
  }

  // Look for Danish street names (with common suffixes)
  const streetSuffixes = 'vej|gade|allé|stræde|vænge|plads|torv|boulevard|park|alle|vangen|parken|haven|lunden|engen|marken|bakken|højen|ager|buen|svinget|stien'
  for (let i = 0; i < lines.length; i++) {
    const streetMatch = lines[i].match(new RegExp(`([A-ZÆØÅa-zæøå]+(?:${streetSuffixes})\\s+\\d+\\s*[A-Za-z]?(?:\\s*,?\\s*\\d{0,2}\\.?\\s*(?:sal|th|tv|mf|st|lejl\\.?)?)?)`, 'i'))
    if (streetMatch) {
      const street = streetMatch[1].trim()
      // Check if next line has postal code
      if (i + 1 < lines.length) {
        const nextPostal = lines[i + 1].match(/^(\d{4})\s+(.+)/)
        if (nextPostal) {
          return { address: street, postalCode: nextPostal[1], city: nextPostal[2].trim() }
        }
      }
      return { address: street, postalCode: null, city: null }
    }
  }

  return { address: null, postalCode: null, city: null }
}

// =====================================================
// HELPERS
// =====================================================

function cleanPhoneNumber(raw: string): string | null {
  // Remove everything except digits and +
  const digits = raw.replace(/[^\d]/g, '')

  // Handle +45 prefix
  let phone = digits
  if (phone.startsWith('45') && phone.length === 10) {
    phone = phone.slice(2)
  }
  if (phone.startsWith('0045') && phone.length === 12) {
    phone = phone.slice(4)
  }

  if (phone.length === 8 && phone[0] >= '2' && phone[0] <= '9') {
    return formatPhone(phone)
  }

  // Return raw if we can't clean it but it looks phone-like
  if (digits.length >= 8) {
    return raw.trim()
  }

  return null
}

function formatPhone(digits: string): string {
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`
}

/**
 * Parse a full address block that may contain street, number, floor, postal code and city.
 * Handles formats like:
 *   "Hovedgaden 1, 4100 Ringsted"
 *   "Skovvej 12, 2. th, 4000 Roskilde"
 *   "Hovedgaden 1, 4100 Ringsted" (already on one line)
 *   "Vestergade 44 B, 3. sal, 8000 Aarhus C"
 *   "4100 Ringsted" (postal only)
 */
function parseFullAddressBlock(text: string): { address: string | null; postalCode: string | null; city: string | null } {
  // Clean up: normalize multiple spaces, trim
  const cleaned = text.replace(/\s+/g, ' ').replace(/,\s*$/, '').trim()

  if (!cleaned) return { address: null, postalCode: null, city: null }

  // Pattern: anything ... 4-digit postal code ... city name
  // The postal code is ALWAYS 4 digits in Denmark, city follows (with optional comma)
  const postalCityMatch = cleaned.match(/^(.+?)[,\s]+(\d{4})[,\s]+(.+)$/)
  if (postalCityMatch) {
    const streetPart = postalCityMatch[1].replace(/[,\s]+$/, '').trim()
    const postalCode = postalCityMatch[2]
    const city = postalCityMatch[3].replace(/[,.\s]+$/, '').trim()
    return {
      address: streetPart || null,
      postalCode,
      city: city || null,
    }
  }

  // "4000 Roskilde" or "4000, Roskilde" alone (no street)
  const postalOnly = cleaned.match(/^(\d{4})[,\s]+(.+)$/)
  if (postalOnly) {
    return { address: null, postalCode: postalOnly[1], city: postalOnly[2].replace(/[,.\s]+$/, '').trim() }
  }

  // Just a street address with no postal code
  return { address: cleaned, postalCode: null, city: null }
}
