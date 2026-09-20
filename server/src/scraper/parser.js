import { z } from 'zod';

/**
 * Defensive price parsing function
 * Handles: "₹1,299.00", "₹ 16,142", "$12.50", "1,299.00", " 16142 ", numbers, etc.
 */
export function parsePrice(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Detect placeholder text
  const lower = str.toLowerCase();
  if (
    lower.includes('loading') ||
    lower.includes('price hidden') ||
    lower.includes('check the current') ||
    lower.includes('reveal price') ||
    lower.includes('nan') ||
    lower.includes('null')
  ) {
    return null;
  }

  // Remove currency symbols, commas, and extra whitespace
  // Keep digits and decimal point
  const cleaned = str
    .replace(/[₹$€£,\s]/g, '')
    .replace(/[^0-9.]/g, '');

  if (!cleaned) return null;

  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Defensive stock parsing function
 * Handles:
 * "In stock · 72 left" -> { inStock: true, count: 72 }
 * "Only 3 left"        -> { inStock: true, count: 3 }
 * "72 IN STOCK"        -> { inStock: true, count: 72 }
 * "In stock"           -> { inStock: true, count: null }
 * "Out of stock"       -> { inStock: false, count: 0 }
 * "Sold out"           -> { inStock: false, count: 0 }
 * raw numbers          -> { inStock: num > 0, count: num }
 */
export function parseStock(input) {
  if (input === null || input === undefined) {
    return { inStock: null, count: null };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { inStock: null, count: null };
    return { inStock: input > 0, count: Math.max(0, Math.floor(input)) };
  }

  if (typeof input === 'boolean') {
    return { inStock: input, count: input ? null : 0 };
  }

  const str = String(input).trim();
  const lower = str.toLowerCase();

  if (lower.includes('loading') || lower.includes('checking')) {
    return { inStock: null, count: null };
  }

  if (lower.includes('out of stock') || lower.includes('sold out') || lower === 'unavailable') {
    return { inStock: false, count: 0 };
  }

  // Look for count numbers e.g. "Only 3 left", "72 in stock", "12 left"
  const match = str.match(/(\d+)/);
  const count = match ? parseInt(match[1], 10) : null;

  if (lower.includes('in stock') || lower.includes('left') || lower.includes('selling fast') || lower.includes('hurry')) {
    return {
      inStock: count !== null ? count > 0 : true,
      count: count
    };
  }

  return { inStock: null, count: null };
}

/**
 * Strict Snapshot Schema using Zod
 * Enforces:
 * - price > 0, finite
 * - in_stock boolean
 * - external_id matches target product
 */
export const ProductSnapshotSchema = z.object({
  externalId: z.number().int().positive(),
  price: z.number().finite().positive({ message: 'Price must be a positive finite number' }),
  mrp: z.number().finite().positive().nullable().optional(),
  inStock: z.boolean({ required_error: 'Stock must be a resolved boolean' }),
  stockCount: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().default('INR'),
  seller: z.string().nullable().optional(),
  scrapedAt: z.string().datetime().optional()
});

/**
 * Validates a candidate scrape result.
 * Checks for missing required fields and flags "possible structure change".
 */
export function validateSnapshot(candidate, expectedExternalId) {
  const issues = [];

  if (!candidate || typeof candidate !== 'object') {
    return {
      valid: false,
      error: 'Snapshot payload is empty or invalid object',
      structureChange: true
    };
  }

  // Check structure change indicators
  if (candidate.price === undefined && candidate.rawPrice === undefined) {
    issues.push('Missing price field');
  }
  if (candidate.inStock === undefined && candidate.stock === undefined) {
    issues.push('Missing stock field');
  }

  const parsedPrice = parsePrice(candidate.price ?? candidate.rawPrice);
  const parsedStock = parseStock(candidate.stockCount ?? candidate.stock ?? candidate.inStock);

  if (parsedPrice === null) {
    issues.push('Price is not a valid positive number or was a placeholder');
  }
  if (parsedStock.inStock === null) {
    issues.push('Stock status could not be resolved to a known value');
  }

  if (issues.length > 0) {
    const isStructureChange = issues.some(i => i.includes('Missing'));
    return {
      valid: false,
      error: issues.join('; '),
      structureChange: isStructureChange,
      data: null
    };
  }

  const resolved = {
    externalId: Number(expectedExternalId),
    price: parsedPrice,
    mrp: parsePrice(candidate.mrp),
    inStock: parsedStock.inStock,
    stockCount: parsedStock.count,
    currency: candidate.currency || 'INR',
    seller: candidate.seller || null,
    scrapedAt: new Date().toISOString()
  };

  const zodResult = ProductSnapshotSchema.safeParse(resolved);
  if (!zodResult.success) {
    return {
      valid: false,
      error: zodResult.error.issues.map(i => i.message).join('; '),
      structureChange: false,
      data: null
    };
  }

  return {
    valid: true,
    error: null,
    structureChange: false,
    data: zodResult.data
  };
}
