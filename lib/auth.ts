import { NextRequest } from 'next/server';
import { createClientFromRequest } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { randomBytes } from 'crypto';

export type Seller = {
  id: string;
  role: 'admin' | 'sdr';
  email: string;
  name: string | null;
};

/** Resolve current seller from session (cookie). Returns null if not logged in or no seller row. */
export async function getSellerFromRequest(request: NextRequest): Promise<Seller | null> {
  const supabase = createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const { data: seller } = await getSupabaseAdmin()
    .from('sellers')
    .select('id, role, email, name')
    .eq('auth_user_id', user.id)
    .single();

  if (!seller || !seller.role) return null;
  return {
    id: seller.id,
    role: seller.role as 'admin' | 'sdr',
    email: seller.email,
    name: seller.name ?? null,
  };
}

/** Resolve seller from Authorization: Bearer <sender_token>. Used by Python sender. */
export async function getSellerBySenderToken(request: NextRequest): Promise<{ id: string; role: 'admin' | 'sdr' } | null> {
  const auth = request.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return null;

  const { data } = await getSupabaseAdmin()
    .from('sellers')
    .select('id, role')
    .eq('sender_token', token)
    .maybeSingle();

  return data ? { id: data.id, role: data.role as 'admin' | 'sdr' } : null;
}

/** Generate a new sender token (hex string). */
export function generateSenderToken(): string {
  return randomBytes(32).toString('hex');
}
