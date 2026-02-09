/**
 * Data cleaning utilities for leads ingested from Google Maps scrapers and other sources.
 * Normalizes phones, names, emails, business names, and strips scraping artifacts.
 */

// ── Phone normalization ──────────────────────────────────────────────────────

/**
 * Strip all non-digit characters and normalize to E.164-ish format for Brazil.
 * - Removes spaces, dashes, parens, dots, plus signs
 * - Adds country code 55 for 10/11 digit local numbers
 * - Returns digits-only string, or empty string if invalid
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  // Strip everything except digits
  let digits = raw.replace(/\D/g, '');
  // Remove leading zeros that some scrapers add
  digits = digits.replace(/^0+/, '');
  // Brazilian local numbers: 10 digits (landline) or 11 digits (mobile)
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }
  // If starts with 55 and has 12-13 total digits, it's a valid Brazilian number
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // International numbers: accept if 10+ digits
  if (digits.length >= 10) {
    return digits;
  }
  return '';
}

/**
 * Format a normalized phone for display: +55 (11) 99999-9999
 */
export function formatPhoneDisplay(normalized: string): string {
  if (!normalized || normalized.length < 10) return normalized;
  if (normalized.startsWith('55') && (normalized.length === 12 || normalized.length === 13)) {
    const ddd = normalized.slice(2, 4);
    const rest = normalized.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return '+' + normalized;
}

// ── Text cleaning ────────────────────────────────────────────────────────────

/**
 * Clean a text field: trim, collapse whitespace, decode HTML entities,
 * remove zero-width characters and other scraping artifacts.
 */
export function cleanText(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw);
  // Decode common HTML entities
  s = s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#\d+;/g, '');
  // Remove zero-width chars, BOM, and control characters (except newline/tab)
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F]/g, '');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  // Collapse multiple whitespace into single space
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ── Name cleaning ────────────────────────────────────────────────────────────

/**
 * Clean and normalize a person's name.
 * - Title case
 * - Remove titles/prefixes like "Dr.", "Dra."
 * - Strip numbers and special chars that shouldn't be in names
 */
export function cleanName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw);
  // Remove common titles/prefixes
  s = s.replace(/^(dr\.?|dra\.?|prof\.?|sr\.?|sra\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '');
  // Remove anything that's clearly not a name (numbers, URLs, emails)
  if (/^https?:\/\//i.test(s) || /@/.test(s)) return '';
  // Strip digits and special chars not typical in names
  s = s.replace(/[0-9]/g, '').replace(/[^\p{L}\s'-]/gu, '').trim();
  if (!s) return '';
  // Title case
  s = s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      // Keep short prepositions lowercase (Portuguese)
      if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
  return s;
}

// ── Business name cleaning ───────────────────────────────────────────────────

/**
 * Clean a business/clinic name from Google Maps scraping.
 * - Trim, decode entities
 * - Remove trailing location info in parens if it looks like an address
 * - Remove "- Google Maps" suffix that some scrapers leave
 */
export function cleanBusinessName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw);
  // Remove "- Google Maps" or "| Google Maps" suffixes
  s = s.replace(/\s*[-|]\s*Google\s*Maps\s*$/i, '');
  // Remove trailing parenthesized address-like content: "(Rua ..., 123 - Bairro)"
  s = s.replace(/\s*\((?:[^)]*(?:rua|av\.|avenida|alameda|travessa|rodovia|estr\.|estrada|praça)[^)]*)\)\s*$/i, '');
  // Remove trailing " - City, State" patterns
  s = s.replace(/\s*-\s*[A-Z][a-zA-Zà-ü\s]+,\s*[A-Z]{2}\s*$/, '');
  s = s.trim();
  return s;
}

// ── Email cleaning ───────────────────────────────────────────────────────────

/**
 * Clean and validate an email address.
 * Returns cleaned email or empty string if invalid.
 */
export function cleanEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw).toLowerCase();
  // Remove mailto: prefix
  s = s.replace(/^mailto:/i, '');
  // Remove surrounding angle brackets or quotes
  s = s.replace(/^[<"'\s]+|[>"'\s]+$/g, '');
  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return '';
  // Reject clearly fake/placeholder emails
  if (/^(test|example|noreply|no-reply|admin|info)@(example|test)\./i.test(s)) return '';
  return s;
}

// ── URL cleaning ─────────────────────────────────────────────────────────────

/**
 * Clean a URL from Google Maps scraping data.
 */
export function cleanUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw);
  // Remove tracking params from Google redirect URLs
  const googleRedirect = s.match(/url\?q=([^&]+)/);
  if (googleRedirect) {
    try {
      s = decodeURIComponent(googleRedirect[1]);
    } catch { /* keep as-is */ }
  }
  // Ensure it looks like a URL
  if (!/^https?:\/\//i.test(s)) {
    if (/^www\./i.test(s)) s = 'https://' + s;
    else return '';
  }
  return s;
}

