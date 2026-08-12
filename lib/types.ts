// Shared shapes for invoices and payments. Safe to import from client
// components — no secrets, no server-only code.

export type InvoiceStatus = 'draft' | 'sent' | 'deposit_paid' | 'paid' | 'void';
export type PaymentType = 'deposit' | 'balance' | 'full' | 'manual';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

export interface LineItem {
  description: string;
  quantity: number;
  unit_amount_cents: number;
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
  line_items: LineItem[];
  currency: string;
  total_cents: number;
  deposit_cents: number | null;
  amount_paid_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
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
