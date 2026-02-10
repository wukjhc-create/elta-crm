/**
 * Encryption Utilities
 *
 * Secure encryption/decryption for sensitive data like API credentials.
 * Uses AES-256-GCM for authenticated encryption.
 *
 * IMPORTANT: The encryption key must be set in ENCRYPTION_KEY environment variable.
 * Generate with: openssl rand -base64 32
 */

// Note: This runs on the server only
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 128 // bits

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  return key
}

/**
 * Convert base64 key to CryptoKey
 */
async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBuffer = Buffer.from(keyBase64, 'base64')
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a string value
 * Returns: base64(iv + ciphertext + tag)
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey(getEncryptionKey())

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Encode plaintext
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    key,
    data
  )

  // Combine IV + ciphertext (GCM tag is appended to ciphertext)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return Buffer.from(combined).toString('base64')
}

/**
 * Decrypt an encrypted string
 * Input: base64(iv + ciphertext + tag)
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await importKey(getEncryptionKey())

  // Decode combined data
  const combined = Buffer.from(encryptedBase64, 'base64')

  // Extract IV and ciphertext
  const iv = combined.subarray(0, IV_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH)

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    key,
    ciphertext
  )

  // Decode plaintext
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Encrypt a JSON object (credentials)
 */
export async function encryptCredentials(credentials: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(credentials)
  return encrypt(json)
}

/**
 * Decrypt credentials JSON
 */
export async function decryptCredentials(encryptedBase64: string): Promise<Record<string, unknown>> {
  const json = await decrypt(encryptedBase64)
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Decrypted data is not a valid credentials object')
    }
    return parsed
  } catch (error) {
    throw new Error(`Credential decryption failed: ${error instanceof Error ? error.message : 'invalid JSON'}`)
  }
}

/**
 * Check if encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env.ENCRYPTION_KEY
}

/**
 * Generate a new encryption key (for setup)
 */
export function generateEncryptionKey(): string {
  const key = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(key).toString('base64')
}

/**
 * Mask sensitive values for logging (show first/last 2 chars)
 */
export function maskSensitive(value: string): string {
  if (!value || value.length < 6) return '****'
  return value.slice(0, 2) + '****' + value.slice(-2)
}
