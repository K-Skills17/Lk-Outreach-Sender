import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerBySenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  send_id: z.string().uuid(),
  sent_at: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  const seller = await getSellerBySenderToken(request);
  if (!seller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = seller.role === 'admin';

  try {
    const body = await request.json();
    const { send_id, sent_at } = bodySchema.parse(body);
    const at = sent_at || new Date().toISOString();

    const supabase = getSupabaseAdmin();

    const { data: sendRow, error: fetchErr } = await supabase
      .from('sends')
      .select('lead_id, assigned_to')
      .eq('id', send_id)
      .single();
    if (fetchErr || !sendRow?.lead_id) {
      return NextResponse.json({ error: 'Send not found' }, { status: 404 });
    }
    // Admin token can mark any message; SDR token can only mark their own
    if (!isAdmin && sendRow.assigned_to !== seller.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('sends')
      .update({
        status: 'sent',
        sent_at: at,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', send_id);

    if (error) {
      console.error('[sender/mark-sent]', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    await supabase
      .from('leads')
      .update({ last_contacted_at: at, updated_at: new Date().toISOString() })
      .eq('id', sendRow.lead_id);

    return NextResponse.json({ success: true, send_id, status: 'sent' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
