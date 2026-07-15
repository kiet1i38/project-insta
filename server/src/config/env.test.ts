import { describe, expect, test } from "vitest";
import { parseEnvironment } from "./env.js";

describe("environment configuration", () => {
  test("parses the host-run Mailpit SMTP defaults", () => {
    expect(
      parseEnvironment({
        SMTP_FROM: "noreply@cloneinsta.local",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        PUBLIC_APP_URL: "http://localhost:5173"
      })
    ).toMatchObject({
      SMTP_FROM: "noreply@cloneinsta.local",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      PUBLIC_APP_URL: "http://localhost:5173"
    });
  });

  test("rejects malformed SMTP ports, senders, and boolean values", () => {
    expect(() => parseEnvironment({ SMTP_PORT: "0" })).toThrow();
    expect(() => parseEnvironment({ SMTP_FROM: "not-an-email" })).toThrow();
    expect(() => parseEnvironment({ SMTP_SECURE: "sometimes" })).toThrow();
  });

  test("requires a HTTPS public app URL in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        PUBLIC_APP_URL: "http://cloneinsta.example"
      })
    ).toThrow();

    expect(
      parseEnvironment({
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://cloneinsta.example"
      }).PUBLIC_APP_URL
    ).toBe("https://cloneinsta.example");
  });
});
