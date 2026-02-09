import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerFromRequest } from '@/lib/auth';
import { generateOutreachMessages } from '@/lib/ai-outreach';
import { mergeTemplate, type LeadForMerge } from '@/lib/template-merge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1),
  mode: z.enum(['template', 'ai']),
  templateId: z.string().uuid().optional(),
  instructions: z.string().optional(),
  assignedTo: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await request.json();
    const { leadIds, mode, templateId, instructions, assignedTo } = bodySchema.parse(body);

    const { data: assignedSeller } = await supabaseAdmin
      .from('sellers')
      .select('id')
      .eq('id', assignedTo)
      .eq('role', 'sdr')
      .single();
    if (!assignedSeller) {
      return NextResponse.json({ error: 'assignedTo must be an existing SDR' }, { status: 400 });
    }

    if (mode === 'template' && !templateId) {
      return NextResponse.json({ error: 'templateId required when mode is template' }, { status: 400 });
    }

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, contact_name, contact_phone, contact_email, business_name, industry, summary, raw_payload')
      .in('id', leadIds);
    if (leadsError || !leads?.length) {
      return NextResponse.json({ error: 'Leads not found or database error' }, { status: 400 });
    }

    let templateBody: string | null = null;
    if (mode === 'template' && templateId) {
      const { data: t, error: tErr } = await supabaseAdmin
        .from('templates')
        .select('body')
        .eq('id', templateId)
        .single();
      if (tErr || !t?.body) {
        return NextResponse.json({ error: 'Template not found' }, { status: 400 });
      }
      templateBody = t.body;
    }

    const inserted: string[] = [];
    const errors: { leadId: string; message: string }[] = [];

    for (const lead of leads) {
      if (!lead.contact_phone?.trim()) {
        errors.push({ leadId: lead.id, message: 'Lead has no phone' });
        continue;
      }
      let messageText: string;
      if (mode === 'template' && templateBody) {
        messageText = mergeTemplate(templateBody, lead as LeadForMerge);
      } else {
        try {
          const variations = await generateOutreachMessages(
            {
              contact_name: lead.contact_name,
              business_name: lead.business_name,
              industry: lead.industry ?? undefined,
              summary: lead.summary ?? undefined,
              raw_payload: lead.raw_payload as Record<string, unknown> | null,
            },
            instructions ?? undefined
          );
          messageText = variations[Math.floor(Math.random() * variations.length)] ?? variations[0] ?? '';
        } catch (e) {
          errors.push({
            leadId: lead.id,
            message: e instanceof Error ? e.message : 'AI generation failed',
          });
          continue;
        }
      }
      if (!messageText?.trim()) {
        errors.push({ leadId: lead.id, message: 'Empty message' });
        continue;
      }
      const { data: send, error: insertErr } = await supabaseAdmin
        .from('sends')
        .insert({
          lead_id: lead.id,
          channel: 'whatsapp',
          message_text: messageText,
          status: 'pending',
          assigned_to: assignedTo,
        })
        .select('id')
        .single();
      if (insertErr) {
        errors.push({ leadId: lead.id, message: insertErr.message });
        continue;
      }
      if (send) inserted.push(send.id);
    }

    return NextResponse.json({
      queued: inserted.length,
      errors,
      sendIds: inserted,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    console.error('[send/queue]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
