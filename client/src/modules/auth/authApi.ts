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
    method?: "GET" | "PATCH" | "POST";
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
