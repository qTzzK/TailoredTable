// Vercel serverless function — forwards contact-form inquiries via Resend.
//
// Required environment variables (set in the Vercel dashboard):
//   RESEND_API_KEY   - API key from https://resend.com/api-keys
//   CONTACT_TO       - where inquiries are delivered (defaults to groundgametheory@gmail.com)
//   CONTACT_FROM     - sender address. Must be on a domain verified in Resend.
//                      Until mytailoredtaste.com is verified, the default
//                      onboarding@resend.dev is the only address Resend accepts.

const escapeHtml = str =>
  String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

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

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'Tailored Taste <onboarding@resend.dev>',
        to: [process.env.CONTACT_TO || 'groundgametheory@gmail.com'],
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

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error('Resend error:', resendRes.status, detail);
      return res.status(502).json({ error: 'Failed to send email.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
}
