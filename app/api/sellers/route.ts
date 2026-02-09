import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSellerFromRequest } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().max(500).optional(),
  password: z.string().min(6),
});

export async function GET(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data, error } = await getSupabaseAdmin()
    .from('sellers')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[sellers] GET', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ sellers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await request.json();
    const { email, name, password } = createSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
      }
      console.error('[sellers] createUser', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
    const authUserId = authData.user?.id;
    if (!authUserId) return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });

    const senderToken = generateSenderToken();
    const { data: newSeller, error: insertErr } = await supabase
      .from('sellers')
      .insert({
        auth_user_id: authUserId,
        email,
        name: name ?? null,
        role: 'sdr',
        sender_token: senderToken,
      })
      .select('id, email, name, role, created_at')
      .single();
    if (insertErr) {
      console.error('[sellers] insert', insertErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    return NextResponse.json({
      ...newSeller,
      sender_token: senderToken,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
