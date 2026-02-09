import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerBySenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  send_id: z.string().uuid(),
  error_message: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const seller = await getSellerBySenderToken(request);
  if (!seller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = seller.role === 'admin';

  try {
    const body = await request.json();
    const { send_id, error_message } = bodySchema.parse(body);

    const supabase = getSupabaseAdmin();

    const { data: sendRow, error: fetchErr } = await supabase
      .from('sends')
      .select('id, assigned_to')
      .eq('id', send_id)
      .single();
    if (fetchErr || !sendRow) {
      return NextResponse.json({ error: 'Send not found' }, { status: 404 });
    }
    // Admin token can mark any message; SDR token can only mark their own
    if (!isAdmin && sendRow.assigned_to !== seller.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('sends')
      .update({
        status: 'failed',
        error_message: error_message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', send_id);

    if (error) {
      console.error('[sender/mark-failed]', error);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, send_id, status: 'failed' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
