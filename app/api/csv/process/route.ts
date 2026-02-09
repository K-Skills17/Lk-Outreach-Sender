import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSellerFromRequest } from '@/lib/auth';
import { parseCSV, rowToLeadFields, MAX_CSV_SIZE } from '@/lib/csv-parse';
import { normalizePhone } from '@/lib/data-cleaning';

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
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_CSV_SIZE / 1024 / 1024} MB.` },
        { status: 400 }
      );
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
    let skippedDuplicates = 0;
    let cleanedPhones = 0;

    // Track normalized phones within this batch to detect in-file duplicates
    const seenPhones = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fields = rowToLeadFields(row);
      if (!fields.contact_phone) {
        errors.push({ row: i + 2, message: 'Missing or invalid phone (required column)' });
        continue;
      }

      // Normalize phone for consistent dedup (already normalized by rowToLeadFields,
      // but run again to ensure consistency)
      const normalized = normalizePhone(fields.contact_phone);
      if (!normalized) {
        errors.push({ row: i + 2, message: `Invalid phone after cleaning: "${fields.contact_phone}"` });
        continue;
      }
      if (normalized !== fields.contact_phone) {
        cleanedPhones++;
      }

      // Skip in-file duplicates (keep first occurrence)
      if (seenPhones.has(normalized)) {
        skippedDuplicates++;
        continue;
      }
      seenPhones.add(normalized);

      const now = new Date().toISOString();
      const payload = {
        contact_name: fields.contact_name ?? null,
        contact_phone: normalized,
        contact_email: fields.contact_email ?? null,
        business_name: fields.business_name ?? null,
        industry: fields.industry ?? null,
        summary: fields.summary ?? null,
        raw_payload: fields.raw_payload,
        updated_at: now,
      };

      // Use normalized phone for DB dedup to catch format variations
      const { data: existing } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('contact_phone', normalized)
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
      cleaning: {
        total_rows: rows.length,
        phones_normalized: cleanedPhones,
        duplicates_skipped: skippedDuplicates,
        invalid_rows: errors.length,
      },
    });
  } catch (e) {
    console.error('[csv/process]', e);
    return NextResponse.json({ error: 'Failed to process CSV' }, { status: 500 });
  }
}
