import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const socketHarness = vi.hoisted(() => {
  type EventHandler = (...args: unknown[]) => void;

  let handlers = new Map<string, Set<EventHandler>>();

  function ensureHandlers(event: string) {
    const existingHandlers = handlers.get(event);

    if (existingHandlers) {
      return existingHandlers;
    }

    const nextHandlers = new Set<EventHandler>();
    handlers.set(event, nextHandlers);
    return nextHandlers;
  }

  const socket = {
    connected: false,
    connect: vi.fn(() => {
      socket.connected = true;
      ensureHandlers("connect").forEach((handler) => handler());
      return socket;
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
      ensureHandlers("disconnect").forEach((handler) =>
        handler("io client disconnect")
      );
      return socket;
    }),
    emit: vi.fn(
      (event: string, _payload: unknown, ack?: (value: unknown) => void) => {
        if (event === "conversations:sync") {
          ack?.({
            conversations: [
              {
                id: "conversation-1",
                lastMessage: {
                  content: "Initial peer message",
                  createdAt: "2026-07-01T20:01:00.000Z",
                  id: "message-initial-1",
                  senderId: "user-alice"
                },
                peer: {
                  avatarUrl: null,
                  displayName: "Alice Demo",
                  id: "user-alice",
                  username: "alice_demo"
                },
                unreadCount: 0,
                updatedAt: "2026-07-01T20:01:00.000Z"
              }
            ],
            pageInfo: {
              hasNextPage: false,
              limit: 10,
              nextCursor: null
            }
          });
          return true;
        }

        if (event === "conversation:messages:sync") {
          ack?.({
            conversation: {
              id: "conversation-1",
              peer: {
                avatarUrl: null,
                displayName: "Alice Demo",
                id: "user-alice",
                username: "alice_demo"
              }
            },
            messages: [
              {
                content: "Initial peer message",
                conversationId: "conversation-1",
                createdAt: "2026-07-01T20:01:00.000Z",
                id: "message-initial-1",
                sender: {
                  avatarUrl: null,
                  displayName: "Alice Demo",
                  id: "user-alice",
                  username: "alice_demo"
                }
              }
            ],
            pageInfo: {
              hasNextPage: false,
              limit: 20,
              nextCursor: null
            },
            readState: {
              conversationId: "conversation-1",
              lastReadAt: "2026-07-01T20:01:00.000Z",
              lastReadMessageId: "message-initial-1"
            }
          });
          return true;
        }

        if (event === "conversation:message:create") {
          ack?.({
            message: {
              content: "Realtime hello",
              conversationId: "conversation-1",
              createdAt: "2026-07-01T20:05:00.000Z",
              id: "message-sent-1",
              sender: {
                avatarUrl: null,
                displayName: "Student Demo",
                id: "user-123",
                username: "student_demo"
              }
            }
          });
          return true;
        }

        if (event === "conversation:read:update") {
          ack?.({
            readState: {
              conversationId: "conversation-1",
              lastReadAt: "2026-07-01T20:06:00.000Z",
              lastReadMessageId: "message-peer-2"
            }
          });
          return true;
        }

        ack?.({});
        return true;
      }
    ),
    off: vi.fn((event: string, handler: EventHandler) => {
      ensureHandlers(event).delete(handler);
      return socket;
    }),
    on: vi.fn((event: string, handler: EventHandler) => {
      ensureHandlers(event).add(handler);
      return socket;
    })
  };

  return {
    emitServerEvent(event: string, payload: unknown) {
      ensureHandlers(event).forEach((handler) => handler(payload));
    },
    io: vi.fn(() => socket),
    reset() {
      handlers = new Map();
      socket.connected = false;
      socket.connect.mockClear();
      socket.disconnect.mockClear();
      socket.emit.mockClear();
      socket.off.mockClear();
      socket.on.mockClear();
      this.io.mockClear();
    },
    socket
  };
});

vi.mock("socket.io-client", () => ({
  io: socketHarness.io
}));

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
  socketHarness.reset();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

