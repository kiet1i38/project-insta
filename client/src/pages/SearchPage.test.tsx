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

const firstPageResults = {
  pageInfo: {
    hasNextPage: true,
    limit: 2,
    nextCursor: "cursor-page-2",
    query: "ali"
  },
  requestId: "req-search-1",
  users: [
    {
      avatarUrl: "https://cdn.example.com/alice.png",
      bio: "Builds the search slice carefully.",
      displayName: "Alice Alpha",
      id: "user-alice",
      username: "alice_alpha"
    },
    {
      avatarUrl: "https://cdn.example.com/alina.png",
      bio: "Second active result.",
      displayName: "Alina Beta",
      id: "user-alina",
      username: "alina_beta"
    }
  ]
};

const secondPageResults = {
  pageInfo: {
    hasNextPage: false,
    limit: 2,
    nextCursor: null,
    query: "ali"
  },
  requestId: "req-search-2",
  users: [
    {
      avatarUrl: "https://cdn.example.com/research.png",
      bio: "Matches through display name only.",
      displayName: "Ali Researcher",
      id: "user-research",
      username: "research_friend"
    }
  ]
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

describe("Search UI", () => {
  it("submits a real search query, renders paginated results, and loads the next page", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "search-access-token",
            requestId: "req-search-refresh",
            user: demoUser
          });
        }

        if (
          typeof input === "string" &&
          input.startsWith("http://localhost:3001/api/v1/users/search?")
        ) {
          const requestUrl = new URL(input);
          const cursor = requestUrl.searchParams.get("cursor");
          const query = requestUrl.searchParams.get("q");
          const limit = requestUrl.searchParams.get("limit");

          expect(query).toBe("ali");
          expect(limit).toBe("2");

          if (cursor === null) {
            return jsonResponse(firstPageResults);
          }

          expect(cursor).toBe("cursor-page-2");
          return jsonResponse(secondPageResults);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-search; path=/";
    window.history.pushState({}, "", "/search");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /search people/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^search$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await user.type(
      screen.getByLabelText(/search by username or display name/i),
      "  ali  "
    );
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/alice alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/alina beta/i)).toBeInTheDocument();
    expect(screen.queryByText(/ali researcher/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load more results/i })
    ).toBeInTheDocument();

    const firstSearchCall = fetchSpy.mock.calls.find(
      ([requestInput]) =>
        typeof requestInput === "string" &&
        requestInput.includes("/api/v1/users/search?q=ali&limit=2")
    );

    expect(firstSearchCall).toBeDefined();

    const firstSearchHeaders = firstSearchCall?.[1]?.headers as Headers;

    expect(firstSearchHeaders).toBeInstanceOf(Headers);
    expect(firstSearchHeaders.get("Authorization")).toBe(
      "Bearer search-access-token"
    );

    await user.click(
      screen.getByRole("button", { name: /load more results/i })
    );

    expect(await screen.findByText(/ali researcher/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more results/i })).not.toBeInTheDocument();

    await waitFor(() => {
      const secondSearchCall = fetchSpy.mock.calls.find(
        ([requestInput]) =>
          typeof requestInput === "string" &&
          requestInput.includes(
            "/api/v1/users/search?q=ali&limit=2&cursor=cursor-page-2"
          )
      );

      expect(secondSearchCall).toBeDefined();
    });
  });
});
