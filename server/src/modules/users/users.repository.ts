import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  SearchUsersCursor,
  UpdateOwnProfileInput
} from "./users.schema.js";

const ownProfileSelect = {
  avatarUrl: true,
  bio: true,
  createdAt: true,
  displayName: true,
  email: true,
  id: true,
  role: true,
  status: true,
  updatedAt: true,
  username: true,
  _count: {
    select: {
      followers: true,
      following: true,
      posts: {
        where: {
          deletedAt: null,
          isHidden: false
        }
      }
    }
  }
} satisfies Prisma.UserSelect;

export type OwnProfileRecord = Prisma.UserGetPayload<{
  select: typeof ownProfileSelect;
}>;

const searchUserSelect = {
  avatarUrl: true,
  bio: true,
  displayName: true,
  id: true,
  username: true
} satisfies Prisma.UserSelect;

export type SearchUserRecord = Prisma.UserGetPayload<{
  select: typeof searchUserSelect;
}>;

const activeUserIdentitySelect = {
  id: true
} satisfies Prisma.UserSelect;

export type ActiveUserIdentityRecord = Prisma.UserGetPayload<{
  select: typeof activeUserIdentitySelect;
}>;

export async function findOwnProfileById(
  userId: string
): Promise<OwnProfileRecord | null> {
  return prisma.user.findUnique({
    select: ownProfileSelect,
    where: { id: userId }
  });
}

export async function updateOwnProfileById(
  userId: string,
  input: UpdateOwnProfileInput
): Promise<OwnProfileRecord | null> {
  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.user.updateMany({
      data: input,
      where: { id: userId }
    });

    if (updateResult.count !== 1) {
      return null;
    }

    return tx.user.findUnique({
      select: ownProfileSelect,
      where: { id: userId }
    });
  });
}

export async function findActiveUserById(
  userId: string
): Promise<ActiveUserIdentityRecord | null> {
  return prisma.user.findFirst({
    select: activeUserIdentitySelect,
    where: {
      id: userId,
      status: "ACTIVE"
    }
  });
}

export async function createFollowRelationship(input: {
  followerId: string;
  followingId: string;
}) {
  await prisma.follow.createMany({
    data: [input],
    skipDuplicates: true
  });
}

export async function deleteFollowRelationship(input: {
  followerId: string;
  followingId: string;
}) {
  await prisma.follow.deleteMany({
    where: {
      followerId: input.followerId,
      followingId: input.followingId
    }
  });
}

export async function createUserBlockRelationship(input: {
  blockedUserId: string;
  blockerId: string;
}): Promise<boolean> {
  const result = await prisma.userBlock.createMany({
    data: input,
    skipDuplicates: true
  });

  return result.count === 1;
}

export async function deleteUserBlockRelationship(input: {
  blockedUserId: string;
  blockerId: string;
}): Promise<boolean> {
  const result = await prisma.userBlock.deleteMany({
    where: input
  });

  return result.count === 1;
}

export async function hasUserBlockRelationship(input: {
  firstUserId: string;
  secondUserId: string;
}): Promise<boolean> {
  const count = await prisma.userBlock.count({
    where: {
      OR: [
        {
          blockedUserId: input.secondUserId,
          blockerId: input.firstUserId
        },
        {
          blockedUserId: input.firstUserId,
          blockerId: input.secondUserId
        }
      ]
    }
  });

  return count > 0;
}

export async function createUserAuditLogRecord(input: {
  action: string;
  actorId: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      actorMetadata: {
        targetUserId: input.entityId
      },
      entityId: input.entityId,
      entityType: "USER",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    }
  });
}

export async function findUsersForSearch(input: {
  cursor?: SearchUsersCursor;
  limit: number;
  query: string;
}): Promise<SearchUserRecord[]> {
  const paginationFilter = input.cursor
    ? {
        OR: [
          {
            username: {
              gt: input.cursor.username
            }
          },
          {
            AND: [
              {
                username: input.cursor.username
              },
              {
                id: {
                  gt: input.cursor.id
                }
              }
            ]
          }
        ]
      }
    : undefined;

  return prisma.user.findMany({
    orderBy: [{ username: "asc" }, { id: "asc" }],
    select: searchUserSelect,
    take: input.limit + 1,
    where: {
      AND: [
        {
          status: "ACTIVE"
        },
        {
          OR: [
            {
              username: {
                contains: input.query,
                mode: "insensitive"
              }
            },
            {
              displayName: {
                contains: input.query,
                mode: "insensitive"
              }
            }
          ]
        },
        ...(paginationFilter ? [paginationFilter] : [])
      ]
    }
  });
}
