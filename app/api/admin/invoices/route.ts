import { NextResponse } from 'next/server';
import { dbInsert } from '@/lib/db';
import { generateInvoiceToken, validateCreateInvoice } from '@/lib/invoices';
import { rejectCrossSite, requireAdmin } from '@/lib/session';
import type { Invoice } from '@/lib/types';

export async function POST(req: Request) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = validateCreateInvoice(body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const invoice = await dbInsert<Invoice>('invoices', {
      ...result,
      token: generateInvoiceToken(),
      status: 'draft',
    });
    return NextResponse.json({ id: invoice.id });
  } catch (err) {
    console.error('Invoice creation failed:', err);
    return NextResponse.json({ error: 'Failed to create the invoice.' }, { status: 500 });
  }
}
