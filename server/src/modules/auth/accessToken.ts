import { jwtVerify, SignJWT } from "jose";
import type { User } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";

const accessTokenSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);

export async function issueAccessToken(user: User): Promise<string> {
  return new SignJWT({
    role: user.role,
    status: user.status,
    username: user.username
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessTokenSecret);
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, accessTokenSecret, {
    algorithms: ["HS256"]
  });

  if (typeof payload.sub !== "string") {
    throw new Error("Access token payload is invalid.");
  }

  return {
    userId: payload.sub
  };
}
