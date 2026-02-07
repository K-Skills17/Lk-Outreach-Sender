import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health
 * Returns 200 if the app and DB are reachable. Used by monitors and load balancers.
 */
export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from('leads').select('id').limit(1);
    const dbOk = !error;
    return NextResponse.json(
      { ok: true, db: dbOk ? 'ok' : 'error', ts: new Date().toISOString() },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: 'error', ts: new Date().toISOString() },
      { status: 503 }
    );
  }
}
