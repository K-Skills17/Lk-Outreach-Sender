import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateOutreachMessages } from '@/lib/ai-outreach';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function requireLeadGenToken(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const token = process.env.LEAD_GEN_API_TOKEN;
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireLeadGenToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const { data: lead, error: fetchError } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  try {
    const variations = await generateOutreachMessages({
      contact_name: lead.contact_name,
      business_name: lead.business_name,
      industry: lead.industry,
      summary: lead.summary,
      raw_payload: lead.raw_payload as Record<string, unknown> | null,
    });
    const stored = JSON.stringify(variations);
    await supabaseAdmin
      .from('leads')
      .update({ generated_message: stored, updated_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ generated_messages: variations });
  } catch (e) {
    console.error('[leads generate]', e);
    return NextResponse.json(
      { error: 'AI generation failed', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
