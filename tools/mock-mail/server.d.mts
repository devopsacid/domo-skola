export interface CapturedMail {
  id: string;
  received_at: string;
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  tag: string;
}
export function startMockMail(opts?: { port?: number; host?: string }): Promise<{
  url: string;
  messages: CapturedMail[];
  close: () => Promise<void>;
}>;
