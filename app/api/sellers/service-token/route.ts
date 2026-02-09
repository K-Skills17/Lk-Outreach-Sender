import { NextRequest, NextResponse } from 'next/server';
import { getSellerFromRequest, generateSenderToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET: check if admin already has a service token. */
export async function GET(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data } = await getSupabaseAdmin()
    .from('sellers')
    .select('sender_token')
    .eq('id', seller.id)
    .single();

  return NextResponse.json({ has_token: !!data?.sender_token });
}

/** POST: generate (or regenerate) a service token for the admin. */
export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const token = generateSenderToken();
  const { error } = await getSupabaseAdmin()
    .from('sellers')
    .update({ sender_token: token, updated_at: new Date().toISOString() })
    .eq('id', seller.id);

  if (error) {
    console.error('[service-token] POST', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ sender_token: token });
}
