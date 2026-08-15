import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { dbSelect } from './db';
import { hasUnpricedItems, lineAmountCents } from './types';
import type { CustomerPaymentType, Invoice, LineItem, PaymentType } from './types';

export { hasUnpricedItems };

// Domain logic for invoices: token generation, creation validation, and the
// single source of truth for which payments are allowed in which state.

export function generateInvoiceToken(): string {
  // 256 bits, base64url — the URL itself is the customer's capability.
  return randomBytes(32).toString('base64url');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function getInvoiceByToken(token: string): Promise<Invoice | null> {
  if (!TOKEN_RE.test(token)) return null;
  const rows = await dbSelect<Invoice>('invoices', `token=eq.${token}&limit=1`);
  return rows[0] ?? null;
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await dbSelect<Invoice>('invoices', `id=eq.${id}&limit=1`);
  return rows[0] ?? null;
}

/** Server-side total: priced + waived items only. TBD items contribute nothing. */
export function computeTotalCents(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + (lineAmountCents(item) ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Creation validation. The client sends line items and an optional deposit;
// the server recomputes the total — a client-sent total is never trusted.
// ---------------------------------------------------------------------------

export const LIMITS = {
  name: 200,
  email: 320,
  description: 1000,
  itemDescription: 300,
  maxLineItems: 50,
  maxQuantity: 1000,
  maxUnitCents: 10_000_000, // $100,000 per unit
  maxTotalCents: 100_000_000, // $1,000,000 per invoice
  notes: 2000,
  serviceTime: 40,
  tbdNote: 300,
};

export interface CreateInvoiceInput {
  customer_name: string;
  customer_email: string;
  description: string | null;
  notes: string | null;
  line_items: LineItem[];
  total_cents: number;
  deposit_cents: number | null;
  due_date: string | null;
  service_date: string | null;
  service_time: string | null;
}

function normalizeNotes(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\r\n?/g, '\n') // CRLF / CR -> LF
    .replace(/\n{3,}/g, '\n\n') // collapse runs of blank lines
    .trim();
  return cleaned || null;
}

export function validateCreateInvoice(body: Record<string, unknown>): CreateInvoiceInput | { error: string } {
  const name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const email = typeof body.customer_email === 'string' ? body.customer_email.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!name || name.length > LIMITS.name) return { error: 'Customer name is required (max 200 chars).' };
  if (!email || email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'A valid customer email is required.' };
  }
  if (description.length > LIMITS.description) return { error: 'Description is too long.' };

  const rawItems = body.line_items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > LIMITS.maxLineItems) {
    return { error: 'At least one line item is required (max 50).' };
  }

  const line_items: LineItem[] = [];
  let total = 0;
  let hasTbd = false;

  for (const raw of rawItems) {
    if (typeof raw !== 'object' || raw === null) return { error: 'Invalid line item.' };
    const item = raw as Record<string, unknown>;
    const desc = typeof item.description === 'string' ? item.description.trim() : '';
    const quantity = item.quantity;

    if (!desc || desc.length > LIMITS.itemDescription) {
      return { error: 'Each line item needs a description (max 300 chars).' };
    }
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > LIMITS.maxQuantity) {
      return { error: 'Line item quantity must be a whole number between 1 and 1000.' };
    }

    // ids are ALWAYS server-generated. A client-supplied duplicate would make
    // the price-item route's target ambiguous.
    const id = randomUUID();

    if (item.pricing === 'tbd') {
      hasTbd = true;
      const note =
        typeof item.tbd_note === 'string' ? item.tbd_note.trim().slice(0, LIMITS.tbdNote) || null : null;
      line_items.push({
        id,
        description: desc,
        quantity: quantity as number,
        pricing: 'tbd',
        unit_amount_cents: null, // explicit null, never absent
        tbd_note: note,
        origin: 'tbd',
      });
      continue; // contributes 0 to the total
    }

    const unit = item.unit_amount_cents;
    if (!Number.isInteger(unit) || (unit as number) < 1 || (unit as number) > LIMITS.maxUnitCents) {
      return { error: 'Line item price must be between $0.01 and $100,000, or marked TBD.' };
    }
    line_items.push({
      id,
      description: desc,
      quantity: quantity as number,
      pricing: 'priced',
      unit_amount_cents: unit as number,
    });
    total += (quantity as number) * (unit as number);
  }

  // The 50c floor also guarantees at least one PRICED item: an all-TBD invoice
  // sums to 0 and is rejected here. That is deliberate — an all-TBD document
  // is a quote, not an invoice, and a $0 invoice is a chargeback gift.
  if (total < 50) {
    return {
      error: hasTbd
        ? 'At least one priced line item is required — an invoice cannot be all TBD.'
        : 'Invoice total must be at least $0.50 (Stripe minimum).',
    };
  }
  if (total > LIMITS.maxTotalCents) return { error: 'Invoice total exceeds the maximum.' };

  let deposit_cents: number | null = null;
  if (body.deposit_cents !== null && body.deposit_cents !== undefined && body.deposit_cents !== 0) {
    const dep = body.deposit_cents;
    // The remainder must also clear Stripe's 50c minimum, or the balance
    // payment would render a button that can never succeed.
    if (
      !Number.isInteger(dep) ||
      (dep as number) < 50 ||
      (dep as number) >= total ||
      total - (dep as number) < 50
    ) {
      return { error: 'Deposit must be at least $0.50 and leave at least $0.50 of balance.' };
    }
    deposit_cents = dep as number;
  }

  // With TBD items the ONLY payment on offer is the deposit (see
  // allowedPaymentTypes). Without one the invoice page would have no button.
  // Mirrored by the invoices_tbd_requires_deposit CHECK.
  if (hasTbd && deposit_cents === null) {
    return { error: 'Invoices with TBD items need a deposit — that is what the customer pays up front.' };
  }

  let due_date: string | null = null;
  if (body.due_date) {
    if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return { error: 'Due date must be YYYY-MM-DD.' };
    }
    due_date = body.due_date;
  }

  let service_date: string | null = null;
  if (body.service_date) {
    if (typeof body.service_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.service_date)) {
      return { error: 'Service date must be YYYY-MM-DD.' };
    }
    service_date = body.service_date;
  }

  const service_time =
    typeof body.service_time === 'string' && body.service_time.trim()
      ? body.service_time.trim().slice(0, LIMITS.serviceTime)
      : null;

  const notes = normalizeNotes(body.notes);
  if (notes && notes.length > LIMITS.notes) return { error: 'Note is too long (max 2000 characters).' };

  return {
    customer_name: name,
    customer_email: email,
    description: description || null,
    notes,
    line_items,
    total_cents: total,
    deposit_cents,
    due_date,
    service_date,
    service_time,
  };
}

