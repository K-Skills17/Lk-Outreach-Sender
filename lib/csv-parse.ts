/**
 * Simple CSV parser: first row = headers, then data rows.
 * Returns array of objects keyed by header (trimmed). Handles quoted fields.
 */

import {
  normalizePhone,
  cleanName,
  cleanBusinessName,
  cleanEmail,
  cleanCategory,
  cleanAddress,
  cleanUrl,
  cleanRating,
  cleanReviewCount,
  cleanText,
  cleanRawPayload,
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
} from './data-cleaning';

/** Maximum CSV file size in bytes (10 MB) */
export const MAX_CSV_SIZE = 10 * 1024 * 1024;

export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length < 2) return [];

  const headers = parseCSVLine(nonEmpty[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const values = parseCSVLine(nonEmpty[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const acc: string[] = [];
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            acc.push('"');
            end += 2;
          } else {
            end++;
            break;
          }
        } else {
          acc.push(line[end]);
          end++;
        }
      }
      out.push(acc.join('').trim());
      i = end;
      if (line[i] === ',') i++;
    } else {
      const comma = line.indexOf(',', i);
      const value = (comma === -1 ? line.slice(i) : line.slice(i, comma)).trim();
      out.push(value);
      i = comma === -1 ? line.length : comma + 1;
    }
  }
  return out;
}

export function findColumn(row: Record<string, string>, keys: string[]): string | null {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(row)) {
    lower[k.trim().toLowerCase()] = row[k];
  }
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

export function rowToLeadFields(row: Record<string, string>): {
  contact_phone: string | null;
  contact_name: string | null;
  business_name: string | null;
  industry: string | null;
  contact_email: string | null;
  summary: string | null;
  raw_payload: Record<string, unknown>;
} {
  // Extract raw values using expanded column key lists (supports Google Maps scrapers)
  const rawPhone = findColumn(row, GOOGLE_MAPS_PHONE_KEYS);
  const rawName = findColumn(row, GOOGLE_MAPS_NAME_KEYS);
  const rawBusiness = findColumn(row, GOOGLE_MAPS_BUSINESS_KEYS);
  const rawIndustry = findColumn(row, GOOGLE_MAPS_INDUSTRY_KEYS);
  const rawEmail = findColumn(row, GOOGLE_MAPS_EMAIL_KEYS);
  const rawSummary = findColumn(row, GOOGLE_MAPS_SUMMARY_KEYS);

  // Extract Google Maps specific fields for enriched raw_payload
  const rawAddress = findColumn(row, GOOGLE_MAPS_ADDRESS_KEYS);
  const rawWebsite = findColumn(row, GOOGLE_MAPS_WEBSITE_KEYS);
  const rawRating = findColumn(row, GOOGLE_MAPS_RATING_KEYS);
  const rawReviews = findColumn(row, GOOGLE_MAPS_REVIEWS_KEYS);

  // Apply data cleaning
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const contact_name = rawName ? cleanName(rawName) : null;
  const business_name = rawBusiness ? cleanBusinessName(rawBusiness) : null;
  const industry = rawIndustry ? cleanCategory(rawIndustry) : null;
  const contact_email = rawEmail ? cleanEmail(rawEmail) : null;
  const summary = rawSummary ? cleanText(rawSummary) : null;

  // Build raw_payload with all original columns, cleaned
  const raw_payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== '') raw_payload[k.trim()] = v;
  }

  // Enrich raw_payload with cleaned Google Maps fields
  if (rawAddress) raw_payload._cleaned_address = cleanAddress(rawAddress);
  if (rawWebsite) raw_payload._cleaned_website = cleanUrl(rawWebsite);
  if (rawRating) {
    const rating = cleanRating(rawRating);
    if (rating !== null) raw_payload._cleaned_rating = rating;
  }
  if (rawReviews) {
    const count = cleanReviewCount(rawReviews);
    if (count !== null) raw_payload._cleaned_reviews_count = count;
  }

  // Clean the entire raw_payload (remove empty/junk values)
  const cleanedPayload = cleanRawPayload(raw_payload);

  return {
    contact_phone: phone || null,
    contact_name: contact_name || null,
    business_name: business_name || null,
    industry: industry || null,
    contact_email: contact_email || null,
    summary: summary || null,
    raw_payload: cleanedPayload,
  };
}
