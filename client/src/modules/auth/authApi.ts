import { getAccessToken } from "./accessTokenStore";

const defaultApiBaseUrl = "http://localhost:3001/api/v1";

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl
).replace(/\/+$/, "");

export type AuthUser = {
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  updatedAt: string;
  username: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

export type RegisterInput = {
  confirmPassword: string;
  displayName: string;
  email: string;
  password: string;
  username: string;
};

export type AuthSessionResponse = {
  accessToken: string;
  requestId: string;
  user: AuthUser;
};

export type OwnProfile = {
  avatarUrl: string | null;
  bio: string | null;
  counts: {
    followers: number;
    following: number;
    posts: number;
  };
  createdAt: string;
  displayName: string | null;
  email: string;
  id: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  updatedAt: string;
  username: string;
};

export type OwnProfileResponse = {
  profile: OwnProfile;
  requestId: string;
};

export type OwnPost = {
  authorId: string;
  caption: string | null;
  createdAt: string;
  id: string;
  imageUrl: string;
  updatedAt: string;
};

export type OwnPostsResponse = {
  posts: OwnPost[];
  requestId: string;
};

export type CreatePostInput = {
  caption?: string;
  image: File;
};

export type CreatePostResponse = {
  post: OwnPost;
  requestId: string;
};

export type FeedPostAuthor = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type FeedPost = {
  author: FeedPostAuthor;
  caption: string | null;
  createdAt: string;
  id: string;
  imageUrl: string;
  updatedAt: string;
};

export type FeedPageInfo = {
  hasNextPage: boolean;
  limit: number;
  nextCursor: string | null;
};

export type FeedPostsResponse = {
  pageInfo: FeedPageInfo;
  posts: FeedPost[];
  requestId: string;
};

export type PostDetailCommentAuthor = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type PostDetailComment = {
  author: PostDetailCommentAuthor;
  content: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type PostDetail = {
  author: FeedPostAuthor;
  caption: string | null;
  comments: PostDetailComment[];
  createdAt: string;
  id: string;
  imageUrl: string;
  updatedAt: string;
};

export type PostDetailResponse = {
  post: PostDetail;
  requestId: string;
};

export type FeedComment = {
  authorId: string;
  content: string;
  createdAt: string;
  id: string;
  postId: string;
  updatedAt: string;
};

export type CreateCommentInput = {
  content: string;
};

export type CreateCommentResponse = {
  comment: FeedComment;
  requestId: string;
};

export type PostLikeStateResponse = {
  postId: string;
  requestId: string;
  viewerHasLiked: boolean;
};

export type DeleteOwnPostResponse = {
  deletedPostId: string;
  requestId: string;
};

export type SearchUser = {
  avatarUrl: string | null;
  bio: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type SearchUsersResponse = {
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
    query: string;
  };
  requestId: string;
  users: SearchUser[];
};

export type ConversationPeer = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type ConversationMessagePreview = {
  content: string;
  createdAt: string;
  id: string;
  senderId: string;
};

export type ConversationSummary = {
  id: string;
  lastMessage: ConversationMessagePreview | null;
  peer: ConversationPeer;
  unreadCount: number;
  updatedAt: string;
};

export type ConversationsResponse = {
  conversations: ConversationSummary[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  requestId: string;
};

export type ConversationMessage = {
  content: string;
  conversationId: string;
  createdAt: string;
  id: string;
  sender: ConversationPeer;
};

export type ConversationReadState = {
  conversationId: string;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
};

export type ConversationThreadResponse = {
  conversation: {
    id: string;
    peer: ConversationPeer;
  };
  messages: ConversationMessage[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  readState: ConversationReadState;
  requestId: string;
};

export type CreateDirectConversationInput = {
  participantUserId: string;
};

export type GetConversationsInput = {
  cursor?: string | null;
  limit?: number;
};

export type GetConversationMessagesInput = {
  cursor?: string | null;
  limit?: number;
};

export type CreateConversationMessageInput = {
  content: string;
};

export type MarkConversationReadInput = {
  messageId: string;
};

export type ModerationReportStatus = "DISMISSED" | "PENDING" | "RESOLVED";

export type ModerationSortOrder = "newest" | "oldest";

export type ModerationReport = {
  createdAt: string;
  id: string;
  reason: string;
  reporter: {
    id: string;
    username: string;
  };
  resolvedAt: string | null;
  status: ModerationReportStatus;
  target: {
    comment: {
      author: {
        id: string;
        username: string;
      };
      content: string;
      id: string;
      isHidden: boolean;
      postId: string;
    } | null;
    post: {
      author: {
        id: string;
        username: string;
      };
      caption: string | null;
      id: string;
      imageUrl: string;
      isHidden: boolean;
    } | null;
    type: "COMMENT" | "POST" | "USER";
    user: {
      displayName: string | null;
      id: string;
      status: "ACTIVE" | "BANNED";
      username: string;
    } | null;
  };
};

export type ModerationQueueResponse = {
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  reports: ModerationReport[];
  requestId: string;
  summary: {
    pendingCount: number;
    resolvedCount: number;
  };
};

export type ModerationActionResponse = {
  moderationAction: {
    action: string;
    createdAt: string;
    id: string;
    note: string | null;
  };
  report: {
    id: string;
    resolvedAt: string;
    status: "DISMISSED" | "RESOLVED";
  };
  requestId: string;
};

export type GetModerationReportsInput = {
  cursor?: string | null;
  limit?: number;
  sort?: ModerationSortOrder;
  status?: ModerationReportStatus;
};

export type ModerationActionInput = {
  note?: string;
};

export const reportReasonValues = [
  "SPAM",
  "HARASSMENT",
  "HATE_SPEECH",
  "VIOLENCE",
  "NUDITY",
  "SELF_HARM",
  "IMPERSONATION",
  "MISINFORMATION",
  "OTHER"
] as const;

export type ReportReason = (typeof reportReasonValues)[number];

export type CreateReportInput = {
  reason: ReportReason;
  reportedCommentId?: string | null;
  reportedPostId?: string | null;
  reportedUserId?: string | null;
};

export type CreateReportResponse = {
  report: {
    createdAt: string;
    id: string;
    reason: ReportReason;
    reportedCommentId: string | null;
    reportedPostId: string | null;
    reportedUserId: string | null;
    reporterId: string;
    status: "DISMISSED" | "PENDING" | "RESOLVED";
  };
  requestId: string;
};

export type AuditLogActor = {
  id: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "BANNED";
  username: string;
};

export type AuditLogEntry = {
  action: string;
  actor: AuditLogActor | null;
  actorMetadata: unknown;
  createdAt: string;
  entityId: string | null;
  entityType: string | null;
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditLogListResponse = {
  auditLogs: AuditLogEntry[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  requestId: string;
};

export type GetAuditLogsInput = {
  action?: string;
  actorId?: string;
  cursor?: string | null;
  entityId?: string;
  entityType?: string;
  from?: string;
  limit?: number;
  sort?: ModerationSortOrder;
  to?: string;
};

export type UpdateOwnProfileInput = {
  avatarUrl?: string | null;
  bio?: string | null;
  displayName?: string;
};

export type SearchUsersInput = {
  cursor?: string | null;
  limit?: number;
  query: string;
};

export type GetFeedPostsInput = {
  cursor?: string | null;
  limit?: number;
};

export type RegisterResponse = {
  requestId: string;
  user: AuthUser;
};

type ApiErrorDetail = {
  message: string;
  path: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    details?: ApiErrorDetail[];
    message?: string;
  };
  requestId?: string;
};

export class ApiError extends Error {
  code: string;
  details: ApiErrorDetail[];
  requestId: string | null;
  status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
    requestId: string | null = null
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.status = status;
  }
}

const csrfCookieName =
  import.meta.env.PROD === true
    ? "__Host-cloneinsta-csrf"
    : "cloneinsta_csrf";

function expireCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function readCookie(name: string): string | null {
  const cookiePairs = document.cookie
    .split("; ")
    .filter((value) => value.length > 0);

  for (const pair of cookiePairs) {
    if (pair.startsWith(`${name}=`)) {
      return pair.slice(name.length + 1);
    }
  }

  return null;
}

async function parseJsonBody<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return null;
  }

  return (await response.json()) as T;
}

async function requestJson<T>(
  path: string,
  options: {
    body?: unknown;
    includeAccessToken?: boolean;
    includeCsrf?: boolean;
    method?: "DELETE" | "GET" | "PATCH" | "POST";
  } = {}
): Promise<T> {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.includeCsrf) {
    const csrfToken = readCookie(csrfCookieName);

    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  if (options.includeAccessToken) {
    const accessToken = getAccessToken();

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    headers,
    method: options.method ?? "GET"
  });

  const jsonBody = await parseJsonBody<ApiErrorBody | T>(response);

  if (!response.ok) {
    const errorBody = jsonBody as ApiErrorBody | null;

    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "UNKNOWN_API_ERROR",
      errorBody?.error?.message ?? "Something went wrong.",
      errorBody?.error?.details ?? [],
      errorBody?.requestId ?? null
    );
  }

  if (jsonBody === null) {
    throw new ApiError(
      response.status,
      "EMPTY_RESPONSE",
      "Expected a JSON response from the API."
    );
  }

  return jsonBody as T;
}

function setOptionalSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined
) {
  if (typeof value !== "string") {
    return;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return;
  }

  params.set(key, trimmedValue);
}

function toApiDatetimeInput(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return undefined;
  }

  if (trimmedValue.endsWith("Z")) {
    return trimmedValue;
  }

  return new Date(trimmedValue).toISOString();
}

export function hasStoredCsrfToken(): boolean {
  return readCookie(csrfCookieName) !== null;
}

export function clearStoredCsrfToken(): void {
  expireCookie(csrfCookieName);
}

export async function registerAuthUser(
  input: RegisterInput
): Promise<RegisterResponse> {
  return requestJson<RegisterResponse>("/auth/register", {
    body: input,
    method: "POST"
  });
}

export async function loginAuthUser(
  input: LoginInput
): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/auth/login", {
    body: input,
    method: "POST"
  });
}

export async function refreshAuthSession(): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/auth/refresh", {
    includeCsrf: true,
    method: "POST"
  });
}

export async function logoutAuthSession(): Promise<void> {
  const headers = new Headers();
  const csrfToken = readCookie(csrfCookieName);

  if (csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(`${apiBaseUrl}/auth/logout`, {
    credentials: "include",
    headers,
    method: "POST"
  });

  const jsonBody = await parseJsonBody<ApiErrorBody>(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      jsonBody?.error?.code ?? "UNKNOWN_API_ERROR",
      jsonBody?.error?.message ?? "Something went wrong.",
      jsonBody?.error?.details ?? [],
      jsonBody?.requestId ?? null
    );
  }
}

