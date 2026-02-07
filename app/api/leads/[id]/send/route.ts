import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pickOneMessage } from '@/lib/ai-outreach';
import { sendOutreachEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireLeadGenToken(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const token = process.env.LEAD_GEN_API_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

const bodySchema = z.object({ send_email: z.boolean().optional().default(false) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireLeadGenToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: leadId } = await params;
  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const message = pickOneMessage(lead.generated_message);
  if (!message) {
    return NextResponse.json(
      { error: 'No generated messages. Call POST /api/leads/[id]/generate first.' },
      { status: 400 }
    );
  }

  const { data: existingSends } = await supabaseAdmin
    .from('sends')
    .select('id, channel, status')
    .eq('lead_id', leadId);

  const hasEmail = existingSends?.some((s) => s.channel === 'email');
  const hasWhatsapp = existingSends?.some((s) => s.channel === 'whatsapp');

  if (!hasWhatsapp) {
    await supabaseAdmin.from('sends').insert({
      lead_id: leadId,
      channel: 'whatsapp',
      message_text: message,
      status: 'pending',
    });
  }

  let emailResult: { id?: string; error?: unknown } | null = null;
  const body = await request.json().catch(() => ({}));
  const { send_email } = bodySchema.parse(body);
  if (send_email && !hasEmail && lead.contact_email) {
    const subject = process.env.OUTREACH_EMAIL_SUBJECT || 'Uma oportunidade para sua clínica';
    emailResult = await sendOutreachEmail(lead.contact_email, subject, message);
    await supabaseAdmin.from('sends').insert({
      lead_id: leadId,
      channel: 'email',
      message_text: message,
      status: emailResult.error ? 'failed' : 'sent',
      sent_at: emailResult.error ? null : new Date().toISOString(),
      error_message: emailResult.error ? String(emailResult.error) : null,
    });
  }

  return NextResponse.json({
    lead_id: leadId,
    whatsapp: hasWhatsapp ? 'already_queued' : 'queued',
    email: send_email
      ? (hasEmail ? 'already_sent' : (emailResult?.error ? { error: String(emailResult.error) } : { sent: true, id: emailResult?.id }))
      : 'skipped',
  });
}
