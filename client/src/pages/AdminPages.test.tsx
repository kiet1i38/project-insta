import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { resetBootstrapSessionState } from "../modules/auth/authSessionBootstrap";

const userSession = {
  createdAt: "2026-06-15T08:00:00.000Z",
  displayName: "Student User",
  email: "student.user@example.com",
  id: "user-123",
  role: "USER" as const,
  status: "ACTIVE" as const,
  updatedAt: "2026-06-15T08:00:00.000Z",
  username: "student_user"
};

const adminSession = {
  ...userSession,
  displayName: "Admin Demo",
  email: "admin.demo@example.com",
  id: "admin-123",
  role: "ADMIN" as const,
  username: "admin_demo"
};

const moderationQueueResponse = {
  pageInfo: {
    hasNextPage: false,
    limit: 3,
    nextCursor: null
  },
  reports: [
    {
      createdAt: "2026-06-15T10:00:00.000Z",
      id: "report-post-1",
      reason: "HATE_SPEECH",
      reporter: {
        id: "reporter-1",
        username: "urban_watch"
      },
      resolvedAt: null,
      status: "PENDING",
      target: {
        comment: null,
        post: {
          author: {
            id: "author-1",
            username: "urban_chaos"
          },
          caption: "Taking back the streets.",
          id: "post-1",
          imageUrl: "https://cdn.example.com/posts/graffiti.png",
          isHidden: false
        },
        type: "POST",
        user: null
      }
    },
    {
      createdAt: "2026-06-15T09:00:00.000Z",
      id: "report-comment-1",
      reason: "HARASSMENT",
      reporter: {
        id: "reporter-2",
        username: "safe_reader"
      },
      resolvedAt: null,
      status: "PENDING",
      target: {
        comment: {
          author: {
            id: "author-2",
            username: "crypto_king99"
          },
          content: "Automated system detected repeated posting of suspicious links.",
          id: "comment-1",
          isHidden: false,
          postId: "post-2"
        },
        post: null,
        type: "COMMENT",
        user: null
      }
    },
    {
      createdAt: "2026-06-15T08:00:00.000Z",
      id: "report-user-1",
      reason: "IMPERSONATION",
      reporter: {
        id: "reporter-3",
        username: "party_animal"
      },
      resolvedAt: null,
      status: "PENDING",
      target: {
        comment: null,
        post: null,
        type: "USER",
        user: {
          displayName: "Reported User",
          id: "user-target-1",
          status: "ACTIVE",
          username: "reported_user"
        }
      }
    }
  ],
  requestId: "req-moderation-queue",
  summary: {
    pendingCount: 3,
    resolvedCount: 14
  }
};

const moderationQueueAfterHideResponse = {
  pageInfo: {
    hasNextPage: false,
    limit: 3,
    nextCursor: null
  },
  reports: [],
  requestId: "req-moderation-queue-refresh",
  summary: {
    pendingCount: 0,
    resolvedCount: 15
  }
};

const initialAuditLogResponse = {
  auditLogs: [
    {
      action: "MODERATION_USER_BANNED",
      actor: {
        id: "admin-123",
        role: "ADMIN",
        status: "ACTIVE",
        username: "admin_demo"
      },
      actorMetadata: {
        moderationAction: "BAN_USER",
        note: "Repeated abuse confirmed.",
        targetEntityId: "user-target-1",
        targetEntityType: "USER"
      },
      createdAt: "2026-06-15T12:00:00.000Z",
      entityId: "report-user-1",
      entityType: "REPORT",
      id: "audit-1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest/admin"
    },
    {
      action: "REPORT_CREATED",
      actor: {
        id: "reporter-3",
        role: "USER",
        status: "ACTIVE",
        username: "party_animal"
      },
      actorMetadata: {
        reason: "IMPERSONATION"
      },
      createdAt: "2026-06-15T11:30:00.000Z",
      entityId: "report-user-1",
      entityType: "REPORT",
      id: "audit-2",
      ipAddress: "127.0.0.2",
      userAgent: "vitest/reporter"
    }
  ],
  pageInfo: {
    hasNextPage: false,
    limit: 2,
    nextCursor: null
  },
  requestId: "req-audit-initial"
};

