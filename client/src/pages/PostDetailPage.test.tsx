import { render, screen, waitFor, within } from "@testing-library/react";
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

const postDetailResponse = {
  post: {
    author: {
      avatarUrl: "https://cdn.example.com/author-detail.png",
      displayName: "Author Detail",
      id: "author-1",
      username: "author_detail"
    },
    caption: "Post detail target",
    comments: [
      {
        author: {
          avatarUrl: "https://cdn.example.com/commenter-1.png",
          displayName: "Commenter One",
          id: "commenter-1",
          username: "commenter_one"
        },
        content: "Older visible comment",
        createdAt: "2026-06-30T10:10:00.000Z",
        id: "comment-1",
        updatedAt: "2026-06-30T10:10:00.000Z"
      },
      {
        author: {
          avatarUrl: null,
          displayName: "Commenter Two",
          id: "commenter-2",
          username: "commenter_two"
        },
        content: "Newer visible comment",
        createdAt: "2026-06-30T10:12:00.000Z",
        id: "comment-2",
        updatedAt: "2026-06-30T10:12:00.000Z"
      }
    ],
    createdAt: "2026-06-30T10:00:00.000Z",
    id: "post-1",
    imageUrl: "https://cdn.example.com/posts/post-detail-target.png",
    updatedAt: "2026-06-30T10:00:00.000Z"
  },
  requestId: "req-post-detail"
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

describe("Post detail UI", () => {
  it("renders a deep-linked post detail page with the visible comment history", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "detail-access-token",
            requestId: "req-detail-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-1" &&
          init?.method === "GET"
        ) {
          return jsonResponse(postDetailResponse);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-detail; path=/";
    window.history.pushState({}, "", "/posts/post-1");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /post detail/i })
    ).toBeInTheDocument();
    expect(await screen.findByText(/post detail target/i)).toBeInTheDocument();
    expect(screen.getByText(/author detail/i)).toBeInTheDocument();
    expect(screen.getByText(/older visible comment/i)).toBeInTheDocument();
    expect(screen.getByText(/newer visible comment/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /report post/i })
    ).toBeInTheDocument();

    const detailCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/posts/post-1" &&
        requestInit?.method === "GET"
    );

    expect(detailCall).toBeDefined();

    const detailHeaders = detailCall?.[1]?.headers as Headers;

    expect(detailHeaders).toBeInstanceOf(Headers);
    expect(detailHeaders.get("Authorization")).toBe(
      "Bearer detail-access-token"
    );
  });

  it("opens the report modal and submits a post report through the live API contract", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "detail-access-token",
            requestId: "req-detail-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-1" &&
          init?.method === "GET"
        ) {
          return jsonResponse(postDetailResponse);
        }

        if (
          input === "http://localhost:3001/api/v1/reports" &&
          init?.method === "POST"
        ) {
          return jsonResponse(
            {
              report: {
                createdAt: "2026-06-30T10:20:00.000Z",
                id: "report-1",
                reason: "SPAM",
                reportedCommentId: null,
                reportedPostId: "post-1",
                reportedUserId: null,
                reporterId: demoUser.id,
                status: "PENDING"
              },
              requestId: "req-report-create"
            },
            201
          );
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-detail; path=/";
    window.history.pushState({}, "", "/posts/post-1");

    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /report post/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /report this post/i
    });

    await user.selectOptions(
      within(dialog).getByLabelText(/^reason$/i),
      "SPAM"
    );
    await user.click(
      within(dialog).getByRole("button", { name: /submit report/i })
    );

    expect(await screen.findByText(/report submitted\./i)).toBeInTheDocument();

    const reportCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/reports" &&
        requestInit?.method === "POST"
    );

    expect(reportCall).toBeDefined();

    const reportHeaders = reportCall?.[1]?.headers as Headers;
    const reportBody = JSON.parse((reportCall?.[1]?.body as string) ?? "{}") as {
      reason?: string;
      reportedPostId?: string;
    };

    expect(reportHeaders).toBeInstanceOf(Headers);
    expect(reportHeaders.get("Authorization")).toBe(
      "Bearer detail-access-token"
    );
    expect(reportBody).toEqual({
      reason: "SPAM",
      reportedPostId: "post-1"
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /report this post/i })
      ).not.toBeInTheDocument();
    });
  });
});
