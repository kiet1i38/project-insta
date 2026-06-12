import { prisma } from "../../db/prisma.js";

export async function createPostRecord(input: {
  authorId: string;
  caption: string | null | undefined;
  imageUrl: string;
}) {
  return prisma.post.create({
    data: {
      authorId: input.authorId,
      caption: input.caption ?? null,
      imageUrl: input.imageUrl
    }
  });
}
