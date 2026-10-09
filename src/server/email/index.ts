import "server-only";
import { env } from "@/env";
import { logger } from "@/server/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Development driver: prints the message (including links) to the server log. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage) {
    // Printed as plain text so links can be copied from the terminal during development.
    process.stdout.write(
      `\n──── email (console driver) ────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n────────────────────────────────\n`,
    );
  }
}

class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  async send(message: EmailMessage) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  async send(message: EmailMessage) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend API responded with ${response.status}`);
    }
  }
}

/** Test driver: keeps messages in memory so tests can assert on them. */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = "memory";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  if (env.NODE_ENV === "test") provider = new MemoryEmailProvider();
  else if (env.EMAIL_DRIVER === "smtp") provider = new SmtpEmailProvider();
  else if (env.EMAIL_DRIVER === "resend") provider = new ResendEmailProvider();
  else provider = new ConsoleEmailProvider();
  return provider;
}

/** Sends an email; failures are logged and never break the caller (emails are post-commit). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await getEmailProvider().send(message);
  } catch (error) {
    logger.error({ err: error, subject: message.subject }, "email delivery failed");
  }
}

export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}