describe("Messages UI", () => {
  it("shows an empty inbox state on /messages when the user has no conversations yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "messages-access-token",
          requestId: "req-messages-refresh",
          user: demoUser
        });
      }

      if (input === "http://localhost:3001/api/v1/conversations?limit=10") {
        return jsonResponse({
          conversations: [],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-empty"
        });
      }

      throw new Error(`Unexpected fetch request: ${String(input)}`);
    });

    document.cookie = "cloneinsta_csrf=csrf-messages; path=/";
    window.history.pushState({}, "", "/messages");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /^messages$/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^messages$/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /no conversations yet\./i
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /search people/i })[0]
    ).toHaveAttribute("href", "/search");
  });

  it("creates or reuses a direct conversation from /messages?with=<userId> and opens the thread", async () => {
    let hasCreatedConversation = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "messages-access-token",
          requestId: "req-messages-refresh",
          user: demoUser
        });
      }

      if (
        input === "http://localhost:3001/api/v1/conversations?limit=10" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversations: hasCreatedConversation
            ? [
                {
                  id: "conversation-1",
                  lastMessage: null,
                  peer: {
                    avatarUrl: null,
                    displayName: "Alice Demo",
                    id: "user-alice",
                    username: "alice_demo"
                  },
                  unreadCount: 0,
                  updatedAt: "2026-07-01T20:00:00.000Z"
                }
              ]
            : [],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-list"
        });
      }

      if (
        input === "http://localhost:3001/api/v1/conversations" &&
        init?.method === "POST"
      ) {
        hasCreatedConversation = true;

        return jsonResponse(
          {
            conversation: {
              id: "conversation-1",
              lastMessage: null,
              peer: {
                avatarUrl: null,
                displayName: "Alice Demo",
                id: "user-alice",
                username: "alice_demo"
              },
              unreadCount: 0,
              updatedAt: "2026-07-01T20:00:00.000Z"
            },
            requestId: "req-messages-create"
          },
          201
        );
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations/conversation-1/messages?limit=20" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversation: {
            id: "conversation-1",
            peer: {
              avatarUrl: null,
              displayName: "Alice Demo",
              id: "user-alice",
              username: "alice_demo"
            }
          },
          messages: [],
          pageInfo: {
            hasNextPage: false,
            limit: 20,
            nextCursor: null
          },
          readState: {
            conversationId: "conversation-1",
            lastReadAt: null,
            lastReadMessageId: null
          },
          requestId: "req-messages-thread"
        });
      }

      throw new Error(
        `Unexpected fetch request: ${String(input)} ${String(init?.method)}`
      );
    });

    document.cookie = "cloneinsta_csrf=csrf-messages; path=/";
    window.history.pushState({}, "", "/messages?with=user-alice");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /^messages$/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(window.location.pathname).toBe("/messages/conversation-1");
    });

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /alice demo/i
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /no messages yet\./i
      })
    ).toBeInTheDocument();
  });

  it("sends and receives thread updates through the realtime transport when the conversation is open", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "messages-access-token",
          requestId: "req-messages-refresh",
          user: demoUser
        });
      }

      if (
        input === "http://localhost:3001/api/v1/conversations?limit=10" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversations: [
            {
              id: "conversation-1",
              lastMessage: {
                content: "Initial peer message",
                createdAt: "2026-07-01T20:01:00.000Z",
                id: "message-initial-1",
                senderId: "user-alice"
              },
              peer: {
                avatarUrl: null,
                displayName: "Alice Demo",
                id: "user-alice",
                username: "alice_demo"
              },
              unreadCount: 0,
              updatedAt: "2026-07-01T20:01:00.000Z"
            }
          ],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-list"
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations/conversation-1/messages?limit=20" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversation: {
            id: "conversation-1",
            peer: {
              avatarUrl: null,
              displayName: "Alice Demo",
              id: "user-alice",
              username: "alice_demo"
            }
          },
          messages: [
            {
              content: "Initial peer message",
              conversationId: "conversation-1",
              createdAt: "2026-07-01T20:01:00.000Z",
              id: "message-initial-1",
              sender: {
                avatarUrl: null,
                displayName: "Alice Demo",
                id: "user-alice",
                username: "alice_demo"
              }
            }
          ],
          pageInfo: {
            hasNextPage: false,
            limit: 20,
            nextCursor: null
          },
          readState: {
            conversationId: "conversation-1",
            lastReadAt: "2026-07-01T20:01:00.000Z",
            lastReadMessageId: "message-initial-1"
          },
          requestId: "req-messages-thread"
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations/conversation-1/messages" &&
        init?.method === "POST"
      ) {
        return jsonResponse(
          {
            message: {
              content: "Realtime hello",
              conversationId: "conversation-1",
              createdAt: "2026-07-01T20:05:00.000Z",
              id: "message-rest-fallback-1",
              sender: {
                avatarUrl: null,
                displayName: "Student Demo",
                id: "user-123",
                username: "student_demo"
              }
            },
            requestId: "req-messages-send"
          },
          201
        );
      }

      throw new Error(
        `Unexpected fetch request: ${String(input)} ${String(init?.method)}`
      );
    });

    document.cookie = "cloneinsta_csrf=csrf-messages; path=/";
    window.history.pushState({}, "", "/messages/conversation-1");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /alice demo/i
      })
    ).toBeInTheDocument();

    expect(socketHarness.io).toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^message$/i), "Realtime hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(socketHarness.socket.emit).toHaveBeenCalledWith(
        "conversation:message:create",
        expect.objectContaining({
          content: "Realtime hello",
          conversationId: "conversation-1"
        }),
        expect.any(Function)
      );
    });

    await act(async () => {
      socketHarness.emitServerEvent("conversation:message:created", {
        message: {
          content: "Reply from socket",
          conversationId: "conversation-1",
          createdAt: "2026-07-01T20:06:00.000Z",
          id: "message-peer-2",
          sender: {
            avatarUrl: null,
            displayName: "Alice Demo",
            id: "user-alice",
            username: "alice_demo"
          }
        }
      });
    });

    expect(await screen.findAllByText(/reply from socket/i)).not.toHaveLength(
      0
    );
  });

  it("shows message requests in a dedicated requests view", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "messages-access-token",
          requestId: "req-messages-refresh",
          user: demoUser
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations?folder=requests&limit=10" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversations: [
            {
              folder: "REQUESTS",
              id: "conversation-request-1",
              lastMessage: {
                content: "Hi, can we talk?",
                createdAt: "2026-07-02T08:00:00.000Z",
                id: "message-request-1",
                senderId: "user-bob"
              },
              peer: {
                avatarUrl: null,
                displayName: "Bob Demo",
                id: "user-bob",
                username: "bob_demo"
              },
              unreadCount: 1,
              updatedAt: "2026-07-02T08:00:00.000Z"
            }
          ],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-requests"
        });
      }

      throw new Error(
        `Unexpected fetch request: ${String(input)} ${String(init?.method)}`
      );
    });

    document.cookie = "cloneinsta_csrf=csrf-messages; path=/";
    window.history.pushState({}, "", "/messages?view=requests");

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: /^messages$/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /requests/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      await screen.findByRole("link", { name: /open chat with bob demo/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/^request$/i)).toBeInTheDocument();
    expect(screen.getByText(/hi, can we talk\?/i)).toBeInTheDocument();
  });

  it("accepts an opened message request before enabling the reply composer", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input === "http://localhost:3001/api/v1/auth/refresh") {
        return jsonResponse({
          accessToken: "messages-access-token",
          requestId: "req-messages-refresh",
          user: demoUser
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations?folder=requests&limit=10" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversations: [
            {
              folder: "REQUESTS",
              id: "conversation-request-accept",
              lastMessage: {
                content: "Could we chat?",
                createdAt: "2026-07-10T08:00:00.000Z",
                id: "message-request-accept",
                senderId: "user-bob"
              },
              peer: {
                avatarUrl: null,
                displayName: "Bob Demo",
                id: "user-bob",
                username: "bob_demo"
              },
              unreadCount: 0,
              updatedAt: "2026-07-10T08:00:00.000Z"
            }
          ],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-requests"
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations/conversation-request-accept/messages?limit=20" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversation: {
            folder: "REQUESTS",
            id: "conversation-request-accept",
            peer: {
              avatarUrl: null,
              displayName: "Bob Demo",
              id: "user-bob",
              username: "bob_demo"
            }
          },
          messages: [
            {
              content: "Could we chat?",
              conversationId: "conversation-request-accept",
              createdAt: "2026-07-10T08:00:00.000Z",
              id: "message-request-accept",
              sender: {
                avatarUrl: null,
                displayName: "Bob Demo",
                id: "user-bob",
                username: "bob_demo"
              }
            }
          ],
          pageInfo: {
            hasNextPage: false,
            limit: 20,
            nextCursor: null
          },
          readState: {
            conversationId: "conversation-request-accept",
            lastReadAt: "2026-07-10T08:00:00.000Z",
            lastReadMessageId: "message-request-accept"
          },
          requestId: "req-messages-thread"
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations/conversation-request-accept/request/accept" &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          conversation: {
            folder: "INBOX",
            id: "conversation-request-accept",
            lastMessage: {
              content: "Could we chat?",
              createdAt: "2026-07-10T08:00:00.000Z",
              id: "message-request-accept",
              senderId: "user-bob"
            },
            peer: {
              avatarUrl: null,
              displayName: "Bob Demo",
              id: "user-bob",
              username: "bob_demo"
            },
            unreadCount: 0,
            updatedAt: "2026-07-10T08:00:00.000Z"
          },
          requestId: "req-messages-accept"
        });
      }

      if (
        input ===
          "http://localhost:3001/api/v1/conversations?folder=inbox&limit=10" &&
        init?.method === "GET"
      ) {
        return jsonResponse({
          conversations: [],
          pageInfo: {
            hasNextPage: false,
            limit: 10,
            nextCursor: null
          },
          requestId: "req-messages-inbox"
        });
      }

      throw new Error(
        `Unexpected fetch request: ${String(input)} ${String(init?.method)}`
      );
    });

    document.cookie = "cloneinsta_csrf=csrf-messages; path=/";
    window.history.pushState({}, "", "/messages?view=requests");

    render(<App />);

    await user.click(
      await screen.findByRole("link", { name: /open chat with bob demo/i })
    );

    expect(
      await screen.findByRole("button", { name: /accept request/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decline request/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send message/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /accept request/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/messages/conversation-request-accept"
      );
      expect(window.location.search).toBe("");
    });
    expect(
      await screen.findByRole("button", { name: /send message/i })
    ).toBeInTheDocument();
  });
});
