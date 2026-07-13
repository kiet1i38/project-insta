import { randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import { mailService } from "../src/modules/mail/mail.service.js";

type MailpitMessage = {
  Subject?: string;
  subject?: string;
};

type MailpitMessagesResponse = {
  messages?: MailpitMessage[];
};

const defaultMailpitApiUrl = "http://localhost:8025/api/v1";
const mailpitApiUrl =
  process.env.MAILPIT_API_URL?.replace(/\/$/, "") ?? defaultMailpitApiUrl;
const deliveryMarker = `cloneinsta-mail-proof-${randomUUID()}`;
const recipient = "mailpit-proof@cloneinsta.local";
const subject = `CloneInsta SMTP delivery proof ${deliveryMarker}`;

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function mailpitReceivedDelivery(): Promise<boolean> {
  const response = await fetch(`${mailpitApiUrl}/messages`);

  if (!response.ok) {
    throw new Error("Mailpit message lookup failed.");
  }

  const payload = (await response.json()) as MailpitMessagesResponse;

  return (
    payload.messages?.some(
      (message) => message.Subject === subject || message.subject === subject
    ) ?? false
  );
}

async function verifyMailpitDelivery(): Promise<void> {
  await mailService.sendMail({
    subject,
    text: `CloneInsta Mailpit delivery proof: ${deliveryMarker}`,
    to: recipient
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await mailpitReceivedDelivery()) {
      console.log("Mailpit SMTP delivery proof passed.");
      return;
    }

    await wait(250);
  }

  throw new Error("Mailpit did not confirm the SMTP delivery proof.");
}

void verifyMailpitDelivery().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown mail verification failure.";

  console.error("Mailpit SMTP delivery proof failed.", message);
  process.exitCode = 1;
});
