import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSellerFromRequest } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { generateSenderToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const updateSchema = z.object({
  name: z.string().max(500).optional(),
  password: z.string().min(6).optional(),
  regenerateToken: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSellerFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    if (Object.keys(parsed).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: target } = await supabase
      .from('sellers')
      .select('id, auth_user_id, role')
      .eq('id', id)
      .single();
    if (!target) return NextResponse.json({ error: 'Seller not found' }, { status: 404 });

    if (parsed.password != null) {
      const { error: pwErr } = await supabase.auth.admin.updateUserById(target.auth_user_id, {
        password: parsed.password,
      });
      if (pwErr) {
        console.error('[sellers] updateUserById', pwErr);
        return NextResponse.json({ error: pwErr.message }, { status: 400 });
      }
    }

    const updates: { name?: string; sender_token?: string; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.regenerateToken) updates.sender_token = generateSenderToken();

    const { data: updated, error } = await supabase
      .from('sellers')
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, created_at')
      .single();
    if (error) {
      console.error('[sellers] PATCH', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const res: Record<string, unknown> = { ...updated };
    if (parsed.regenerateToken && updates.sender_token) {
      res.sender_token = updates.sender_token;
    }
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
