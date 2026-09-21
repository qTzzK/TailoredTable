import 'server-only';
import { escapeHtml } from './email';
import type { EmailAttachment } from './email';
import { ALLOWED_ATTACHMENTS, MAIL_LIMITS, attachmentExtension } from './mail-limits';
import type { SentEmailAttachment } from './types';

// Validation and sender policy for admin-composed email. The domain is never
// user-supplied: the admin picks a display name and a local part, and the
// address is always <local>@MAIL_FROM_DOMAIN — the one domain verified in
// Resend. Anything else would be rejected by Resend with a 403 anyway.

export function mailFromDomain(): string {
  return (process.env.MAIL_FROM_DOMAIN || 'mytailoredtaste.com').trim().toLowerCase();
}

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function buildSender(rawName: unknown, rawLocal: unknown): Validated<string> {
  const name = typeof rawName === 'string' ? rawName.replace(/[<>"\r\n]/g, '').trim() : '';
  const local = typeof rawLocal === 'string' ? rawLocal.trim().toLowerCase() : '';

  if (!local || local.length > MAIL_LIMITS.fromLocal || !LOCAL_PART_RE.test(local)) {
    return {
      ok: false,
      error: 'The from address may only contain letters, numbers, dots, dashes, underscores and plus signs.',
    };
  }
  if (name.length > MAIL_LIMITS.fromName) {
    return { ok: false, error: `The from name is too long (max ${MAIL_LIMITS.fromName} characters).` };
  }
  const address = `${local}@${mailFromDomain()}`;
  return { ok: true, value: name ? `${name} <${address}>` : address };
}

/** Splits a typed recipient list on commas, semicolons or newlines. */
export function parseRecipients(raw: unknown, label: string, required: boolean): Validated<string[]> {
  const text = typeof raw === 'string' ? raw : '';
  const list = text
    .split(/[,;\n]/)
    .map(s => s.trim())
    .filter(Boolean);

  if (list.length === 0) {
    return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: [] };
  }
  if (list.length > MAIL_LIMITS.maxRecipients) {
    return { ok: false, error: `${label} may have at most ${MAIL_LIMITS.maxRecipients} addresses.` };
  }
  for (const addr of list) {
    if (addr.length > 320 || !EMAIL_RE.test(addr)) {
      return { ok: false, error: `"${addr}" is not a valid email address (${label}).` };
    }
  }
  return { ok: true, value: Array.from(new Set(list.map(a => a.toLowerCase()))) };
}

export function validateSubject(raw: unknown): Validated<string> {
  const subject = typeof raw === 'string' ? raw.replace(/[\r\n]+/g, ' ').trim() : '';
  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (subject.length > MAIL_LIMITS.subject) {
    return { ok: false, error: `Subject is too long (max ${MAIL_LIMITS.subject} characters).` };
  }
  return { ok: true, value: subject };
}

export function validateBody(raw: unknown): Validated<string> {
  const body =
    typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (!body) return { ok: false, error: 'Message body is required.' };
  if (body.length > MAIL_LIMITS.body) {
    return { ok: false, error: `Message is too long (max ${MAIL_LIMITS.body} characters).` };
  }
  return { ok: true, value: body };
}

/** Strips path separators and control characters; keeps the extension intact. */
function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'attachment';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (cleaned || 'attachment').slice(0, 150);
}

export interface PreparedAttachments {
  forResend: EmailAttachment[];
  forLog: SentEmailAttachment[];
}

/**
 * Validates by extension, not by the browser-reported MIME type: Windows
 * regularly reports .docx as application/octet-stream. The MIME we send to
 * Resend comes from our own table.
 */
export async function prepareAttachments(files: File[]): Promise<Validated<PreparedAttachments>> {
  if (files.length > MAIL_LIMITS.maxFiles) {
    return { ok: false, error: `You can attach at most ${MAIL_LIMITS.maxFiles} files.` };
  }
  let total = 0;
  const forResend: EmailAttachment[] = [];
  const forLog: SentEmailAttachment[] = [];

  for (const file of files) {
    const filename = safeFilename(file.name);
    const ext = attachmentExtension(filename);
    if (!ext) {
      return {
        ok: false,
        error: `"${filename}" is not a PDF or Word document. Only .pdf, .docx and .doc files can be attached.`,
      };
    }
    if (file.size === 0) return { ok: false, error: `"${filename}" is empty.` };
    total += file.size;
    if (total > MAIL_LIMITS.maxTotalBytes) {
      return { ok: false, error: 'Attachments are too large — keep the total under 3.5 MB.' };
    }
    const content_type = ALLOWED_ATTACHMENTS[ext];
    const content = Buffer.from(await file.arrayBuffer()).toString('base64');
    forResend.push({ filename, content, content_type });
    forLog.push({ filename, size: file.size, content_type });
  }
  return { ok: true, value: { forResend, forLog } };
}

/**
 * A personal note, not a marketing template: escaped text, paragraphs on
 * blank lines, <br /> on single newlines, in a plain serif container. Escape
 * FIRST, then insert tags — the other order would be an XSS hole.
 */
export function plainToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 1em;">${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
  return `<div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#2C2C2C;max-width:640px;">${paragraphs}</div>`;
}
