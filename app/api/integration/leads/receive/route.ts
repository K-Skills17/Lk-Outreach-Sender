import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateOutreachMessages, pickOneMessage } from '@/lib/ai-outreach';
import {
  type LeadGenItem,
  normalizeLeadGenItem,
  validateNormalized,
} from '@/lib/lead-gen-payload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireIntegrationToken(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const token =
    process.env.LEAD_GEN_INTEGRATION_TOKEN ||
    process.env.LEAD_GEN_API_TOKEN;
  if (!token) return false;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === token.trim();
}

export async function POST(request: NextRequest) {
  if (!requireIntegrationToken(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const items: LeadGenItem[] = Array.isArray(body) ? body : [body as LeadGenItem];
  const errors: { index: number; message: string }[] = [];
  let created = 0;

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const normalized = normalizeLeadGenItem(raw as LeadGenItem);
    if (!normalized) {
      errors.push({ index: i, message: 'Missing or invalid empresa/phone (E.164 required)' });
      continue;
    }
    const validationError = validateNormalized(normalized);
    if (validationError) {
      errors.push({ index: i, message: validationError });
      continue;
    }

    const externalId = normalized.external_id;
    const phone = normalized.contact_phone;

    if (externalId) {
      const { data: existingByExternal } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('external_id', externalId)
        .limit(1)
        .maybeSingle();
      if (existingByExternal) {
        errors.push({ index: i, message: 'Lead already exists (external_id)' });
        continue;
      }
    }
    const { data: existingByPhone } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('contact_phone', phone)
      .limit(1)
      .maybeSingle();
    if (existingByPhone) {
      errors.push({ index: i, message: 'Lead already exists (phone)' });
      continue;
    }

    const leadRow = {
      external_id: normalized.external_id,
      contact_name: normalized.contact_name,
      contact_email: normalized.contact_email,
      contact_phone: normalized.contact_phone,
      business_name: normalized.business_name,
      industry: normalized.industry,
      summary: normalized.summary,
      raw_payload: normalized.raw_payload,
      generated_message: null as string | null,
    };

    const { data: lead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert(leadRow)
      .select()
      .single();

    if (insertError || !lead) {
      errors.push({ index: i, message: insertError?.message ?? 'Failed to create lead' });
      continue;
    }

    let variations: string[] = [];
    try {
      variations = await generateOutreachMessages({
        contact_name: lead.contact_name,
        business_name: lead.business_name,
        industry: lead.industry,
        summary: lead.summary,
        raw_payload: lead.raw_payload as Record<string, unknown> | null,
      });
      await supabaseAdmin
        .from('leads')
        .update({
          generated_message: JSON.stringify(variations),
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);
    } catch (aiErr) {
      errors.push({
        index: i,
        message: aiErr instanceof Error ? aiErr.message : 'AI message generation failed',
      });
      continue;
    }

    const messageToSend = pickOneMessage(JSON.stringify(variations))!;
    await supabaseAdmin.from('sends').insert({
      lead_id: lead.id,
      channel: 'whatsapp',
      message_text: messageToSend,
      status: 'pending',
    });
    created++;
  }

  return NextResponse.json({
    success: true,
    message: 'Lead(s) received',
    processed: items.length,
    created,
    errors,
  });
}
