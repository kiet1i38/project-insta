import { describe, expect, test } from "vitest";
import { parseEnvironment } from "./env.js";

describe("environment configuration", () => {
  test("parses the host-run Mailpit SMTP defaults", () => {
    expect(
      parseEnvironment({
        SMTP_FROM: "noreply@cloneinsta.local",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false"
      })
    ).toMatchObject({
      SMTP_FROM: "noreply@cloneinsta.local",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      SMTP_SECURE: false
    });
  });

  test("rejects malformed SMTP ports, senders, and boolean values", () => {
    expect(() => parseEnvironment({ SMTP_PORT: "0" })).toThrow();
    expect(() => parseEnvironment({ SMTP_FROM: "not-an-email" })).toThrow();
    expect(() => parseEnvironment({ SMTP_SECURE: "sometimes" })).toThrow();
  });
});
