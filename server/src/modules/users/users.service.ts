import { AppError } from "../../lib/appError.js";
import type {
  SearchUsersQueryInput,
  UpdateOwnProfileInput
} from "./users.schema.js";
import {
  findOwnProfileById,
  findUsersForSearch,
  type OwnProfileRecord,
  type SearchUserRecord,
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

type SearchUserDto = {
  avatarUrl: string | null;
  bio: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

type SearchUsersDto = {
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
    query: string;
  };
  users: SearchUserDto[];
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

function toSearchUserDto(user: SearchUserRecord): SearchUserDto {
  return {
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    displayName: user.displayName,
    id: user.id,
    username: user.username
  };
}

function encodeSearchCursor(user: SearchUserRecord): string {
  return Buffer.from(
    JSON.stringify({
      id: user.id,
      username: user.username
    }),
    "utf8"
  ).toString("base64url");
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

export async function searchUsers(
  input: SearchUsersQueryInput
): Promise<SearchUsersDto> {
  const searchedUsers = await findUsersForSearch({
    cursor: input.cursor,
    limit: input.limit,
    query: input.q
  });
  const hasNextPage = searchedUsers.length > input.limit;
  const visibleUsers = hasNextPage
    ? searchedUsers.slice(0, input.limit)
    : searchedUsers;
  const lastVisibleUser = visibleUsers.at(-1) ?? null;

  return {
    pageInfo: {
      hasNextPage,
      limit: input.limit,
      nextCursor:
        hasNextPage && lastVisibleUser ? encodeSearchCursor(lastVisibleUser) : null,
      query: input.q
    },
    users: visibleUsers.map(toSearchUserDto)
  };
}
