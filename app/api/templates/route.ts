import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().min(1).max(500),
  body: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('id, name, body, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[templates] GET', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const raw = await request.json();
    const { name, body } = createSchema.parse(raw);
    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({ name, body })
      .select('id, name, body, created_at, updated_at')
      .single();
    if (error) {
      console.error('[templates] POST', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
