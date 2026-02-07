/**
 * Lead Gen Auto webhook payload: normalize to internal lead shape and validate.
 * Spec: nome, empresa, phone (E.164), email, enrichment_data, report_url, etc.
 */

export interface LeadGenItem {
  nome?: string | null;
  empresa?: string | null;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  niche?: string | null;
  campaign_name?: string | null;
  report_url?: string | null;
  analysis_image_url?: string | null;
  enrichment_data?: {
    lead?: { id?: string };
    reports?: { pain_points?: string; ai_email_intro?: string; ai_email_cta?: string; pdf_url?: string };
    analysis?: { pain_points?: string };
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
}

export interface NormalizedLead {
  external_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_name: string | null;
  industry: string | null;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
}

const E164_REG = /^\+[1-9]\d{1,14}$/;

export function normalizeLeadGenItem(item: LeadGenItem): NormalizedLead | null {
  const empresa = (item.empresa ?? '').toString().trim();
  const phone = (item.phone ?? '').toString().trim();
  const nome = (item.nome ?? '').toString().trim() || empresa;
  if (!empresa || !phone || !E164_REG.test(phone)) return null;

  const leadId = item.enrichment_data?.lead?.id;
  const external_id = typeof leadId === 'string' ? leadId : (leadId != null ? String(leadId) : null);
  const reports = item.enrichment_data?.reports ?? item.enrichment_data?.analysis;
  const painPoints = reports?.pain_points ?? (item.enrichment_data?.analysis as any)?.pain_points;
  const aiIntro = (reports as any)?.ai_email_intro;
  const aiCta = (reports as any)?.ai_email_cta;
  const summaryParts: string[] = [];
  if (painPoints) summaryParts.push(`Pontos de dor: ${typeof painPoints === 'string' ? painPoints : JSON.stringify(painPoints)}`);
  if (aiIntro) summaryParts.push(`Intro IA: ${aiIntro}`);
  if (aiCta) summaryParts.push(`CTA: ${aiCta}`);
  const summary = summaryParts.length ? summaryParts.join('\n\n') : null;

  return {
    external_id: external_id || null,
    contact_name: nome || null,
    contact_email: (item.email ?? '').toString().trim() || null,
    contact_phone: phone,
    business_name: empresa || null,
    industry: (item.niche ?? '').toString().trim() || null,
    summary,
    raw_payload: {
      ...item,
      report_url: item.report_url,
      analysis_image_url: item.analysis_image_url,
      campaign_name: item.campaign_name,
      enrichment_data: item.enrichment_data,
    } as Record<string, unknown>,
  };
}

export function validateNormalized(lead: NormalizedLead): string | null {
  if (!lead.business_name?.trim()) return 'empresa is required';
  if (!lead.contact_phone?.trim()) return 'phone is required';
  if (!E164_REG.test(lead.contact_phone)) return 'phone must be E.164 (e.g. +5511999999999)';
  if (!lead.contact_name?.trim()) lead.contact_name = lead.business_name;
  return null;
}