export async function getOwnProfile(): Promise<OwnProfileResponse> {
  return requestJson<OwnProfileResponse>("/users/me", {
    includeAccessToken: true,
    method: "GET"
  });
}

export async function updateOwnProfile(
  input: UpdateOwnProfileInput
): Promise<OwnProfileResponse> {
  return requestJson<OwnProfileResponse>("/users/me", {
    body: input,
    includeAccessToken: true,
    method: "PATCH"
  });
}

export async function getOwnPosts(): Promise<OwnPostsResponse> {
  return requestJson<OwnPostsResponse>("/posts/me", {
    includeAccessToken: true,
    method: "GET"
  });
}

export async function getFeedPosts(
  input: GetFeedPostsInput = {}
): Promise<FeedPostsResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(input.limit ?? 10));

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<FeedPostsResponse>(`/posts/feed?${params.toString()}`, {
    includeAccessToken: true,
    method: "GET"
  });
}

export async function getPostDetail(
  postId: string
): Promise<PostDetailResponse> {
  return requestJson<PostDetailResponse>(
    `/posts/${encodeURIComponent(postId)}`,
    {
      includeAccessToken: true,
      method: "GET"
    }
  );
}

export async function likePost(
  postId: string
): Promise<PostLikeStateResponse> {
  return requestJson<PostLikeStateResponse>(
    `/posts/${encodeURIComponent(postId)}/likes`,
    {
      includeAccessToken: true,
      method: "POST"
    }
  );
}

export async function unlikePost(
  postId: string
): Promise<PostLikeStateResponse> {
  return requestJson<PostLikeStateResponse>(
    `/posts/${encodeURIComponent(postId)}/likes`,
    {
      includeAccessToken: true,
      method: "DELETE"
    }
  );
}

export async function createComment(
  postId: string,
  input: CreateCommentInput
): Promise<CreateCommentResponse> {
  return requestJson<CreateCommentResponse>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    {
      body: input,
      includeAccessToken: true,
      method: "POST"
    }
  );
}

export async function deleteOwnPost(
  postId: string
): Promise<DeleteOwnPostResponse> {
  return requestJson<DeleteOwnPostResponse>(
    `/posts/${encodeURIComponent(postId)}`,
    {
      includeAccessToken: true,
      method: "DELETE"
    }
  );
}

export async function createPost(
  input: CreatePostInput
): Promise<CreatePostResponse> {
  const headers = new Headers();
  const accessToken = getAccessToken();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const formData = new FormData();
  formData.set("image", input.image);

  const trimmedCaption = input.caption?.trim();

  if (trimmedCaption) {
    formData.set("caption", trimmedCaption);
  }

  const response = await fetch(`${apiBaseUrl}/posts`, {
    body: formData,
    credentials: "include",
    headers,
    method: "POST"
  });

  const jsonBody = await parseJsonBody<ApiErrorBody | CreatePostResponse>(response);

  if (!response.ok) {
    const errorBody = jsonBody as ApiErrorBody | null;

    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "UNKNOWN_API_ERROR",
      errorBody?.error?.message ?? "Something went wrong.",
      errorBody?.error?.details ?? [],
      errorBody?.requestId ?? null
    );
  }

  if (jsonBody === null) {
    throw new ApiError(
      response.status,
      "EMPTY_RESPONSE",
      "Expected a JSON response from the API."
    );
  }

  return jsonBody as CreatePostResponse;
}

