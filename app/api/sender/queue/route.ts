import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSenderConfig } from '@/lib/sender-config';
import { getSellerBySenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const seller = await getSellerBySenderToken(request);
  if (!seller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
  const config = getSenderConfig();

  const { data: sends, error } = await supabaseAdmin
    .from('sends')
    .select('id, lead_id, message_text, created_at')
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
    .eq('assigned_to', seller.id)
    .order('created_at', { ascending: true })
    .limit(limit * 2);

  if (error) {
    console.error('[sender/queue]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!sends?.length) {
    return NextResponse.json({ config, pending: [] });
  }

  const leadIds = [...new Set(sends.map((s) => s.lead_id))];
  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, contact_phone, contact_name, business_name')
    .in('id', leadIds);
  const leadMap = new Map((leads || []).map((l) => [l.id, l]));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.recontact_skip_days);
  const cutoffIso = cutoff.toISOString();

  const { data: recentSends } = await supabaseAdmin
    .from('sends')
    .select('lead_id')
    .eq('channel', 'whatsapp')
    .eq('assigned_to', seller.id)
    .in('status', ['sent', 'replied'])
    .gte('sent_at', cutoffIso);
  const recentLeadIds = new Set((recentSends || []).map((r) => r.lead_id));
  const recentPhones = new Set(
    (leads || []).filter((l) => recentLeadIds.has(l.id) && l.contact_phone).map((l) => normalizePhone(l.contact_phone!))
  );

  const items: Array<{
    send_id: string;
    lead_id: string;
    phone: string | null;
    contact_name: string | null;
    business_name: string | null;
    message_text: string;
    created_at: string;
  }> = [];
  for (const s of sends) {
    const lead = leadMap.get(s.lead_id);
    const phone = lead?.contact_phone ?? null;
    if (!phone) continue;
    const normalized = normalizePhone(phone);
    if (recentPhones.has(normalized)) continue;
    items.push({
      send_id: s.id,
      lead_id: s.lead_id,
      phone,
      contact_name: lead?.contact_name ?? null,
      business_name: lead?.business_name ?? null,
      message_text: s.message_text,
      created_at: s.created_at,
    });
    if (items.length >= limit) break;
  }

  return NextResponse.json({ config, pending: items });
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}
