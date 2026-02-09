import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerBySenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  send_id: z.string().uuid(),
  reply_text: z.string(),
  reply_at: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  const seller = await getSellerBySenderToken(request);
  if (!seller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { send_id, reply_text, reply_at } = bodySchema.parse(body);
    const at = reply_at || new Date().toISOString();

    const { data: sendRow, error: fetchErr } = await supabaseAdmin
      .from('sends')
      .select('id')
      .eq('id', send_id)
      .eq('assigned_to', seller.id)
      .single();
    if (fetchErr || !sendRow) {
      return NextResponse.json({ error: 'Send not found or forbidden' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('sends')
      .update({
        status: 'replied',
        reply_at: at,
        reply_text: reply_text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', send_id)
      .eq('assigned_to', seller.id);

    if (error) {
      console.error('[sender/reply]', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, send_id, status: 'replied' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
