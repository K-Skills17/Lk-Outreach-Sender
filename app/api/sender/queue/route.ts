import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSenderConfig } from '@/lib/sender-config';
import { getSellerBySenderToken } from '@/lib/auth';
import { normalizePhone } from '@/lib/data-cleaning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const seller = await getSellerBySenderToken(request);
  if (!seller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = seller.role === 'admin';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
  const config = getSenderConfig();
  const supabase = getSupabaseAdmin();

  // Build query: admin token gets ALL pending messages, SDR token gets only theirs
  let query = supabase
    .from('sends')
    .select('id, lead_id, message_text, assigned_to, created_at')
    .eq('channel', 'whatsapp')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit * 2);

  if (!isAdmin) {
    query = query.eq('assigned_to', seller.id);
  }

  const { data: sends, error } = await query;

  if (error) {
    console.error('[sender/queue]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!sends?.length) {
    return NextResponse.json({ config, pending: [] });
  }

  const leadIds = [...new Set(sends.map((s) => s.lead_id))];
  const { data: leads } = await supabase
    .from('leads')
    .select('id, contact_phone, contact_name, business_name')
    .in('id', leadIds);
  const leadMap = new Map((leads || []).map((l) => [l.id, l]));

  // Recontact filter: gather recently contacted phones per assigned SDR
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.recontact_skip_days);
  const cutoffIso = cutoff.toISOString();

  let recentQuery = supabase
    .from('sends')
    .select('lead_id, assigned_to')
    .eq('channel', 'whatsapp')
    .in('status', ['sent', 'replied'])
    .gte('sent_at', cutoffIso);

  if (!isAdmin) {
    recentQuery = recentQuery.eq('assigned_to', seller.id);
  }

  const { data: recentSends } = await recentQuery;

  // Build a set of "assignedTo:normalizedPhone" keys for recontact checking
  const recentKeys = new Set<string>();
  for (const r of recentSends || []) {
    const lead = leadMap.get(r.lead_id) || (leads || []).find((l) => l.id === r.lead_id);
    if (lead?.contact_phone) {
      const normalized = normalizePhone(lead.contact_phone);
      if (normalized) {
        recentKeys.add(`${r.assigned_to}:${normalized}`);
      }
    }
  }

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
    // Check recontact per the assigned SDR
    if (recentKeys.has(`${s.assigned_to}:${normalized}`)) continue;
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
