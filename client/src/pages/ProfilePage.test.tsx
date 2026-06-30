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

const initialProfile = {
  avatarUrl: "https://cdn.example.com/student-demo.png",
  bio: "Building CloneInsta slice by slice.",
  counts: {
    followers: 12,
    following: 7,
    posts: 0
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

const updatedProfile = {
  ...initialProfile,
  avatarUrl: "https://cdn.example.com/student-demo-updated.png",
  bio: "Updated bio for the profile-edit slice.",
  displayName: "Updated Student Demo"
};

const profileWithPosts = {
  ...initialProfile,
  counts: {
    followers: 12,
    following: 7,
    posts: 2
  }
};

const initialPosts = [
  {
    authorId: demoUser.id,
    caption: "Newest workshop upload",
    createdAt: "2026-06-13T10:00:00.000Z",
    id: "post-2",
    imageUrl: "https://cdn.example.com/posts/newest.png",
    updatedAt: "2026-06-13T10:00:00.000Z"
  },
  {
    authorId: demoUser.id,
    caption: "Older study snapshot",
    createdAt: "2026-06-12T09:00:00.000Z",
    id: "post-1",
    imageUrl: "https://cdn.example.com/posts/older.png",
    updatedAt: "2026-06-12T09:00:00.000Z"
  }
] as const;

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

describe("Profile UI", () => {
  it("shows the authenticated user's profile details, counts, and empty-post state on /profile", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "profile-access-token",
            requestId: "req-profile-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/users/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            profile: initialProfile,
            requestId: "req-profile-get"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            posts: [],
            requestId: "req-profile-posts"
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-profile; path=/";
    window.history.pushState({}, "", "/profile");

    render(<App />);

    expect(
      await screen.findByText(/building cloneinsta slice by slice\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your profile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^profile$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getAllByText(/@student_demo/i)).toHaveLength(2);
    expect(screen.getByText(/^12$/)).toBeInTheDocument();
    expect(screen.getByText(/^7$/)).toBeInTheDocument();
    expect(screen.getByText(/^0$/)).toBeInTheDocument();
    expect(screen.getByText(/^followers$/i)).toBeInTheDocument();
    expect(screen.getByText(/^following$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^posts$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no posts yet\. share your first photo when you are ready\./i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/users/me",
        expect.objectContaining({
          credentials: "include",
          method: "GET"
        })
      );
    });

    const profileInit = fetchSpy.mock.calls[1]?.[1];
    const profileHeaders = profileInit?.headers as Headers;

    expect(profileHeaders).toBeInstanceOf(Headers);
    expect(profileHeaders.get("Authorization")).toBe(
      "Bearer profile-access-token"
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3001/api/v1/posts/me",
        expect.objectContaining({
          credentials: "include",
          method: "GET"
        })
      );
    });
  });

  it("lets the user open /profile/edit, save updates, and return to the refreshed profile view", async () => {
    const user = userEvent.setup();
    let hasPatchedProfile = false;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "profile-access-token",
            requestId: "req-profile-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/users/me" &&
          init?.method === "PATCH"
        ) {
          hasPatchedProfile = true;
          return jsonResponse({
            profile: updatedProfile,
            requestId: "req-profile-patch"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/users/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            profile: hasPatchedProfile ? updatedProfile : initialProfile,
            requestId: hasPatchedProfile
              ? "req-profile-get-updated"
              : "req-profile-get-initial"
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-profile; path=/";
    window.history.pushState({}, "", "/profile");

    render(<App />);

    expect(
      await screen.findByRole("link", { name: /edit profile/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your profile/i })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /edit profile/i }));

    expect(
      await screen.findByRole("heading", { name: /edit your profile/i })
    ).toBeInTheDocument();

    const displayNameInput = screen.getByLabelText(/display name/i);
    const bioInput = screen.getByLabelText(/^bio$/i);
    const avatarInput = screen.getByLabelText(/avatar url/i);

    await user.clear(displayNameInput);
    await user.type(displayNameInput, "  Updated Student Demo  ");
    await user.clear(bioInput);
    await user.type(bioInput, "  Updated bio for the profile-edit slice.  ");
    await user.clear(avatarInput);
    await user.type(
      avatarInput,
      "https://cdn.example.com/student-demo-updated.png"
    );
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/profile");
    });

    expect(await screen.findByText(/profile updated\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /your profile/i })).toBeInTheDocument();
    expect(screen.getByText(/updated student demo/i)).toBeInTheDocument();
    expect(
      screen.getByText(/updated bio for the profile-edit slice\./i)
    ).toBeInTheDocument();

    const patchCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/users/me" &&
        requestInit?.method === "PATCH"
    );

    expect(patchCall).toBeDefined();

    const patchInit = patchCall?.[1];
    const patchHeaders = patchInit?.headers as Headers;
    const patchBody = JSON.parse((patchInit?.body as string) ?? "{}") as {
      avatarUrl?: string;
      bio?: string;
      displayName?: string;
    };

    expect(patchHeaders).toBeInstanceOf(Headers);
    expect(patchHeaders.get("Authorization")).toBe(
      "Bearer profile-access-token"
    );
    expect(patchBody).toEqual({
      avatarUrl: "https://cdn.example.com/student-demo-updated.png",
      bio: "Updated bio for the profile-edit slice.",
      displayName: "Updated Student Demo"
    });
  });

  it("renders real profile posts and lets the owner delete a post from the grid", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "profile-access-token",
            requestId: "req-profile-refresh",
            user: demoUser
          });
        }

        if (
          input === "http://localhost:3001/api/v1/users/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            profile: profileWithPosts,
            requestId: "req-profile-get-with-posts"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/me" &&
          init?.method === "GET"
        ) {
          return jsonResponse({
            posts: initialPosts,
            requestId: "req-profile-posts"
          });
        }

        if (
          input === "http://localhost:3001/api/v1/posts/post-2" &&
          init?.method === "DELETE"
        ) {
          return jsonResponse({
            deletedPostId: "post-2",
            requestId: "req-delete-post"
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-profile; path=/";
    window.history.pushState({}, "", "/profile");

    render(<App />);

    expect(
      await screen.findByText(/newest workshop upload/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/older study snapshot/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /delete newest workshop upload/i })
    );

    await waitFor(() => {
      expect(screen.queryByText(/newest workshop upload/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/post deleted\./i)).toBeInTheDocument();
    expect(screen.getByText(/older study snapshot/i)).toBeInTheDocument();

    const deleteCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput === "http://localhost:3001/api/v1/posts/post-2" &&
        requestInit?.method === "DELETE"
    );

    expect(deleteCall).toBeDefined();

    const deleteInit = deleteCall?.[1];
    const deleteHeaders = deleteInit?.headers as Headers;

    expect(deleteHeaders).toBeInstanceOf(Headers);
    expect(deleteHeaders.get("Authorization")).toBe(
      "Bearer profile-access-token"
    );
  });
});
