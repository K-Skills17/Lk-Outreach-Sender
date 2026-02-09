import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * List leads for the queue-send UI. Optional: limit, not_contacted_days (only leads not contacted in X days).
 */
export async function GET(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '500', 10), 1000);
  const notContactedDays = request.nextUrl.searchParams.get('not_contacted_days');

  let query = supabaseAdmin
    .from('leads')
    .select('id, contact_name, contact_phone, business_name, last_contacted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (notContactedDays != null && notContactedDays !== '') {
    const days = parseInt(notContactedDays, 10);
    if (!Number.isNaN(days) && days >= 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff.toISOString()}`);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('[leads] GET', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ leads: data ?? [] });
}
