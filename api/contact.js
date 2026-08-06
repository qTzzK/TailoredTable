// Vercel serverless function — saves contact-form inquiries to Supabase,
// then forwards them via Resend.
//
// Every inquiry is saved to the database first, so nothing is lost if the
// email fails. The row's email_status ('pending' | 'sent' | 'failed')
// records the outcome so failed sends can be retried later.
//
// Required environment variables (set in the Vercel dashboard):
//   RESEND_API_KEY             - API key from https://resend.com/api-keys
//   CONTACT_TO                 - where inquiries are delivered
//   CONTACT_FROM               - sender address. Must be on a domain verified
//                                in Resend; defaults to onboarding@resend.dev
//                                which works before verification.
//   SUPABASE_URL               - e.g. https://abcdefgh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  - service_role key (server-side only, never
//                                expose in client code)

const escapeHtml = str =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const supabaseHeaders = () => ({
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
});

async function saveInquiry(fields) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
  }
  const [row] = await res.json();
  return row.id;
}

async function updateEmailStatus(id, status, error) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/inquiries?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify({ email_status: status, email_error: error || null }),
    }
  );
  if (!res.ok) {
    console.error('Supabase status update failed:', res.status, await res.text());
  }
}

async function sendEmail({ name, email, phone, service, guests, date, message }) {
  const rows = [
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || 'Tailored Taste <onboarding@resend.dev>',
      to: [process.env.CONTACT_TO],
      reply_to: email,
      subject: `New inquiry from ${name}${service ? ` — ${service}` : ''}`,
      html: `
        <h2 style="margin:0 0 12px;">New inquiry from the website</h2>
        <table style="font-size:15px;">${rows}</table>
        <h3 style="margin:16px 0 4px;">Message</h3>
        <p style="white-space:pre-wrap;font-size:15px;">${escapeHtml(message)}</p>
      `,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend error: ${res.status} ${await res.text()}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, service, guests, date, message, company } = req.body || {};

  // Honeypot: hidden field real users never fill in. Pretend success for bots.
  if (company) {
    return res.status(200).json({ ok: true });
  }

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  // 1. Save to Supabase so the inquiry survives even if the email fails.
  let inquiryId = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      inquiryId = await saveInquiry({
        name,
        email,
        phone: phone || null,
        service: service || null,
        guests: guests || null,
        event_date: date || null,
        message,
      });
    } catch (err) {
      console.error(err);
    }
  } else {
    console.error('Supabase env vars not set — inquiry not saved to database.');
  }

  // 2. Send the email and record the outcome on the saved row.
  let emailError = null;
  if (process.env.RESEND_API_KEY && process.env.CONTACT_TO) {
    try {
      await sendEmail({ name, email, phone, service, guests, date, message });
    } catch (err) {
      console.error(err);
      emailError = err.message;
    }
  } else {
    emailError = 'RESEND_API_KEY or CONTACT_TO not configured.';
    console.error(emailError);
  }

  if (inquiryId) {
    await updateEmailStatus(inquiryId, emailError ? 'failed' : 'sent', emailError);
  }

  // The inquiry is safe if it reached the database OR the inbox.
  if (inquiryId || !emailError) {
    return res.status(200).json({ ok: true });
  }
  return res.status(502).json({ error: 'Failed to send your inquiry. Please try again.' });
}
