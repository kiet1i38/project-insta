import { describe, expect, test, vi } from "vitest";
import {
  MAIL_DELIVERY_FAILED_CODE,
  createMailService,
  type MailTransport
} from "./mail.service.js";

describe("mail service", () => {
  test("sends only the caller-supplied content with the configured sender", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "mailpit-123" });
    const service = createMailService({
      from: "noreply@cloneinsta.local",
      transport: { sendMail } as MailTransport
    });

    await service.sendMail({
      html: "<p>Safe local delivery test</p>",
      subject: "CloneInsta mail boundary",
      text: "Safe local delivery test",
      to: "student@example.test"
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "noreply@cloneinsta.local",
      html: "<p>Safe local delivery test</p>",
      subject: "CloneInsta mail boundary",
      text: "Safe local delivery test",
      to: "student@example.test"
    });
  });

  test("redacts provider failures before returning a generic delivery error", async () => {
    const logger = { error: vi.fn() };
    const service = createMailService({
      from: "noreply@cloneinsta.local",
      logger,
      transport: {
        sendMail: vi
          .fn()
          .mockRejectedValue(
            new Error("SMTP rejected student@example.test token=do-not-log")
          )
      } as MailTransport
    });

    const delivery = service.sendMail({
      subject: "Private reset link token=do-not-log",
      text: "Private reset link token=do-not-log",
      to: "student@example.test"
    });

    await expect(delivery).rejects.toMatchObject({
      code: MAIL_DELIVERY_FAILED_CODE,
      message: "Email delivery is temporarily unavailable."
    });
    expect(logger.error).toHaveBeenCalledWith({
      event: "mail_delivery_failed"
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      "student@example.test"
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("do-not-log");
  });
});
