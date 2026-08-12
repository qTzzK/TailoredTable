import 'server-only';
import { randomBytes } from 'node:crypto';
import { dbSelect } from './db';
import type { Invoice, LineItem, PaymentType } from './types';

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
};

export interface CreateInvoiceInput {
  customer_name: string;
  customer_email: string;
  description: string | null;
  line_items: LineItem[];
  total_cents: number;
  deposit_cents: number | null;
  due_date: string | null;
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
  for (const raw of rawItems) {
    if (typeof raw !== 'object' || raw === null) return { error: 'Invalid line item.' };
    const item = raw as Record<string, unknown>;
    const desc = typeof item.description === 'string' ? item.description.trim() : '';
    const quantity = item.quantity;
    const unit = item.unit_amount_cents;
    if (!desc || desc.length > LIMITS.itemDescription) {
      return { error: 'Each line item needs a description (max 300 chars).' };
    }
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > LIMITS.maxQuantity) {
      return { error: 'Line item quantity must be a whole number between 1 and 1000.' };
    }
    if (!Number.isInteger(unit) || (unit as number) < 1 || (unit as number) > LIMITS.maxUnitCents) {
      return { error: 'Line item price must be between $0.01 and $100,000.' };
    }
    line_items.push({ description: desc, quantity: quantity as number, unit_amount_cents: unit as number });
    total += (quantity as number) * (unit as number);
  }

  if (total < 50) return { error: 'Invoice total must be at least $0.50 (Stripe minimum).' };
  if (total > LIMITS.maxTotalCents) return { error: 'Invoice total exceeds the maximum.' };

  let deposit_cents: number | null = null;
  if (body.deposit_cents !== null && body.deposit_cents !== undefined && body.deposit_cents !== 0) {
    const dep = body.deposit_cents;
    if (!Number.isInteger(dep) || (dep as number) < 50 || (dep as number) >= total) {
      return { error: 'Deposit must be at least $0.50 and less than the invoice total.' };
    }
    deposit_cents = dep as number;
  }

  let due_date: string | null = null;
  if (body.due_date) {
    if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return { error: 'Due date must be YYYY-MM-DD.' };
    }
    due_date = body.due_date;
  }

  return {
    customer_name: name,
    customer_email: email,
    description: description || null,
    line_items,
    total_cents: total,
    deposit_cents,
    due_date,
  };
}

// ---------------------------------------------------------------------------
// Payment truth table. Given an invoice's state, which payment types may a
// customer initiate, and for how much? Amounts always come from the DB row.
// ---------------------------------------------------------------------------

export function allowedPaymentTypes(invoice: Invoice): PaymentType[] {
  switch (invoice.status) {
    case 'draft':
    case 'sent':
      return invoice.deposit_cents ? ['deposit', 'full'] : ['full'];
    case 'deposit_paid':
      return ['balance'];
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
      return invoice.total_cents - invoice.amount_paid_cents;
    default:
      return 0;
  }
}
