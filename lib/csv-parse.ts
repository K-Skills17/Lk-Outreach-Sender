/**
 * Simple CSV parser: first row = headers, then data rows.
 * Returns array of objects keyed by header (trimmed). Handles quoted fields.
 */
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

const PHONE_KEYS = ['phone', 'telefone', 'whatsapp', 'contact_phone', 'celular', 'fone'];
const NAME_KEYS = ['nome', 'name', 'contact_name', 'nome_contato'];
const BUSINESS_KEYS = ['empresa', 'business_name', 'company', 'negocio', 'clinica'];

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
  const phone = findColumn(row, PHONE_KEYS);
  const contact_name = findColumn(row, NAME_KEYS);
  const business_name = findColumn(row, BUSINESS_KEYS);
  const industry =
    findColumn(row, ['industry', 'setor', 'niche', 'categoria', 'segmento']) ?? null;
  const contact_email = findColumn(row, ['email', 'contact_email', 'e-mail']) ?? null;
  const summary = findColumn(row, ['summary', 'resumo', 'observacao', 'notes']) ?? null;
  const raw_payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== '') raw_payload[k.trim()] = v;
  }
  return {
    contact_phone: phone ?? null,
    contact_name: contact_name ?? null,
    business_name: business_name ?? null,
    industry,
    contact_email,
    summary,
    raw_payload,
  };
}
