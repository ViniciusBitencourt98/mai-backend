import { z } from 'zod';
export interface Email { to: string; subject: string; text: string; html: string; }
export interface EmailTransport { send(email: Email): Promise<{ providerMessageId: string }>; }
export class EmailFailure extends Error {
  constructor(readonly category: 'NETWORK' | 'PROVIDER_REJECTED' | 'INTERNAL') { super('Email delivery failed'); }
}
export interface EmailBindings {
  EMAIL_DELIVERY_ENABLED?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM?: string;
  APPLICATION_URL?: string;
}
const base64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const mailbox = z.email().max(254).refine(s => !/[\r\n]/.test(s));
export function mime(email: Email, from: string) {
  mailbox.parse(from); mailbox.parse(email.to);
  const boundary = 'mai_' + crypto.randomUUID();
  return [`From: ${from}`, `To: ${email.to}`, `Subject: =?UTF-8?B?${base64(email.subject)}?=`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    ...(['text/plain', 'text/html'] as const).flatMap((type, index) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64', '', base64(index ? email.html : email.text).match(/.{1,76}/g)?.join('\r\n') ?? '']),
    `--${boundary}--`, ''].join('\r\n');
}
/** Real Gmail HTTP adapter. One token request and one send, with no retry. */
export class GmailTransport implements EmailTransport {
  constructor(private readonly bindings: EmailBindings, private readonly request: typeof fetch = fetch) {}
  async send(email: Email) {
    const b = this.bindings;
    if (b.EMAIL_DELIVERY_ENABLED !== 'true' || !b.GMAIL_CLIENT_ID || !b.GMAIL_CLIENT_SECRET || !b.GMAIL_REFRESH_TOKEN || !b.GMAIL_FROM) throw new EmailFailure('INTERNAL');
    try {
      const raw = Buffer.from(mime(email, b.GMAIL_FROM)).toString('base64url');
      const tokenResponse = await this.request('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token',
          client_id: b.GMAIL_CLIENT_ID, client_secret: b.GMAIL_CLIENT_SECRET, refresh_token: b.GMAIL_REFRESH_TOKEN }) });
      if (!tokenResponse.ok) throw new EmailFailure('PROVIDER_REJECTED');
      const token = z.object({ access_token: z.string().min(1) }).parse(await tokenResponse.json());
      const response = await this.request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
      if (!response.ok) throw new EmailFailure('PROVIDER_REJECTED');
      const result = z.object({ id: z.string().trim().min(1).max(200) }).parse(await response.json());
      return { providerMessageId: result.id };
    } catch (error) {
      if (error instanceof EmailFailure) throw error;
      // No error causes: responses, credentials and driver details must never reach logs.
      throw new EmailFailure('NETWORK');
    }
  }
}
