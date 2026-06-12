import { AppError } from "../../lib/appError.js";
import type { UpdateOwnProfileInput } from "./users.schema.js";
import {
  findOwnProfileById,
  type OwnProfileRecord,
  updateOwnProfileById
} from "./users.repository.js";

type OwnProfileDto = {
  avatarUrl: string | null;
  bio: string | null;
  counts: {
    followers: number;
    following: number;
    posts: number;
  };
  createdAt: Date;
  displayName: string | null;
  email: string;
  id: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  updatedAt: Date;
  username: string;
};

function createUserNotFoundError(): AppError {
  return new AppError(404, "USER_NOT_FOUND", "User not found.");
}

function toOwnProfileDto(profile: OwnProfileRecord): OwnProfileDto {
  return {
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    counts: {
      followers: profile._count.followers,
      following: profile._count.following,
      posts: profile._count.posts
    },
    createdAt: profile.createdAt,
    displayName: profile.displayName,
    email: profile.email,
    id: profile.id,
    role: profile.role,
    status: profile.status,
    updatedAt: profile.updatedAt,
    username: profile.username
  };
}

export async function getOwnProfile(userId: string): Promise<OwnProfileDto> {
  const profile = await findOwnProfileById(userId);

  if (!profile) {
    throw createUserNotFoundError();
  }

  return toOwnProfileDto(profile);
}

export async function updateOwnProfile(
  userId: string,
  input: UpdateOwnProfileInput
): Promise<OwnProfileDto> {
  const updatedProfile = await updateOwnProfileById(userId, input);

  if (!updatedProfile) {
    throw createUserNotFoundError();
  }

  return toOwnProfileDto(updatedProfile);
}
