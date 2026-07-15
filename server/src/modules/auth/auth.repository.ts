import type {
  Prisma,
  RefreshToken,
  User
} from "../../generated/prisma/client.js";
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

type LifecycleRequestContext = {
  ipAddress: string;
  requestId: string;
  userAgent: string | null;
};

type CreateEmailVerificationTokenInput = LifecycleRequestContext & {
  expiresAt: Date;
  tokenHash: string;
  userId: string;
};

type CreatePendingUserInput = Omit<
  CreateEmailVerificationTokenInput,
  "userId"
> & {
  displayName: string;
  email: string;
  passwordHash: string;
  username: string;
};

type AuthActionAttemptInput = {
  emailHash?: string;
  ipHash: string;
  maxAttempts: number;
  type: "EMAIL_VERIFICATION_CONFIRM" | "EMAIL_VERIFICATION_REQUEST";
  windowStartedAt: Date;
};

type PrismaTransactionClient = Prisma.TransactionClient;

function lifecycleAuditData(
  input: LifecycleRequestContext & {
    action:
      | "EMAIL_VERIFICATION_COMPLETED"
      | "EMAIL_VERIFICATION_DELIVERY_FAILED"
      | "EMAIL_VERIFICATION_REQUESTED";
    userId: string;
  }
) {
  return {
    action: input.action,
    actorId: input.userId,
    actorMetadata: {
      requestId: input.requestId
    },
    entityId: input.userId,
    entityType: "USER",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  };
}

async function createLifecycleAuditLog(
  client: PrismaTransactionClient,
  input: LifecycleRequestContext & {
    action:
      | "EMAIL_VERIFICATION_COMPLETED"
      | "EMAIL_VERIFICATION_DELIVERY_FAILED"
      | "EMAIL_VERIFICATION_REQUESTED";
    userId: string;
  }
): Promise<void> {
  await client.auditLog.create({
    data: lifecycleAuditData(input)
  });
}

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

export async function createPendingUserWithEmailVerificationToken(
  input: CreatePendingUserInput
): Promise<User> {
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        displayName: input.displayName,
        email: input.email,
        passwordHash: input.passwordHash,
        status: "PENDING_VERIFICATION",
        username: input.username
      }
    });

    await transaction.actionToken.create({
      data: {
        expiresAt: input.expiresAt,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: input.tokenHash,
        userId: user.id
      }
    });

    await createLifecycleAuditLog(transaction, {
      ...input,
      action: "EMAIL_VERIFICATION_REQUESTED",
      userId: user.id
    });

    return user;
  });
}

export async function findUserByIdentifier(
  identifier: string
): Promise<User | null> {
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

export async function findUserByUsername(
  username: string
): Promise<User | null> {
  return prisma.user.findUnique({
    where: { username }
  });
}

export async function findUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId }
  });
}

export async function createEmailVerificationToken(
  input: CreateEmailVerificationTokenInput
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const consumedAt = new Date();

    await transaction.actionToken.updateMany({
      where: {
        consumedAt: null,
        purpose: "EMAIL_VERIFICATION",
        userId: input.userId
      },
      data: {
        consumedAt
      }
    });

    await transaction.actionToken.create({
      data: {
        expiresAt: input.expiresAt,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: input.tokenHash,
        userId: input.userId
      }
    });

    await createLifecycleAuditLog(transaction, {
      ...input,
      action: "EMAIL_VERIFICATION_REQUESTED"
    });
  });
}

export async function consumeEmailVerificationToken(
  input: LifecycleRequestContext & {
    tokenHash: string;
  }
): Promise<User | null> {
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const token = await transaction.actionToken.findFirst({
      where: {
        consumedAt: null,
        expiresAt: {
          gt: now
        },
        purpose: "EMAIL_VERIFICATION",
        tokenHash: input.tokenHash
      }
    });

    if (!token) {
      return null;
    }

    const consumedToken = await transaction.actionToken.updateMany({
      where: {
        consumedAt: null,
        expiresAt: {
          gt: now
        },
        id: token.id
      },
      data: {
        consumedAt: now
      }
    });

    if (consumedToken.count !== 1) {
      return null;
    }

    const verifiedUser = await transaction.user.updateMany({
      where: {
        id: token.userId,
        status: "PENDING_VERIFICATION"
      },
      data: {
        emailVerifiedAt: now,
        status: "ACTIVE"
      }
    });

    if (verifiedUser.count !== 1) {
      return null;
    }

    const user = await transaction.user.findUnique({
      where: {
        id: token.userId
      }
    });

    if (!user) {
      return null;
    }

    await createLifecycleAuditLog(transaction, {
      ...input,
      action: "EMAIL_VERIFICATION_COMPLETED",
      userId: user.id
    });

    return user;
  });
}

export async function createEmailVerificationDeliveryFailureAuditLog(
  input: LifecycleRequestContext & { userId: string }
): Promise<void> {
  await createLifecycleAuditLog(prisma, {
    ...input,
    action: "EMAIL_VERIFICATION_DELIVERY_FAILED"
  });
}

function isTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

export async function createAuthActionAttemptIfAllowed(
  input: AuthActionAttemptInput
): Promise<boolean> {
  let lastConflict: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const ipAttemptCount = await transaction.authActionAttempt.count({
            where: {
              createdAt: {
                gte: input.windowStartedAt
              },
              ipHash: input.ipHash,
              type: input.type
            }
          });

          const emailAttemptCount = input.emailHash
            ? await transaction.authActionAttempt.count({
                where: {
                  createdAt: {
                    gte: input.windowStartedAt
                  },
                  emailHash: input.emailHash,
                  type: input.type
                }
              })
            : 0;

          if (
            ipAttemptCount >= input.maxAttempts ||
            emailAttemptCount >= input.maxAttempts
          ) {
            return false;
          }

          await transaction.authActionAttempt.create({
            data: {
              emailHash: input.emailHash,
              ipHash: input.ipHash,
              type: input.type
            }
          });

          return true;
        },
        {
          isolationLevel: "Serializable"
        }
      );
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === 2) {
        throw error;
      }

      lastConflict = error;
    }
  }

  throw lastConflict;
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

export async function revokeRefreshTokenFamily(
  familyId: string
): Promise<void> {
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
