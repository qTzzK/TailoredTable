import { NextResponse } from 'next/server';
import { dbInsert, dbUpdate } from '@/lib/db';
import { escapeHtml, sendEmail } from '@/lib/email';

// Contact-form inquiries: saved to Supabase first so nothing is lost if the
// email fails; the row's email_status records the outcome for later retry.

const MAX = { name: 200, email: 320, phone: 50, service: 50, guests: 20, date: 200, message: 5000 };

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot: hidden field real users never fill in. Pretend success for bots.
  if (body.company) {
    return NextResponse.json({ ok: true });
  }

  const name = clip(body.name, MAX.name);
  const email = clip(body.email, MAX.email);
  const phone = clip(body.phone, MAX.phone);
  const service = clip(body.service, MAX.service);
  const guests = clip(body.guests, MAX.guests);
  const date = clip(body.date, MAX.date);
  const message = clip(body.message, MAX.message);

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }

  // 1. Save to Supabase so the inquiry survives even if the email fails.
  let inquiryId: string | null = null;
  try {
    const row = await dbInsert<{ id: string }>('inquiries', {
      name,
      email,
      phone,
      service,
      guests,
      event_date: date,
      message,
    });
    inquiryId = row.id;
  } catch (err) {
    console.error(err);
  }

  // 2. Send the email and record the outcome on the saved row.
  const detailRows = [
    ['Name', name],
    ['Email', email],
    ['Phone', phone],
    ['Service', service],
    ['Guests', guests],
    ['Date / Frequency', date],
  ]
    .filter(([, v]) => v)
    .map(
      ([label, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  let emailError: string | null = null;
  const to = process.env.CONTACT_TO;
  if (to) {
    const result = await sendEmail({
      to,
      replyTo: email,
      subject: `New inquiry from ${name}${service ? ` — ${service}` : ''}`,
      html: `
        <h2 style="margin:0 0 12px;">New inquiry from the website</h2>
        <table style="font-size:15px;">${detailRows}</table>
        <h3 style="margin:16px 0 4px;">Message</h3>
        <p style="white-space:pre-wrap;font-size:15px;">${escapeHtml(message)}</p>
      `,
    });
    if (!result.sent) emailError = result.error || 'send_failed';
  } else {
    emailError = 'CONTACT_TO not configured.';
    console.error(emailError);
  }

  if (inquiryId) {
    try {
      await dbUpdate('inquiries', `id=eq.${inquiryId}`, {
        email_status: emailError ? 'failed' : 'sent',
        email_error: emailError,
      });
    } catch (err) {
      console.error('Failed to record email status:', err);
    }
  }

  // The inquiry is safe if it reached the database OR the inbox.
  if (inquiryId || !emailError) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Failed to send your inquiry. Please try again.' }, { status: 502 });
}
