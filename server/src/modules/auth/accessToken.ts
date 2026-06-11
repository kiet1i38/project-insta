import { SignJWT } from "jose";
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
