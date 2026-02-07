import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateOutreachMessages, pickOneMessage } from '@/lib/ai-outreach';
import { sendOutreachEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireLeadGenToken(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const token = process.env.LEAD_GEN_API_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}` || auth === `Bearer ${token.trim()}`;
}

const ingestSchema = z.object({
  external_id: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  business_name: z.string().optional(),
  industry: z.string().optional(),
  summary: z.string().optional(),
  raw_payload: z.record(z.unknown()).optional(),
  auto_send: z.boolean().optional().default(true),
  send_email: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  if (!requireLeadGenToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const data = ingestSchema.parse(body);

    const leadRow = {
      external_id: data.external_id ?? null,
      contact_name: data.contact_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      business_name: data.business_name ?? null,
      industry: data.industry ?? null,
      summary: data.summary ?? null,
      raw_payload: data.raw_payload ?? null,
      generated_message: null as string | null,
    };

    const { data: lead, error: insertError } = await supabaseAdmin
      .from('leads')
      .insert(leadRow)
      .select()
      .single();

    if (insertError || !lead) {
      console.error('[leads] insert error', insertError);
      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
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
      const stored = JSON.stringify(variations);
      await supabaseAdmin
        .from('leads')
        .update({ generated_message: stored, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
    } catch (aiErr) {
      console.error('[leads] AI generate error', aiErr);
      return NextResponse.json({
        lead_id: lead.id,
        error: 'Lead created but AI message generation failed',
        details: aiErr instanceof Error ? aiErr.message : String(aiErr),
      }, { status: 500 });
    }

    if (!data.auto_send) {
      return NextResponse.json({
        lead_id: lead.id,
        generated_messages: variations,
        whatsapp_queued: false,
      });
    }

    const messageToSend = pickOneMessage(JSON.stringify(variations))!;

    // WhatsApp only by default: queue for Python sender (mimics human, uses your WhatsApp)
    await supabaseAdmin.from('sends').insert({
      lead_id: lead.id,
      channel: 'whatsapp',
      message_text: messageToSend,
      status: 'pending',
    });

    let emailResult: { id?: string; error?: unknown } | null = null;
    if (data.send_email && lead.contact_email) {
      const subject = process.env.OUTREACH_EMAIL_SUBJECT || 'Uma oportunidade para sua clínica';
      emailResult = await sendOutreachEmail(lead.contact_email, subject, messageToSend);
      await supabaseAdmin.from('sends').insert({
        lead_id: lead.id,
        channel: 'email',
        message_text: messageToSend,
        status: emailResult.error ? 'failed' : 'sent',
        sent_at: emailResult.error ? null : new Date().toISOString(),
        error_message: emailResult.error ? String(emailResult.error) : null,
      });
    }

    return NextResponse.json({
      lead_id: lead.id,
      generated_messages: variations,
      whatsapp: 'queued',
      email: data.send_email
        ? (emailResult?.error ? { error: String(emailResult.error) } : { sent: true, id: emailResult?.id })
        : 'skipped',
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: e.issues }, { status: 400 });
    }
    console.error('[leads] error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
