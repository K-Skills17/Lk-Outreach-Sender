import { NextRequest, NextResponse } from 'next/server';
import { getSellerFromRequest } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Returns current seller info; for SDRs includes sender_token. */
export async function GET(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (seller.role === 'sdr') {
    const { data: row } = await getSupabaseAdmin()
      .from('sellers')
      .select('sender_token')
      .eq('id', seller.id)
      .single();
    return NextResponse.json({
      id: seller.id,
      role: seller.role,
      email: seller.email,
      name: seller.name,
      sender_token: row?.sender_token ?? null,
    });
  }

  return NextResponse.json({
    id: seller.id,
    role: seller.role,
    email: seller.email,
    name: seller.name,
  });
}
