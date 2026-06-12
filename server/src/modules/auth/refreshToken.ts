import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.js";

const refreshTokenSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET);
const refreshTokenLifetimeMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export const refreshTokenCookieName =
  env.NODE_ENV === "production"
    ? "__Host-cloneinsta-refresh"
    : "cloneinsta_refresh";

type VerifiedRefreshToken = {
  expiresAt: Date;
  tokenId: string;
  userId: string;
};

function hashRefreshTokenValue(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function hashRefreshToken(token: string): string {
  return hashRefreshTokenValue(token).toString("hex");
}

export function verifyRefreshTokenHash(
  token: string,
  storedTokenHash: string
): boolean {
  const providedHash = hashRefreshTokenValue(token);
  const expectedHash = Buffer.from(storedTokenHash, "hex");

  if (providedHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(providedHash, expectedHash);
}

export async function issueRefreshToken(userId: string): Promise<{
  expiresAt: Date;
  token: string;
  tokenHash: string;
  tokenId: string;
}> {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + refreshTokenLifetimeMs);

  const token = await new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_DAYS}d`)
    .sign(refreshTokenSecret);

  return {
    expiresAt,
    token,
    tokenHash: hashRefreshToken(token),
    tokenId
  };
}

export async function verifyRefreshToken(
  token: string
): Promise<VerifiedRefreshToken> {
  const { payload } = await jwtVerify(token, refreshTokenSecret, {
    algorithms: ["HS256"]
  });

  if (
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Refresh token payload is invalid.");
  }

  return {
    expiresAt: new Date(payload.exp * 1000),
    tokenId: payload.jti,
    userId: payload.sub
  };
}

export function setRefreshTokenCookie(
  res: Response,
  token: string,
  expiresAt: Date
): void {
  const cookieOptions: CookieOptions = {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: env.NODE_ENV === "production"
  };

  res.cookie(refreshTokenCookieName, token, cookieOptions);
}

export function clearRefreshTokenCookie(res: Response): void {
  const cookieOptions: CookieOptions = {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: env.NODE_ENV === "production"
  };

  res.cookie(refreshTokenCookieName, "", cookieOptions);
}

export function readRefreshTokenCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookieParts = cookieHeader.split("; ");

  for (const part of cookieParts) {
    if (part.startsWith(`${refreshTokenCookieName}=`)) {
      return part.slice(refreshTokenCookieName.length + 1);
    }
  }

  return null;
}
