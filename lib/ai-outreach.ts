import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openai) return openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  openai = new OpenAI({ apiKey: key });
  return openai;
}

export interface LeadForAI {
  contact_name?: string | null;
  business_name?: string | null;
  industry?: string | null;
  summary?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

const BASE_SYSTEM_PROMPT = `You are an expert at writing short, personalized outreach messages to dentists (Brazil, Portuguese).

Given scraped/enriched lead data and analysis about their business, write exactly 3 SHORT variations of an outreach message. Each variation must:
1. Start with what they are doing RIGHT (one specific positive).
2. Briefly mention 1–2 gaps where they might be leaking money or missing opportunity (without being negative).
3. Tease one clear benefit we can offer them.
4. End with a clear CTA: invite them to a 15–30 minute call to see if we're a good fit.

Rules for all 3:
- Maximum 120 words each. Concise, no fluff.
- Tone: professional, friendly, consultative. Not salesy.
- Portuguese (Brazil). Use "você", casual but respectful.
- No bullet lists; flowing prose.
- Do not invent data; use only what is provided.
- Make the 3 variations meaningfully different: e.g. different opening line, or slightly different angle on the gap/benefit, but same structure.

Output ONLY a valid JSON array of exactly 3 strings. No other text. Example: ["First message...", "Second message...", "Third message..."]`;

/**
 * Generate 3 outreach message variations from lead data. One is picked at send time.
 * @param userInstructions - Optional; appended to system prompt so the model follows your instructions.
 */
export async function generateOutreachMessages(
  lead: LeadForAI,
  userInstructions?: string | null
): Promise<string[]> {
  const systemContent =
    BASE_SYSTEM_PROMPT +
    (userInstructions?.trim()
      ? `\n\nAdditional instructions you MUST follow: ${userInstructions.trim()}`
      : '');
  const userContent = buildUserContent(lead);
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('AI returned empty');
  const parsed = parseThreeVariations(raw);
  if (parsed.length !== 3) throw new Error('AI did not return exactly 3 variations');
  return parsed;
}

function parseThreeVariations(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 3);
  } catch {
    const lines = raw.split('\n').map((s) => s.replace(/^[\d.]+\s*[-)]?\s*/, '').trim()).filter(Boolean);
    return lines.slice(0, 3);
  }
}

function buildUserContent(lead: LeadForAI): string {
  const parts: string[] = [];
  if (lead.contact_name) parts.push(`Nome do contato: ${lead.contact_name}`);
  if (lead.business_name) parts.push(`Nome do negócio/clínica: ${lead.business_name}`);
  if (lead.industry) parts.push(`Setor: ${lead.industry}`);
  if (lead.summary) parts.push(`Resumo/análise: ${lead.summary}`);
  if (lead.raw_payload && Object.keys(lead.raw_payload).length > 0) {
    parts.push('Dados brutos (use apenas o que fizer sentido):');
    parts.push(JSON.stringify(lead.raw_payload, null, 2));
  }
  return parts.length ? parts.join('\n\n') : 'Sem dados além do contato. Escreva 3 mensagens genéricas mas profissionais e distintas.';
}

/** Pick one message from stored value (JSON array of 3 or legacy single string). */
export function pickOneMessage(generatedMessage: string | null): string | null {
  if (!generatedMessage) return null;
  try {
    const arr = JSON.parse(generatedMessage) as unknown;
    if (Array.isArray(arr) && arr.length > 0) {
      const strings = arr.filter((x): x is string => typeof x === 'string');
      return strings[Math.floor(Math.random() * strings.length)] ?? strings[0] ?? null;
    }
  } catch {
    /* legacy: single message stored as plain text */
  }
  return generatedMessage;
}
