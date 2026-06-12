import { randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { env } from "../../config/env.js";

export const csrfTokenCookieName =
  env.NODE_ENV === "production"
    ? "__Host-cloneinsta-csrf"
    : "cloneinsta_csrf";

export function issueCsrfToken(): string {
  return randomBytes(24).toString("hex");
}

export function setCsrfTokenCookie(
  res: Response,
  token: string,
  expiresAt: Date
): void {
  const cookieOptions: CookieOptions = {
    expires: expiresAt,
    httpOnly: false,
    path: "/",
    sameSite: "strict",
    secure: env.NODE_ENV === "production"
  };

  res.cookie(csrfTokenCookieName, token, cookieOptions);
}

export function clearCsrfTokenCookie(res: Response): void {
  const cookieOptions: CookieOptions = {
    expires: new Date(0),
    httpOnly: false,
    path: "/",
    sameSite: "strict",
    secure: env.NODE_ENV === "production"
  };

  res.cookie(csrfTokenCookieName, "", cookieOptions);
}

export function readCsrfTokenCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookieParts = cookieHeader.split("; ");

  for (const part of cookieParts) {
    if (part.startsWith(`${csrfTokenCookieName}=`)) {
      return part.slice(csrfTokenCookieName.length + 1);
    }
  }

  return null;
}
