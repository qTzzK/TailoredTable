// Shared shapes for invoices and payments. Safe to import from client
// components — no secrets, no server-only code.

export type InvoiceStatus = 'draft' | 'sent' | 'deposit_paid' | 'paid' | 'void';
export type PaymentType = 'deposit' | 'balance' | 'full' | 'manual';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

export type ItemPricing = 'priced' | 'tbd' | 'waived';

export interface LineItem {
  /** Stable identity, server-generated. Absent on pre-migration rows. */
  id?: string;
  description: string;
  quantity: number;
  /** Absent on legacy rows => treated as 'priced'. */
  pricing?: ItemPricing;
  /**
   * null if and only if pricing === 'tbd'. Never undefined —
   * `quantity * undefined` renders the literal string "$NaN" on the invoice.
   */
  unit_amount_cents: number | null;
  /** Free text shown under a TBD row, e.g. "billed at cost, usually $200–$300". */
  tbd_note?: string | null;
  /** Set when the item was CREATED as TBD. Only these may be priced later. */
  origin?: 'tbd';
  priced_at?: string | null;
  previous_unit_amount_cents?: number | null;
}

/** True when this item has no price yet. */
export function isTbd(item: LineItem): boolean {
  return item.pricing === 'tbd';
}

/** Extended amount for a line, or null when the item is still TBD. */
export function lineAmountCents(item: LineItem): number | null {
  if (item.pricing === 'tbd' || item.unit_amount_cents === null) return null;
  return item.quantity * item.unit_amount_cents;
}

/** Client-safe; lib/invoices.ts re-exports this for server callers. */
export function hasUnpricedItems(invoice: { line_items: LineItem[] }): boolean {
  return invoice.line_items.some(isTbd);
}

export interface Invoice {
  id: string;
  invoice_number: number;
  token: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_email: string;
  description: string | null;
  notes: string | null;
  line_items: LineItem[];
  currency: string;
  /** Sum of PRICED + WAIVED items only — i.e. "priced so far". */
  total_cents: number;
  deposit_cents: number | null;
  amount_paid_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  service_date: string | null;
  service_time: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  terms_accepted_at: string | null;
  last_email_status: string | null;
  last_email_error: string | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  payment_type: PaymentType;
  status: PaymentStatus;
  created_at: string;
  paid_at: string | null;
}

export interface TermsAcceptance {
  id: string;
  invoice_id: string;
  terms_version: string;
  payment_type: 'deposit' | 'balance' | 'full';
  accepted_at: string;
  ip: string | null;
  user_agent: string | null;
  terms_text: string;
  snapshot: Record<string, unknown>;
  stripe_session_id: string | null;
  created_at: string;
}
