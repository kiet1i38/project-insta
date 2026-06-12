import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type { UpdateOwnProfileInput } from "./users.schema.js";

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
      posts: true
    }
  }
} satisfies Prisma.UserSelect;

export type OwnProfileRecord = Prisma.UserGetPayload<{
  select: typeof ownProfileSelect;
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
