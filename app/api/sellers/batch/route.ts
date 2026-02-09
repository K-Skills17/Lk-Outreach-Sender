import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSellerFromRequest, generateSenderToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const sdrEntrySchema = z.object({
  email: z.string().email(),
  name: z.string().max(500).optional(),
  password: z.string().min(6),
});

const batchSchema = z.object({
  sdrs: z.array(sdrEntrySchema).min(1).max(100),
});

type BatchResult = {
  email: string;
  name: string | null;
  success: boolean;
  sender_token?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const body = await request.json();
    const { sdrs } = batchSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const results: BatchResult[] = [];

    for (const sdr of sdrs) {
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: sdr.email,
          password: sdr.password,
          email_confirm: true,
        });

        if (authError) {
          results.push({
            email: sdr.email,
            name: sdr.name ?? null,
            success: false,
            error: authError.message.includes('already registered')
              ? 'Email already registered'
              : authError.message,
          });
          continue;
        }

        const authUserId = authData.user?.id;
        if (!authUserId) {
          results.push({
            email: sdr.email,
            name: sdr.name ?? null,
            success: false,
            error: 'Failed to create auth user',
          });
          continue;
        }

        const senderToken = generateSenderToken();
        const { error: insertErr } = await supabase
          .from('sellers')
          .insert({
            auth_user_id: authUserId,
            email: sdr.email,
            name: sdr.name ?? null,
            role: 'sdr',
            sender_token: senderToken,
          });

        if (insertErr) {
          results.push({
            email: sdr.email,
            name: sdr.name ?? null,
            success: false,
            error: 'Database error: ' + insertErr.message,
          });
          continue;
        }

        results.push({
          email: sdr.email,
          name: sdr.name ?? null,
          success: true,
          sender_token: senderToken,
        });
      } catch (err) {
        results.push({
          email: sdr.email,
          name: sdr.name ?? null,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const created = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ created, failed, results });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid body', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
