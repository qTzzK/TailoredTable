'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  MAIL_LIMITS,
  SENDER_PRESETS,
  attachmentExtension,
  formatBytes,
} from '@/lib/mail-limits';

interface Props {
  domain: string;
  defaults: {
    to: string;
    subject: string;
    body: string;
    invoiceId: string | null;
    customerName: string | null;
  };
}

export default function ComposeEmailForm({ domain, defaults }: Props) {
  const router = useRouter();
  const [fromName, setFromName] = useState<string>(SENDER_PRESETS[0].name);
  const [fromLocal, setFromLocal] = useState<string>(SENDER_PRESETS[0].local);
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [files, setFiles] = useState<File[]>([]);
  // Remounting the <input type="file"> is the only reliable way to clear it.
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const presetKey = SENDER_PRESETS.find(p => p.name === fromName && p.local === fromLocal)?.local ?? 'custom';

  function applyPreset(key: string) {
    const preset = SENDER_PRESETS.find(p => p.local === key);
    if (preset) {
      setFromName(preset.name);
      setFromLocal(preset.local);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!attachmentExtension(file.name)) {
        setError(`"${file.name}" is not a PDF or Word document. Only .pdf, .docx and .doc files can be attached.`);
        continue;
      }
      if (next.some(f => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    if (next.length > MAIL_LIMITS.maxFiles) {
      setError(`You can attach at most ${MAIL_LIMITS.maxFiles} files.`);
      setFileInputKey(k => k + 1);
      return;
    }
    if (next.reduce((sum, f) => sum + f.size, 0) > MAIL_LIMITS.maxTotalBytes) {
      setError(`Attachments are too large — keep the total under ${formatBytes(MAIL_LIMITS.maxTotalBytes)}.`);
      setFileInputKey(k => k + 1);
      return;
    }
    setFiles(next);
    setFileInputKey(k => k + 1);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const form = new FormData();
    form.set('from_name', fromName);
    form.set('from_local', fromLocal);
    form.set('to', to);
    form.set('cc', cc);
    form.set('reply_to', replyTo);
    form.set('subject', subject);
    form.set('body', body);
    if (defaults.invoiceId) form.set('invoice_id', defaults.invoiceId);
    for (const file of files) form.append('files', file, file.name);

    try {
      const res = await fetch('/api/admin/email/send', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setNotice(data.notice || 'Sent.');
        // Clear what was sent so a second click can't send the same contract
        // twice; keep the addresses and subject for a quick follow-up.
        setBody('');
        setFiles([]);
        setFileInputKey(k => k + 1);
        router.refresh();
      } else {
        setError(data?.error || 'The email failed to send.');
      }
    } catch {
      setError('The email failed to send.');
    }
    setBusy(false);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-card">
        <h2>From</h2>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="from_preset">Send as</label>
            <select id="from_preset" value={presetKey} onChange={e => applyPreset(e.target.value)}>
              {SENDER_PRESETS.map(p => (
                <option key={p.local} value={p.local}>
                  {p.name} &lt;{p.local}@{domain}&gt;
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="from_name">Display name</label>
            <input
              type="text"
              id="from_name"
              maxLength={MAIL_LIMITS.fromName}
              value={fromName}
              onChange={e => setFromName(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="from_local">Address</label>
          <div className="mail-from-row">
            <input
              type="text"
              id="from_local"
              required
              maxLength={MAIL_LIMITS.fromLocal}
              pattern="[A-Za-z0-9._+\-]+"
              value={fromLocal}
              onChange={e => setFromLocal(e.target.value.toLowerCase())}
            />
            <span className="mail-from-domain">@{domain}</span>
          </div>
          <p className="form-hint">
            Any name works once the domain is verified in Resend. Replies go to this address — your domain
            forwarding delivers them to your inbox.
          </p>
        </div>
      </div>

      <div className="admin-card">
        <h2>{defaults.customerName ? `To ${defaults.customerName}` : 'Recipients'}</h2>
        <div className="form-group">
          <label htmlFor="to">To</label>
          <input
            type="text"
            id="to"
            required
            placeholder="customer@example.com"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
          <p className="form-hint">Separate several addresses with commas.</p>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="cc">Cc</label>
            <input type="text" id="cc" value={cc} onChange={e => setCc(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="reply_to">Reply-To (optional)</label>
            <input
              type="email"
              id="reply_to"
              placeholder="Only if replies should go elsewhere"
              value={replyTo}
              onChange={e => setReplyTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2>Message</h2>
        <div className="form-group">
          <label htmlFor="subject">Subject</label>
          <input
            type="text"
            id="subject"
            required
            maxLength={MAIL_LIMITS.subject}
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="body">Body</label>
          <textarea
            id="body"
            className="mail-body"
            required
            maxLength={MAIL_LIMITS.body}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <p className="form-hint">Plain text. Blank lines start new paragraphs.</p>
        </div>
      </div>

      <div className="admin-card">
        <h2>Attachments</h2>
        <div className="form-group">
          <label htmlFor="files">Add PDF or Word files</label>
          <input
            key={fileInputKey}
            type="file"
            id="files"
            multiple
            accept={ALLOWED_ATTACHMENT_ACCEPT}
            onChange={e => addFiles(e.target.files)}
          />
          <p className="form-hint">
            Up to {MAIL_LIMITS.maxFiles} files, {formatBytes(MAIL_LIMITS.maxTotalBytes)} total. Attach the
            contract here.
          </p>
        </div>
        {files.length > 0 && (
          <ul className="mail-files">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}`}>
                <span>
                  {f.name} <span className="mail-file-size">{formatBytes(f.size)}</span>
                </span>
                <button type="button" className="line-item-remove" aria-label={`Remove ${f.name}`} onClick={() => removeFile(i)}>
                  ×
                </button>
              </li>
            ))}
            <li className="mail-files-total">
              <span>Total</span>
              <span>{formatBytes(totalBytes)}</span>
            </li>
          </ul>
        )}
      </div>

      <div className="admin-actions-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : files.length ? `Send with ${files.length} attachment${files.length === 1 ? '' : 's'}` : 'Send Email'}
        </button>
        {error && <p className="admin-error" style={{ margin: 0 }}>{error}</p>}
        {notice && <p className="admin-note" style={{ margin: 0 }}>{notice}</p>}
      </div>
    </form>
  );
}
