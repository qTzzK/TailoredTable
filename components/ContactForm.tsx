'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus('sending');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });

      if (res.ok) {
        form.reset();
        setStatus('sent');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  const buttonText =
    status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent!' : status === 'error' ? 'Error — try again' : 'Send Inquiry';

  return (
    <form onSubmit={handleSubmit}>
      {/* Honeypot: hidden from humans, filters out bots */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
      />
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="name">Full Name</label>
          <input type="text" id="name" name="name" placeholder="Your name" required />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input type="email" id="email" name="email" placeholder="your@email.com" required />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="phone">Phone Number</label>
          <input type="tel" id="phone" name="phone" placeholder="(000) 000-0000" />
        </div>
        <div className="form-group">
          <label htmlFor="service">Service Type</label>
          <div className="select-wrapper">
            <select id="service" name="service" required defaultValue="">
              <option value="" disabled>Select a service</option>
              <option value="meal-prep">Weekly Meal Prep</option>
              <option value="private-chef">Private Chef Experience</option>
              <option value="small-event">Small Event / Catering</option>
              <option value="unsure">Not Sure Yet</option>
            </select>
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="guests">Number of People</label>
          <input type="number" id="guests" name="guests" placeholder="e.g. 2 or 10" min={1} />
        </div>
        <div className="form-group">
          <label htmlFor="date">Date / Frequency</label>
          <input type="text" id="date" name="date" placeholder="e.g. Weekly or June 15" />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="message">Tell Me More</label>
        <textarea
          id="message"
          name="message"
          placeholder="Share any dietary preferences, goals, special requests, or details about your event…"
          required
        ></textarea>
      </div>

      <div className="form-submit">
        <button type="submit" className="btn btn-primary" disabled={status === 'sending' || status === 'sent'}>
          {buttonText}
        </button>
        <p className="form-note">I&apos;ll respond within 24–48 hours.</p>
      </div>

      <div className="form-success" style={status === 'sent' ? { display: 'block' } : undefined}>
        ✦ &nbsp;Thank you! I&apos;ll be in touch very soon.
      </div>
    </form>
  );
}
