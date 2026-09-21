// Shared limits for the admin "compose email" feature. Safe to import from
// client components — no secrets, no server-only code. The server re-validates
// everything; these exist so the form can reject a bad file before uploading it.

export const MAIL_LIMITS = {
  fromName: 80,
  fromLocal: 64,
  subject: 200,
  body: 20_000,
  maxRecipients: 50, // Resend's cap on a single send
  maxFiles: 5,
  // Vercel serverless functions reject request bodies over ~4.5 MB. Multipart
  // overhead plus a little headroom puts the raw cap here; base64 inflation
  // happens server-side, after the upload, and Resend's own cap is 40 MB.
  maxTotalBytes: 3_500_000,
} as const;

/** Extension -> MIME type we send to Resend. Contracts are PDFs or Word files. */
export const ALLOWED_ATTACHMENTS: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

export const ALLOWED_ATTACHMENT_ACCEPT = Object.keys(ALLOWED_ATTACHMENTS)
  .map(ext => `.${ext}`)
  .join(',');

export function attachmentExtension(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  const ext = match?.[1]?.toLowerCase() ?? null;
  return ext && ext in ALLOWED_ATTACHMENTS ? ext : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SENDER_PRESETS = [
  { name: 'Chef', local: 'chef' },
  { name: 'Tailored Taste', local: 'hello' },
] as const;
