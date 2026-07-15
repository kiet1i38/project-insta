import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { env } from "../../config/env.js";

export const MAIL_DELIVERY_FAILED_CODE = "MAIL_DELIVERY_FAILED";

export type MailTransport = Pick<Transporter, "sendMail">;

type MailLogger = Pick<Console, "error">;

export type MailMessage = {
  html?: string;
  subject: string;
  text: string;
  to: string;
};

export type MailService = {
  sendMail(message: MailMessage): Promise<void>;
};

type CreateMailServiceOptions = {
  from: string;
  logger?: MailLogger;
  transport: MailTransport;
};

export class MailDeliveryError extends Error {
  code = MAIL_DELIVERY_FAILED_CODE;

  constructor() {
    super("Email delivery is temporarily unavailable.");
    this.name = "MailDeliveryError";
  }
}

export function createMailService({
  from,
  logger = console,
  transport
}: CreateMailServiceOptions): MailService {
  return {
    async sendMail(message: MailMessage): Promise<void> {
      const options = { from, ...message } satisfies SendMailOptions;

      try {
        await transport.sendMail(options);
      } catch {
        logger.error({ event: "mail_delivery_failed" });
        throw new MailDeliveryError();
      }
    }
  };
}

export function createSmtpMailService(): MailService {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE
  });

  return createMailService({
    from: env.SMTP_FROM,
    transport
  });
}

export const mailService = createSmtpMailService();