// ---------------------------------------------------------------------------
// Payment truth table. Amounts ALWAYS come from the DB row; the client only
// ever sends a payment_type. While any line item is unpriced the invoice total
// is not final, so only the (fixed) deposit may be collected — 'full' and
// 'balance' would both display a number that is not what the customer owes,
// and 'full' would additionally drive status -> 'paid', the one status in
// which the remaining items can never be priced.
// ---------------------------------------------------------------------------

export function allowedPaymentTypes(invoice: Invoice): CustomerPaymentType[] {
  const unpriced = hasUnpricedItems(invoice);
  switch (invoice.status) {
    case 'draft':
    case 'sent':
      if (!invoice.deposit_cents) return unpriced ? [] : ['full'];
      return unpriced ? ['deposit'] : ['deposit', 'full'];
    case 'deposit_paid':
      return unpriced ? [] : ['balance'];
    default: // paid | void
      return [];
  }
}

export function paymentAmountCents(invoice: Invoice, type: PaymentType): number {
  switch (type) {
    case 'deposit':
      return invoice.deposit_cents ?? 0;
    case 'full':
      return invoice.total_cents;
    case 'balance':
      // Floored explicitly: with mutable totals a downward correction after a
      // deposit could otherwise produce a negative amount.
      return Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
    default:
      return 0;
  }
}
