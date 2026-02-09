import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/** Create first admin (no sellers exist). Called from /setup page. */
export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Missing Supabase config';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { count, error: countError } = await supabase.from('sellers').select('id', { count: 'exact', head: true });
  if (countError) {
    console.error('[setup] count sellers', countError);
    return NextResponse.json({
      error: 'Database error: could not read sellers. Run migration 004_sellers_and_assignment.sql in Supabase.',
      details: countError.message,
    }, { status: 500 });
  }
  if (count != null && count > 0) {
    return NextResponse.json({ error: 'Setup already completed. Use the login page.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { email, password } = bodySchema.parse(body);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      console.error('[setup] createUser', authError);
      let message = authError.message;
      if (message.includes('already been registered') || message.includes('already exists')) {
        message = 'This email is already registered. Go to the login page, or use a different email.';
      }
      if (message.toLowerCase().includes('signup') && message.toLowerCase().includes('disabled')) {
        message = 'Signups are disabled in Supabase. In Dashboard → Authentication → Providers → Email, enable "Confirm email" and ensure signups are allowed.';
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const authUserId = authData.user?.id;
    if (!authUserId) return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });

    const { error: insertErr } = await supabase.from('sellers').insert({
      auth_user_id: authUserId,
      email,
      name: null,
      role: 'admin',
      sender_token: null,
    });
    if (insertErr) {
      console.error('[setup] insert', insertErr);
      let message = insertErr.message;
      if (insertErr.code === '23505') {
        message = 'This email is already in use. Try logging in instead.';
      }
      return NextResponse.json({ error: message, details: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Admin created. Please log in.' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      const msg = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid email or password';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Check if setup is needed (no sellers). */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase.from('sellers').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('[setup] GET count', error);
      return NextResponse.json(
        { setupNeeded: false, error: error.message },
        { status: 200 }
      );
    }
    return NextResponse.json({ setupNeeded: count === 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Config error';
    return NextResponse.json({ setupNeeded: false, error: msg }, { status: 200 });
  }
}