const filteredAuditLogFirstPage = {
  auditLogs: [
    {
      action: "MODERATION_POST_HIDDEN",
      actor: {
        id: "admin-123",
        role: "ADMIN",
        status: "ACTIVE",
        username: "admin_demo"
      },
      actorMetadata: {
        moderationAction: "HIDE_POST",
        note: "Policy violation confirmed."
      },
      createdAt: "2026-06-15T11:00:00.000Z",
      entityId: "report-post-1",
      entityType: "REPORT",
      id: "audit-filter-1",
      ipAddress: "127.0.0.3",
      userAgent: "vitest/admin"
    }
  ],
  pageInfo: {
    hasNextPage: true,
    limit: 2,
    nextCursor: "audit-cursor-2"
  },
  requestId: "req-audit-filter-1"
};

const filteredAuditLogSecondPage = {
  auditLogs: [
    {
      action: "MODERATION_POST_HIDDEN",
      actor: null,
      actorMetadata: {
        nested: {
          accessToken: "[REDACTED]"
        },
        note: "Guest escalation note."
      },
      createdAt: "2026-06-15T10:45:00.000Z",
      entityId: "report-post-2",
      entityType: "REPORT",
      id: "audit-filter-2",
      ipAddress: "127.0.0.4",
      userAgent: "vitest/guest"
    }
  ],
  pageInfo: {
    hasNextPage: false,
    limit: 2,
    nextCursor: null
  },
  requestId: "req-audit-filter-2"
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
  resetBootstrapSessionState();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Admin UI", () => {
  it("blocks a non-admin user from opening the admin moderation route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "user-access-token",
            requestId: "req-auth-refresh",
            user: userSession
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-admin; path=/";
    window.history.pushState({}, "", "/admin/reports");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /admin access required/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/this area is reserved for current admin accounts\./i)
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the moderation queue for an admin with summary cards and the selected review context", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "admin-access-token",
            requestId: "req-auth-refresh",
            user: adminSession
          });
        }

        if (
          input ===
          "http://localhost:3001/api/v1/admin/reports?status=PENDING&sort=newest&limit=3"
        ) {
          return jsonResponse(moderationQueueResponse);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-admin; path=/";
    window.history.pushState({}, "", "/admin/reports");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /moderation queue/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^moderation$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: /^audit log$/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/3 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/14 resolved/i)).toBeInTheDocument();
    expect(screen.getAllByText(/taking back the streets\./i)).toHaveLength(2);
    expect(screen.getByText(/reported by @urban_watch/i)).toBeInTheDocument();
    expect(screen.getAllByText(/review context/i)).toHaveLength(2);
    expect(screen.getByAltText(/reported post preview/i)).toHaveAttribute(
      "src",
      "https://cdn.example.com/posts/graffiti.png"
    );
    expect(
      screen.getByRole("button", { name: /hide content/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ban account/i })
    ).toBeInTheDocument();

    const moderationCall = fetchSpy.mock.calls.find(
      ([requestInput]) =>
        requestInput ===
        "http://localhost:3001/api/v1/admin/reports?status=PENDING&sort=newest&limit=3"
    );

    expect(moderationCall).toBeDefined();

    const moderationHeaders = moderationCall?.[1]?.headers as Headers;

    expect(moderationHeaders).toBeInstanceOf(Headers);
    expect(moderationHeaders.get("Authorization")).toBe(
      "Bearer admin-access-token"
    );
  });

  it("submits a moderation note, hides reported content, and refreshes the queue", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "admin-access-token",
            requestId: "req-auth-refresh",
            user: adminSession
          });
        }

        if (
          input ===
          "http://localhost:3001/api/v1/admin/reports?status=PENDING&sort=newest&limit=3"
        ) {
          const hideCalls = fetchSpy.mock.calls.filter(
            ([requestInput]) =>
              requestInput ===
              "http://localhost:3001/api/v1/admin/reports/report-post-1/hide-content"
          );

          return jsonResponse(
            hideCalls.length === 0
              ? {
                  ...moderationQueueResponse,
                  reports: [moderationQueueResponse.reports[0]]
                }
              : moderationQueueAfterHideResponse
          );
        }

        if (
          input ===
            "http://localhost:3001/api/v1/admin/reports/report-post-1/hide-content" &&
          init?.method === "POST"
        ) {
          return jsonResponse({
            moderationAction: {
              action: "HIDE_POST",
              createdAt: "2026-06-15T12:05:00.000Z",
              id: "mod-action-1",
              note: "Policy violation confirmed."
            },
            report: {
              id: "report-post-1",
              resolvedAt: "2026-06-15T12:05:00.000Z",
              status: "RESOLVED"
            },
            requestId: "req-hide-report"
          });
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-admin; path=/";
    window.history.pushState({}, "", "/admin/reports");

    render(<App />);

    const noteInput = await screen.findByLabelText(/moderation note/i);

    await user.type(noteInput, "Policy violation confirmed.");
    await user.click(screen.getByRole("button", { name: /hide content/i }));

    expect(
      await screen.findByText(/moderation action recorded: hide_post\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no reports match this queue right now\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/0 pending/i)).toBeInTheDocument();
    expect(screen.getByText(/15 resolved/i)).toBeInTheDocument();

    const hideCall = fetchSpy.mock.calls.find(
      ([requestInput, requestInit]) =>
        requestInput ===
          "http://localhost:3001/api/v1/admin/reports/report-post-1/hide-content" &&
        requestInit?.method === "POST"
    );

    expect(hideCall).toBeDefined();

    const hideHeaders = hideCall?.[1]?.headers as Headers;
    const hideBody = JSON.parse((hideCall?.[1]?.body as string) ?? "{}") as {
      note?: string;
    };

    expect(hideHeaders).toBeInstanceOf(Headers);
    expect(hideHeaders.get("Authorization")).toBe(
      "Bearer admin-access-token"
    );
    expect(hideBody).toEqual({
      note: "Policy violation confirmed."
    });
  });

  it("loads audit logs, applies filters, and paginates the filtered results", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        if (input === "http://localhost:3001/api/v1/auth/refresh") {
          return jsonResponse({
            accessToken: "admin-access-token",
            requestId: "req-auth-refresh",
            user: adminSession
          });
        }

        if (typeof input === "string" && input.startsWith("http://localhost:3001/api/v1/admin/audit-logs?")) {
          const requestUrl = new URL(input);
          const action = requestUrl.searchParams.get("action");
          const entityType = requestUrl.searchParams.get("entityType");
          const cursor = requestUrl.searchParams.get("cursor");

          if (!action && !entityType && !cursor) {
            expect(requestUrl.searchParams.get("limit")).toBe("2");
            expect(requestUrl.searchParams.get("sort")).toBe("newest");
            return jsonResponse(initialAuditLogResponse);
          }

          expect(action).toBe("MODERATION_POST_HIDDEN");
          expect(entityType).toBe("REPORT");
          expect(requestUrl.searchParams.get("from")).toBeTruthy();
          expect(requestUrl.searchParams.get("to")).toBeTruthy();
          expect(requestUrl.searchParams.get("limit")).toBe("2");
          expect(requestUrl.searchParams.get("sort")).toBe("newest");

          if (cursor === null) {
            return jsonResponse(filteredAuditLogFirstPage);
          }

          expect(cursor).toBe("audit-cursor-2");
          return jsonResponse(filteredAuditLogSecondPage);
        }

        throw new Error(`Unexpected fetch request: ${String(input)}`);
      }
    );

    document.cookie = "cloneinsta_csrf=csrf-admin; path=/";
    window.history.pushState({}, "", "/admin/audit-logs");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /^audit log$/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^audit log$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(await screen.findByText(/moderation_user_banned/i)).toBeInTheDocument();
    expect(screen.getByText(/report_created/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^action$/i));
    await user.type(
      screen.getByLabelText(/^action$/i),
      "MODERATION_POST_HIDDEN"
    );
    await user.clear(screen.getByLabelText(/^entity type$/i));
    await user.type(screen.getByLabelText(/^entity type$/i), "REPORT");
    await user.type(screen.getByLabelText(/^from$/i), "2026-06-15T10:30");
    await user.type(screen.getByLabelText(/^to$/i), "2026-06-15T11:30");
    await user.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(
      await screen.findByText(/policy violation confirmed\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /load more logs/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more logs/i }));

    expect(await screen.findByText(/guest escalation note\./i)).toBeInTheDocument();
    expect(screen.getByText(/no actor recorded/i)).toBeInTheDocument();

    const auditCall = fetchSpy.mock.calls.find(
      ([requestInput]) =>
        typeof requestInput === "string" &&
        requestInput.includes("/api/v1/admin/audit-logs?limit=2&sort=newest")
    );

    expect(auditCall).toBeDefined();

    const auditHeaders = auditCall?.[1]?.headers as Headers;

    expect(auditHeaders).toBeInstanceOf(Headers);
    expect(auditHeaders.get("Authorization")).toBe(
      "Bearer admin-access-token"
    );
  });
});
