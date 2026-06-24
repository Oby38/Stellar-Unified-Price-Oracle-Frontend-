// #117 — Runtime type checking
// Validates API responses at runtime without Zod (keeps bundle small).

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

type Schema = Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>

function validate(data: unknown, schema: Schema, prefix = ''): string[] {
  if (typeof data !== 'object' || data === null) return [`${prefix} must be an object`]
  const obj = data as Record<string, unknown>
  const errors: string[] = []
  for (const [key, type] of Object.entries(schema)) {
    const val = obj[key]
    const field = prefix ? `${prefix}.${key}` : key
    if (val === undefined || val === null) {
      errors.push(`${field} is missing or null`)
      continue
    }
    if (type === 'array' && !Array.isArray(val)) {
      errors.push(`${field} must be an array`)
    } else if (type !== 'array' && typeof val !== type) {
      errors.push(`${field} must be ${type}, got ${typeof val}`)
    }
  }
  return errors
}

const PRICE_DATA_SCHEMA: Schema = {
  assetPair: 'string',
  price: 'number',
  timestamp: 'number',
  confidence: 'number',
  sources: 'array',
}

const SOURCE_HEALTH_SCHEMA: Schema = {
  source: 'string',
  status: 'string',
}

export function validatePriceData(data: unknown): ValidationResult {
  const errors = validate(data, PRICE_DATA_SCHEMA)
  // Additional semantic checks
  if (errors.length === 0) {
    const d = data as { price: number; confidence: number; timestamp: number }
    if (d.price < 0) errors.push('price must be non-negative')
    if (d.confidence < 0 || d.confidence > 1) errors.push('confidence must be 0–1')
    if (d.timestamp > Date.now() + 60_000) errors.push('timestamp is in the future')
  }
  return { valid: errors.length === 0, errors }
}

export function validatePriceArray(data: unknown): ValidationResult {
  if (!Array.isArray(data)) return { valid: false, errors: ['response must be an array'] }
  const errors: string[] = []
  data.forEach((item, i) => {
    const r = validatePriceData(item)
    if (!r.valid) errors.push(...r.errors.map((e) => `[${i}] ${e}`))
  })
  return { valid: errors.length === 0, errors }
}

export function validateSourceHealth(data: unknown): ValidationResult {
  const errors = validate(data, SOURCE_HEALTH_SCHEMA)
  return { valid: errors.length === 0, errors }
}
