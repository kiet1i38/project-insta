import type { User } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

type CreateUserInput = {
  displayName: string;
  email: string;
  passwordHash: string;
  username: string;
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