export async function searchUsers(
  input: SearchUsersInput
): Promise<SearchUsersResponse> {
  const params = new URLSearchParams();

  params.set("q", input.query.trim());
  params.set("limit", String(input.limit ?? 10));

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<SearchUsersResponse>(`/users/search?${params.toString()}`, {
    includeAccessToken: true,
    method: "GET"
  });
}

export async function createDirectConversation(
  input: CreateDirectConversationInput
): Promise<{
  conversation: ConversationSummary;
  requestId: string;
}> {
  return requestJson<{
    conversation: ConversationSummary;
    requestId: string;
  }>("/conversations", {
    body: input,
    includeAccessToken: true,
    method: "POST"
  });
}

export async function getConversations(
  input: GetConversationsInput = {}
): Promise<ConversationsResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(input.limit ?? 10));

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<ConversationsResponse>(
    `/conversations?${params.toString()}`,
    {
      includeAccessToken: true,
      method: "GET"
    }
  );
}

export async function getConversationMessages(
  conversationId: string,
  input: GetConversationMessagesInput = {}
): Promise<ConversationThreadResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(input.limit ?? 20));

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<ConversationThreadResponse>(
    `/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      includeAccessToken: true,
      method: "GET"
    }
  );
}

export async function createConversationMessage(
  conversationId: string,
  input: CreateConversationMessageInput
): Promise<{
  message: ConversationMessage;
  requestId: string;
}> {
  return requestJson<{
    message: ConversationMessage;
    requestId: string;
  }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    body: {
      content: input.content
    },
    includeAccessToken: true,
    method: "POST"
  });
}

export async function markConversationRead(
  conversationId: string,
  input: MarkConversationReadInput
): Promise<{
  readState: ConversationReadState;
  requestId: string;
}> {
  return requestJson<{
    readState: ConversationReadState;
    requestId: string;
  }>(`/conversations/${encodeURIComponent(conversationId)}/read`, {
    body: input,
    includeAccessToken: true,
    method: "POST"
  });
}

export async function createReport(
  input: CreateReportInput
): Promise<CreateReportResponse> {
  return requestJson<CreateReportResponse>("/reports", {
    body: input,
    includeAccessToken: true,
    method: "POST"
  });
}

export async function getModerationReports(
  input: GetModerationReportsInput = {}
): Promise<ModerationQueueResponse> {
  const params = new URLSearchParams();

  params.set("status", input.status ?? "PENDING");
  params.set("sort", input.sort ?? "newest");
  params.set("limit", String(input.limit ?? 10));

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<ModerationQueueResponse>(
    `/admin/reports?${params.toString()}`,
    {
      includeAccessToken: true,
      method: "GET"
    }
  );
}

export async function dismissModerationReport(
  reportId: string,
  input: ModerationActionInput = {}
): Promise<ModerationActionResponse> {
  const body =
    typeof input.note === "string" && input.note.trim().length > 0
      ? { note: input.note.trim() }
      : {};

  return requestJson<ModerationActionResponse>(
    `/admin/reports/${encodeURIComponent(reportId)}/dismiss`,
    {
      body,
      includeAccessToken: true,
      method: "POST"
    }
  );
}

export async function hideModerationReportTarget(
  reportId: string,
  input: { note: string }
): Promise<ModerationActionResponse> {
  return requestJson<ModerationActionResponse>(
    `/admin/reports/${encodeURIComponent(reportId)}/hide-content`,
    {
      body: {
        note: input.note.trim()
      },
      includeAccessToken: true,
      method: "POST"
    }
  );
}

export async function banModerationReportTargetUser(
  reportId: string,
  input: { note: string }
): Promise<ModerationActionResponse> {
  return requestJson<ModerationActionResponse>(
    `/admin/reports/${encodeURIComponent(reportId)}/ban-user`,
    {
      body: {
        note: input.note.trim()
      },
      includeAccessToken: true,
      method: "POST"
    }
  );
}

export async function getAuditLogs(
  input: GetAuditLogsInput = {}
): Promise<AuditLogListResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(input.limit ?? 20));
  params.set("sort", input.sort ?? "newest");
  setOptionalSearchParam(params, "action", input.action);
  setOptionalSearchParam(params, "actorId", input.actorId);
  setOptionalSearchParam(params, "entityId", input.entityId);
  setOptionalSearchParam(params, "entityType", input.entityType);

  const from = toApiDatetimeInput(input.from);
  const to = toApiDatetimeInput(input.to);

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return requestJson<AuditLogListResponse>(
    `/admin/audit-logs?${params.toString()}`,
    {
      includeAccessToken: true,
      method: "GET"
    }
  );
}
