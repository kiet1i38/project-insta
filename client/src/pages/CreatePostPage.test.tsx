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

const profileWithCreatedPost = {
  avatarUrl: "https://cdn.example.com/student-demo.png",
  bio: "Created a new post from the polished 8F screen.",
  counts: {
    followers: 12,
    following: 7,
    posts: 1
  },
  createdAt: demoUser.createdAt,
  displayName: demoUser.displayName,
  email: demoUser.email,
  id: demoUser.id,
  role: demoUser.role,
  status: demoUser.status,
  updatedAt: demoUser.updatedAt,
  username: demoUser.username
};

const createdPosts = [
  {
    authorId: demoUser.id,
    caption: "New polished feed post",
    createdAt: "2026-06-30T05:00:00.000Z",
    id: "post-created",
    imageUrl: "/uploads/post-created.png",
    updatedAt: "2026-06-30T05:00:00.000Z"
  }
];

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

describe("CreatePostPage", () => {
  it("uploads an image, submits the real create-post request, and redirects to profile", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "create-post-access-token",
            requestId: "req-create-post-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts" &&
          init?.method === "POST"
        ) {
          return jsonResponse(
            {
              post: createdPosts[0],
              requestId: "req-create-post"
            },
            201
          );
        }

        if (
          input === "http://localhost:3001/api/v1/users/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            profile: profileWithCreatedPost,
            requestId: "req-profile-after-create"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            posts: createdPosts,
            requestId: "req-posts-after-create"
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-create; path=/";
    window.history.pushState({}, "", "/create");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /create new post/i })
    ).toBeInTheDocument();

    const imageInput = screen.getByLabelText(/post image/i);
    const file = new File(["mock-image"], "demo.png", { type: "image/png" });

    await user.upload(imageInput, file);
    await user.type(
      screen.getByLabelText(/caption/i),
      "  New polished feed post  "
    );
    await user.click(screen.getByRole("button", { name: /share post/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/profile");
    });

    expect(await screen.findByText(/post created\./i)).toBeInTheDocument();
    expect(screen.getByText(/new polished feed post/i)).toBeInTheDocument();

    const createPostCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/posts" &&
        requestInit?.method === "POST"
    );

    expect(createPostCall).toBeDefined();

    const createPostInit = createPostCall?.[1];
    const createPostHeaders = createPostInit?.headers as Headers;
    const createPostBody = createPostInit?.body as FormData;
    const uploadedFile = createPostBody.get("image");

    expect(createPostHeaders).toBeInstanceOf(Headers);
    expect(createPostHeaders.get("Authorization")).toBe(
      "Bearer create-post-access-token"
    );
    expect(createPostBody.get("caption")).toBe("New polished feed post");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe("demo.png");
  });
});