// ── Address cleaning ─────────────────────────────────────────────────────────

/**
 * Clean an address string from Google Maps.
 */
export function cleanAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw);
  // Remove leading "Endereço:" or "Address:" labels
  s = s.replace(/^(endereço|address|local|localização)\s*:\s*/i, '');
  return s;
}

// ── Rating / Reviews cleaning ────────────────────────────────────────────────

/**
 * Extract a numeric rating (0-5) from a scraped string like "4.5", "4,5 estrelas", etc.
 */
export function cleanRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = cleanText(raw).replace(',', '.');
  const match = s.match(/(\d+\.?\d*)/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Extract a review count from strings like "123 reviews", "(45)", "1.234 avaliações"
 */
export function cleanReviewCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = cleanText(raw).replace(/\./g, '').replace(/,/g, '');
  const match = s.match(/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n < 0 || n > 1_000_000) return null;
  return n;
}

// ── Industry / Category cleaning ─────────────────────────────────────────────

/**
 * Clean a category/industry string from Google Maps.
 */
export function cleanCategory(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = cleanText(raw);
  // Remove leading "Categoria:" labels
  s = s.replace(/^(categoria|category|tipo|type)\s*:\s*/i, '');
  // Trim trailing dots
  s = s.replace(/\.+$/, '').trim();
  return s;
}

// ── Composite: clean all fields in a raw_payload ─────────────────────────────

/** Keys commonly found in Google Maps scraper output */
const GOOGLE_MAPS_PHONE_KEYS = [
  'phone', 'telefone', 'whatsapp', 'contact_phone', 'celular', 'fone',
  'phone_number', 'telephone', 'tel', 'mobile',
];
const GOOGLE_MAPS_NAME_KEYS = [
  'nome', 'name', 'contact_name', 'nome_contato', 'owner', 'proprietario',
  'contact', 'contato',
];
const GOOGLE_MAPS_BUSINESS_KEYS = [
  'empresa', 'business_name', 'company', 'negocio', 'clinica',
  'title', 'nome_empresa', 'place_name', 'establishment', 'business',
  'nome_fantasia', 'razao_social', 'store_name',
];
const GOOGLE_MAPS_EMAIL_KEYS = [
  'email', 'contact_email', 'e-mail', 'mail', 'email_address',
];
const GOOGLE_MAPS_INDUSTRY_KEYS = [
  'industry', 'setor', 'niche', 'categoria', 'segmento',
  'category', 'type', 'tipo', 'main_category', 'categories',
];
const GOOGLE_MAPS_ADDRESS_KEYS = [
  'address', 'endereco', 'endereço', 'full_address', 'street',
  'rua', 'logradouro', 'location',
];
const GOOGLE_MAPS_WEBSITE_KEYS = [
  'website', 'site', 'url', 'web', 'homepage', 'link',
];
const GOOGLE_MAPS_RATING_KEYS = [
  'rating', 'avaliacao', 'avaliação', 'nota', 'stars', 'estrelas',
  'total_score', 'score',
];
const GOOGLE_MAPS_REVIEWS_KEYS = [
  'reviews', 'reviews_count', 'review_count', 'avaliacoes',
  'num_reviews', 'total_reviews',
];
const GOOGLE_MAPS_SUMMARY_KEYS = [
  'summary', 'resumo', 'observacao', 'observação', 'notes', 'description',
  'descricao', 'descrição', 'about', 'sobre', 'bio',
];

export {
  GOOGLE_MAPS_PHONE_KEYS,
  GOOGLE_MAPS_NAME_KEYS,
  GOOGLE_MAPS_BUSINESS_KEYS,
  GOOGLE_MAPS_EMAIL_KEYS,
  GOOGLE_MAPS_INDUSTRY_KEYS,
  GOOGLE_MAPS_ADDRESS_KEYS,
  GOOGLE_MAPS_WEBSITE_KEYS,
  GOOGLE_MAPS_RATING_KEYS,
  GOOGLE_MAPS_REVIEWS_KEYS,
  GOOGLE_MAPS_SUMMARY_KEYS,
};

/**
 * Clean all values in a raw_payload object. Returns a new object with cleaned values.
 * Also removes keys with empty or useless values.
 */
export function cleanRawPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined || value === '') continue;
    const strVal = String(value);
    const trimmed = cleanText(strVal);
    if (!trimmed || trimmed === 'N/A' || trimmed === 'n/a' || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') continue;
    cleaned[key.trim()] = trimmed;
  }
  return cleaned;
}

// ── Duplicate detection helpers ──────────────────────────────────────────────

/**
 * Check if two phone numbers are the same after normalization.
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}
