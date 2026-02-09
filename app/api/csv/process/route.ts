import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerFromRequest } from '@/lib/auth';
import { parseCSV, rowToLeadFields } from '@/lib/csv-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const seller = await getSellerFromRequest(request);
  if (!seller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (seller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing or invalid file' }, { status: 400 });
    }
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      return NextResponse.json({
        leads: [],
        errors: [{ row: 0, message: 'No data rows (need header + at least one row)' }],
      });
    }

    const leads: { id: string }[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fields = rowToLeadFields(row);
      if (!fields.contact_phone?.trim()) {
        errors.push({ row: i + 2, message: 'Missing phone (required column)' });
        continue;
      }

      const now = new Date().toISOString();
      const payload = {
        contact_name: fields.contact_name ?? null,
        contact_phone: fields.contact_phone,
        contact_email: fields.contact_email ?? null,
        business_name: fields.business_name ?? null,
        industry: fields.industry ?? null,
        summary: fields.summary ?? null,
        raw_payload: fields.raw_payload,
        updated_at: now,
      };

      const { data: existing } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('contact_phone', fields.contact_phone)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { data: updated, error } = await supabaseAdmin
          .from('leads')
          .update(payload)
          .eq('id', existing.id)
          .select('id')
          .single();
        if (error) {
          errors.push({ row: i + 2, message: error.message });
          continue;
        }
        if (updated) leads.push({ id: updated.id });
      } else {
        const { data: inserted, error } = await supabaseAdmin
          .from('leads')
          .insert({
            ...payload,
            created_at: now,
          })
          .select('id')
          .single();
        if (error) {
          errors.push({ row: i + 2, message: error.message });
          continue;
        }
        if (inserted) leads.push({ id: inserted.id });
      }
    }

    return NextResponse.json({
      leads,
      errors,
      created: leads.length,
    });
  } catch (e) {
    console.error('[csv/process]', e);
    return NextResponse.json({ error: 'Failed to process CSV' }, { status: 500 });
  }
}
