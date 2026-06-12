import type { RefreshToken, User } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

type CreateUserInput = {
  displayName: string;
  email: string;
  passwordHash: string;
  username: string;
};

type CreateRefreshTokenInput = {
  expiresAt: Date;
  familyId: string;
  tokenHash: string;
  tokenId: string;
  userId: string;
};

export async function createUserRecord(input: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: {
      displayName: input.displayName,
      email: input.email,
      passwordHash: input.passwordHash,
      username: input.username
    }
  });
}

export async function findUserByIdentifier(identifier: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }]
    }
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email }
  });
}

export async function findUserByUsername(username: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { username }
  });
}

export async function findUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId }
  });
}

export async function createRefreshTokenRecord(
  input: CreateRefreshTokenInput
): Promise<RefreshToken> {
  return prisma.refreshToken.create({
    data: {
      expiresAt: input.expiresAt,
      familyId: input.familyId,
      id: input.tokenId,
      tokenHash: input.tokenHash,
      userId: input.userId
    }
  });
}

export async function findRefreshTokenRecordById(
  tokenId: string
): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({
    where: { id: tokenId }
  });
}

export async function rotateRefreshTokenRecord(
  currentTokenId: string,
  nextToken: CreateRefreshTokenInput
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const revokedAt = new Date();
    const revokeResult = await tx.refreshToken.updateMany({
      where: {
        id: currentTokenId,
        revokedAt: null
      },
      data: {
        revokedAt
      }
    });

    if (revokeResult.count !== 1) {
      return false;
    }

    await tx.refreshToken.create({
      data: {
        expiresAt: nextToken.expiresAt,
        familyId: nextToken.familyId,
        id: nextToken.tokenId,
        tokenHash: nextToken.tokenHash,
        userId: nextToken.userId
      }
    });

    return true;
  });
}

export async function revokeRefreshTokenFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      familyId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function revokeRefreshTokenRecord(tokenId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      id: tokenId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}
