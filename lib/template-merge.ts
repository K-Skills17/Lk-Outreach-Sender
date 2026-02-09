/**
 * Merge a template string containing {{placeholder}} with lead/row data.
 * Placeholders map to lead fields or raw_payload keys (e.g. {{nome}}, {{empresa}}, {{phone}}).
 */

export interface LeadForMerge {
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  business_name?: string | null;
  industry?: string | null;
  summary?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

const FIELD_MAP: Record<string, keyof LeadForMerge> = {
  nome: 'contact_name',
  name: 'contact_name',
  contact_name: 'contact_name',
  phone: 'contact_phone',
  telefone: 'contact_phone',
  contact_phone: 'contact_phone',
  whatsapp: 'contact_phone',
  email: 'contact_email',
  contact_email: 'contact_email',
  empresa: 'business_name',
  business_name: 'business_name',
  negocio: 'business_name',
  industry: 'industry',
  niche: 'industry',
  setor: 'industry',
  summary: 'summary',
  resumo: 'summary',
};

function getValue(lead: LeadForMerge, key: string): string {
  const normalized = key.trim().toLowerCase();
  const field = FIELD_MAP[normalized];
  if (field && field in lead) {
    const v = lead[field];
    if (v != null && typeof v === 'string') return v;
  }
  if (lead.raw_payload && typeof lead.raw_payload[key] === 'string') {
    return lead.raw_payload[key] as string;
  }
  if (lead.raw_payload && lead.raw_payload[normalized] != null) {
    return String(lead.raw_payload[normalized]);
  }
  return '';
}

/**
 * Replace {{placeholder}} in template with values from lead. Unknown placeholders become empty string.
 */
export function mergeTemplate(template: string, lead: LeadForMerge): string {
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => getValue(lead, key));
}
