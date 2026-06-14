import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthSessionProvider } from "./modules/auth/authSession";
import { resetBootstrapSessionState } from "./modules/auth/authSessionBootstrap";
import { useAuthSession } from "./modules/auth/authSessionContext";

const demoUser = {
  createdAt: "2026-06-12T10:00:00.000Z",
  displayName: "Student Demo",
  email: "student.demo@example.com",
  id: "user-123",
  role: "USER" as const,
  status: "ACTIVE" as const,
  updatedAt: "2026-06-12T10:00:00.000Z",
  username: "student_demo"
};

const emptyFeedResponse = {
  pageInfo: {
    hasNextPage: false,
    limit: 2,
    nextCursor: null
  },
  posts: [],
  requestId: "req-empty-feed"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function SessionProbe() {
  const { status, user } = useAuthSession();

  if (status === "bootstrapping") {
    return <p>Bootstrapping session</p>;
  }

  if (status === "authenticated" && user) {
    return <p>{`Signed in as @${user.username}`}</p>;
  }

  return <p>Guest session</p>;
}

afterEach(() => {
  document.cookie =
    "cloneinsta_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  resetBootstrapSessionState();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("App", () => {
  it("redirects a guest from the protected feed to login without calling refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /build your original social app/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /register/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: /log back into your photo-sharing workspace/i
      })
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /log in to continue\./i
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("restores a saved session from the refresh cookie on page load", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          accessToken: "access-token-456",
          requestId: "req-refresh",
          user: demoUser
        })
      );

    document.cookie = "cloneinsta_csrf=csrf-123; path=/";

    render(
      <StrictMode>
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>
      </StrictMode>
    );

    expect(await screen.findByText(/signed in as @student_demo/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/auth/refresh",
        expect.objectContaining({
          credentials: "include",
          method: "POST"
        })
      );
    });

    const refreshInit = fetchSpy.mock.calls[0]?.[1];
    const headers = refreshInit?.headers;

    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("X-CSRF-Token")).toBe("csrf-123");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not show guest forms when an authenticated user visits /login directly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "access-token-789",
          requestId: "req-refresh-authenticated",
          user: demoUser
        });
      }

      if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
        return jsonResponse(emptyFeedResponse);
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    document.cookie = "cloneinsta_csrf=csrf-456; path=/";
    window.history.pushState({}, "", "/login");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /^your feed$/i
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /log back into your photo-sharing workspace/i
      })
    ).not.toBeInTheDocument();
  });

  it("logs out an authenticated session and redirects back to login", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "access-token-logout",
            requestId: "req-refresh-logout",
            user: demoUser
          });
        }

        if (input === "http://localhost:3001/api/v1/auth/logout") {
          return new Response(null, {
            status: 204
          });
        }

        if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
          return jsonResponse(emptyFeedResponse);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-logout; path=/";

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: /^your feed$/i
      })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(
      await screen.findByRole("heading", {
        name: /log back into your photo-sharing workspace/i
      })
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /you have logged out\./i
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/auth/logout",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );

    const logoutCall = fetchSpy.mock.calls.find(
      ([requestInput]) => requestInput === "http://localhost:3001/api/v1/auth/logout"
    );
    const logoutInit = logoutCall?.[1];
    const headers = logoutInit?.headers;

    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("X-CSRF-Token")).toBe("csrf-logout");
    expect(document.cookie).not.toContain("cloneinsta_csrf=");
  });

  it("returns a guest to the originally requested protected search route after login", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "http://localhost:3001/api/v1/auth/login") {
        return jsonResponse({
          accessToken: "access-token-search-return",
          requestId: "req-login-search-return",
          user: demoUser
        });
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    window.history.pushState({}, "", "/search");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /log back into your photo-sharing workspace/i
      })
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email or username/i), "alice_demo");
    await user.type(screen.getByLabelText(/^password$/i), "UserDemo123!");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));

    expect(
      await screen.findByRole("heading", { name: /search people/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.pathname).toBe("/search");
    });
  });
});
