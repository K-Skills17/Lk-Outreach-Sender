import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireSenderToken(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const token = process.env.SENDER_SERVICE_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

const bodySchema = z.object({
  send_id: z.string().uuid(),
  sent_at: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  if (!requireSenderToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { send_id, sent_at } = bodySchema.parse(body);
    const at = sent_at || new Date().toISOString();

    const { error } = await supabaseAdmin
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
    return NextResponse.json({ success: true, send_id, status: 'sent' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
