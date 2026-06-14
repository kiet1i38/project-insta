import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

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

const firstFeedPage = {
  pageInfo: {
    hasNextPage: true,
    limit: 2,
    nextCursor: "feed-cursor-page-2"
  },
  posts: [
    {
      author: {
        avatarUrl: "https://cdn.example.com/alice.png",
        displayName: "Alice Demo",
        id: "author-alice",
        username: "alice_demo"
      },
      caption: "Latest photo walk",
      createdAt: "2026-06-14T08:00:00.000Z",
      id: "post-1",
      imageUrl: "https://cdn.example.com/posts/post-1.png",
      updatedAt: "2026-06-14T08:00:00.000Z"
    },
    {
      author: {
        avatarUrl: null,
        displayName: "Bob Demo",
        id: "author-bob",
        username: "bob_demo"
      },
      caption: "Backend checkpoint fuel",
      createdAt: "2026-06-13T11:30:00.000Z",
      id: "post-2",
      imageUrl: "https://cdn.example.com/posts/post-2.png",
      updatedAt: "2026-06-13T11:30:00.000Z"
    }
  ],
  requestId: "req-feed-1"
};

const secondFeedPage = {
  pageInfo: {
    hasNextPage: false,
    limit: 2,
    nextCursor: null
  },
  posts: [
    {
      author: {
        avatarUrl: "https://cdn.example.com/charlie.png",
        displayName: "Charlie Demo",
        id: "author-charlie",
        username: "charlie_demo"
      },
      caption: "Third page card",
      createdAt: "2026-06-12T09:15:00.000Z",
      id: "post-3",
      imageUrl: "https://cdn.example.com/posts/post-3.png",
      updatedAt: "2026-06-12T09:15:00.000Z"
    }
  ],
  requestId: "req-feed-2"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

afterEach(() => {
  document.cookie =
    "cloneinsta_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Feed UI", () => {
  it("renders real feed cards from the backend and loads the next page", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "feed-access-token",
            requestId: "req-feed-refresh",
            user: demoUser
          });
        }

        if (
          typeof input === "string" &&
          input.startsWith("http://localhost:3001/api/v1/posts/feed?")
        ) {
          const requestUrl = new URL(input);
          const cursor = requestUrl.searchParams.get("cursor");
          const limit = requestUrl.searchParams.get("limit");

          expect(limit).toBe("2");

          if (cursor === null) {
            return jsonResponse(firstFeedPage);
          }

          expect(cursor).toBe("feed-cursor-page-2");
          return jsonResponse(secondFeedPage);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-feed; path=/";
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /^your feed$/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^feed$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByText(/^latest photo walk$/i)).toBeInTheDocument();
    expect(screen.getByText(/^backend checkpoint fuel$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load more posts/i })
    ).toBeInTheDocument();

    const firstFeedCall = fetchSpy.mock.calls.find(
      ([requestInput]) =>
        typeof requestInput === "string" &&
        requestInput.includes("/api/v1/posts/feed?limit=2")
    );

    expect(firstFeedCall).toBeDefined();

    const firstFeedHeaders = firstFeedCall?.[1]?.headers as Headers;

    expect(firstFeedHeaders).toBeInstanceOf(Headers);
    expect(firstFeedHeaders.get("Authorization")).toBe(
      "Bearer feed-access-token"
    );

    await user.click(screen.getByRole("button", { name: /load more posts/i }));

    expect(await screen.findByText(/third page card/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /load more posts/i })
    ).not.toBeInTheDocument();

    await waitFor(() => {
      const secondFeedCall = fetchSpy.mock.calls.find(
        ([requestInput]) =>
          typeof requestInput === "string" &&
          requestInput.includes(
            "/api/v1/posts/feed?limit=2&cursor=feed-cursor-page-2"
          )
      );

      expect(secondFeedCall).toBeDefined();
    });
  });

  it("shows an empty feed state when no visible posts are available yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "feed-access-token",
          requestId: "req-feed-refresh",
          user: demoUser
        });
      }

      if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
        return jsonResponse({
          pageInfo: {
            hasNextPage: false,
            limit: 2,
            nextCursor: null
          },
          posts: [],
          requestId: "req-feed-empty"
        });
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    document.cookie = "cloneinsta_csrf=csrf-feed; path=/";
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /^your feed$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your feed is empty right now\./i)
    ).toBeInTheDocument();
  });

  it("shows a controlled error state when the feed request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "feed-access-token",
          requestId: "req-feed-refresh",
          user: demoUser
        });
      }

      if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
        return jsonResponse(
          {
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Something went wrong."
            },
            requestId: "req-feed-error"
          },
          500
        );
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    document.cookie = "cloneinsta_csrf=csrf-feed; path=/";
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(
      await screen.findByRole("status")
    ).toHaveTextContent(/something went wrong\./i);
  });

  it("toggles like state for a feed card through the live backend route", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "feed-access-token",
            requestId: "req-feed-refresh",
            user: demoUser
          });
        }

        if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
          return jsonResponse({
            pageInfo: {
              hasNextPage: false,
              limit: 2,
              nextCursor: null
            },
            posts: [firstFeedPage.posts[0]],
            requestId: "req-feed-like"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-1/likes" &&
          init?.method === "POST"
        ) {
          return jsonResponse({
            postId: "post-1",
            requestId: "req-like-on",
            viewerHasLiked: true
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-1/likes" &&
          init?.method === "DELETE"
        ) {
          return jsonResponse({
            postId: "post-1",
            requestId: "req-like-off",
            viewerHasLiked: false
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-feed; path=/";
    window.history.pushState({}, "", "/");

    render(<App />);

    const likeButton = await screen.findByRole("button", {
      name: /like latest photo walk/i
    });

    await user.click(likeButton);

    expect(
      await screen.findByRole("button", { name: /unlike latest photo walk/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/you liked this post\./i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /unlike latest photo walk/i })
    );

    expect(
      await screen.findByRole("button", { name: /like latest photo walk/i })
    ).toBeInTheDocument();

    const likeCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/posts/post-1/likes" &&
        requestInit?.method === "POST"
    );

    expect(likeCall).toBeDefined();

    const likeHeaders = likeCall?.[1]?.headers as Headers;

    expect(likeHeaders).toBeInstanceOf(Headers);
    expect(likeHeaders.get("Authorization")).toBe(
      "Bearer feed-access-token"
    );
  });

  it("validates and submits a new comment for a feed card", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "feed-access-token",
            requestId: "req-feed-refresh",
            user: demoUser
          });
        }

        if (input === "http://localhost:3001/api/v1/posts/feed?limit=2") {
          return jsonResponse({
            pageInfo: {
              hasNextPage: false,
              limit: 2,
              nextCursor: null
            },
            posts: [firstFeedPage.posts[0]],
            requestId: "req-feed-comment"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-1/comments" &&
          init?.method === "POST"
        ) {
          return jsonResponse({
            comment: {
              authorId: demoUser.id,
              content: "First feed comment",
              createdAt: "2026-06-14T09:15:00.000Z",
              id: "comment-1",
              postId: "post-1",
              updatedAt: "2026-06-14T09:15:00.000Z"
            },
            requestId: "req-comment-create"
          }, 201);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-feed; path=/";
    window.history.pushState({}, "", "/");

    render(<App />);

    const commentInput = await screen.findByLabelText(
      /^comment on latest photo walk$/i
    );

    await user.type(commentInput, "   ");
    await user.click(screen.getByRole("button", { name: /post comment on latest photo walk/i }));

    expect(
      await screen.findByText(/write a comment before posting\./i)
    ).toBeInTheDocument();

    await user.clear(commentInput);
    await user.type(commentInput, "  First feed comment  ");
    await user.click(screen.getByRole("button", { name: /post comment on latest photo walk/i }));

    expect(await screen.findByText(/first feed comment/i)).toBeInTheDocument();

    const commentCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/posts/post-1/comments" &&
        requestInit?.method === "POST"
    );

    expect(commentCall).toBeDefined();

    const commentHeaders = commentCall?.[1]?.headers as Headers;
    const commentBody = JSON.parse((commentCall?.[1]?.body as string) ?? "{}") as {
      content?: string;
    };

    expect(commentHeaders).toBeInstanceOf(Headers);
    expect(commentHeaders.get("Authorization")).toBe(
      "Bearer feed-access-token"
    );
    expect(commentBody).toEqual({
      content: "First feed comment"
    });
  });
});
