import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import {
  ApiError,
  createConversationMessage,
  createDirectConversation,
  getConversationMessages,
  getConversations,
  markConversationRead,
  type ConversationMessage,
  type ConversationReadState,
  type ConversationSummary
} from "../modules/auth/authApi";
import { createMessagesRealtimeClient } from "../modules/messages/messagesRealtime";
import { useAuthSession } from "../modules/auth/authSessionContext";

const conversationPageSize = 10;
const messagePageSize = 20;
type MessagesFolderView = "inbox" | "requests";

type MessagesThreadState = {
  conversation: {
    id: string;
    peer: ConversationSummary["peer"];
  };
  messages: ConversationMessage[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  readState: ConversationReadState;
};

function getPeerLabel(peer: ConversationSummary["peer"]): string {
  return peer.displayName?.trim() || peer.username;
}

function getAvatarLabel(peer: ConversationSummary["peer"]): string {
  return getPeerLabel(peer)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatConversationTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(new Date(isoTimestamp));
}

function formatMessageTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(isoTimestamp));
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof ApiError ? error.message : fallbackMessage;
}

function sortConversationsByUpdatedAt(
  conversations: ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

function upsertConversation(
  conversations: ConversationSummary[],
  nextConversation: ConversationSummary
): ConversationSummary[] {
  const remainingConversations = conversations.filter(
    (conversation) => conversation.id !== nextConversation.id
  );

  return sortConversationsByUpdatedAt([
    nextConversation,
    ...remainingConversations
  ]);
}

function matchesConversationFolder(
  conversation: ConversationSummary,
  folder: MessagesFolderView
): boolean {
  return folder === "requests"
    ? conversation.folder === "REQUESTS"
    : conversation.folder === "INBOX";
}

function syncConversationForFolder(
  conversations: ConversationSummary[],
  nextConversation: ConversationSummary,
  folder: MessagesFolderView
): ConversationSummary[] {
  if (!matchesConversationFolder(nextConversation, folder)) {
    return conversations.filter(
      (conversation) => conversation.id !== nextConversation.id
    );
  }

  return upsertConversation(conversations, nextConversation);
}

function mergeConversations(
  currentConversations: ConversationSummary[],
  incomingConversations: ConversationSummary[]
): ConversationSummary[] {
  return incomingConversations.reduce(
    (accumulator, conversation) => upsertConversation(accumulator, conversation),
    currentConversations
  );
}

function reverseMessagesForThread(
  messages: ConversationMessage[]
): ConversationMessage[] {
  return [...messages].reverse();
}

function prependOlderMessages(
  currentMessages: ConversationMessage[],
  incomingMessages: ConversationMessage[]
): ConversationMessage[] {
  const currentMessageIds = new Set(currentMessages.map((message) => message.id));
  const olderMessages = reverseMessagesForThread(incomingMessages).filter(
    (message) => !currentMessageIds.has(message.id)
  );

  return [...olderMessages, ...currentMessages];
}

function appendMessage(
  currentMessages: ConversationMessage[],
  nextMessage: ConversationMessage
): ConversationMessage[] {
  if (currentMessages.some((message) => message.id === nextMessage.id)) {
    return currentMessages;
  }

  return [...currentMessages, nextMessage];
}

function toConversationPreview(message: ConversationMessage) {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    senderId: message.sender.id
  };
}

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `client-message-${Date.now()}`;
}

function findLatestUnreadPeerMessageId(input: {
  messages: ConversationMessage[];
  readState: ConversationReadState;
  viewerId: string;
}): string | null {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];

    if (!message || message.sender.id === input.viewerId) {
      continue;
    }

    if (message.id === input.readState.lastReadMessageId) {
      return null;
    }

    return message.id;
  }

  return null;
}

export function MessagesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { conversationId } = useParams();
  const { accessToken, user } = useAuthSession();
  const realtimeClientRef =
    useRef<ReturnType<typeof createMessagesRealtimeClient> | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [thread, setThread] = useState<MessagesThreadState | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [conversationsPageInfo, setConversationsPageInfo] = useState<{
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  } | null>(null);

  const requestedUserId = searchParams.get("with");
  const activeFolder: MessagesFolderView =
    searchParams.get("view") === "requests" ? "requests" : "inbox";

  useEffect(() => {
    if (requestedUserId) {
      return;
    }

    let isActive = true;

    async function loadConversations() {
      setIsLoadingConversations(true);
      setConversationError(null);

      try {
        const response = await getConversations({
          folder: activeFolder,
          limit: conversationPageSize
        });

        if (!isActive) {
          return;
        }

        setConversations(response.conversations);
        setConversationsPageInfo(response.pageInfo);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setConversations([]);
        setConversationsPageInfo(null);
        setConversationError(
          getErrorMessage(
            error,
            activeFolder === "inbox"
              ? "Could not load the inbox right now. Please try again."
              : "Could not load message requests right now. Please try again."
          )
        );
      } finally {
        if (isActive) {
          setIsLoadingConversations(false);
        }
      }
    }

    void loadConversations();

    return () => {
      isActive = false;
    };
  }, [activeFolder, requestedUserId]);

  useEffect(() => {
    const participantUserId = requestedUserId;

    if (typeof participantUserId !== "string" || participantUserId.length === 0) {
      return;
    }

    const resolvedParticipantUserId: string = participantUserId;
    let isActive = true;

    async function openConversation() {
      setIsCreatingConversation(true);
      setConversationError(null);

      try {
        const response = await createDirectConversation({
          participantUserId: resolvedParticipantUserId
        });

        if (!isActive) {
          return;
        }

        setConversations((currentConversations) =>
          syncConversationForFolder(
            currentConversations,
            response.conversation,
            activeFolder
          )
        );
        navigate(`/messages/${response.conversation.id}`, { replace: true });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setConversationError(
          getErrorMessage(
            error,
            "Could not open that conversation right now. Please try again."
          )
        );
      } finally {
        if (isActive) {
          setIsCreatingConversation(false);
        }
      }
    }

    void openConversation();

    return () => {
      isActive = false;
    };
  }, [activeFolder, navigate, requestedUserId]);

  useEffect(() => {
    if (!accessToken || !user) {
      realtimeClientRef.current = null;
      setIsRealtimeConnected(false);
      return;
    }

    let isActive = true;
    const realtimeClient = createMessagesRealtimeClient({
      accessToken
    });
    realtimeClientRef.current = realtimeClient;

    const unsubscribe = realtimeClient.subscribe({
      onConnected: () => {
        setIsRealtimeConnected(true);
      },
      onConversationMessageCreated: ({ message }) => {
        setThread((currentThread) =>
          currentThread && currentThread.conversation.id === message.conversationId
            ? {
                ...currentThread,
                messages: appendMessage(currentThread.messages, message)
              }
            : currentThread
        );
        setConversations((currentConversations) => {
          const existingConversation = currentConversations.find(
            (conversation) => conversation.id === message.conversationId
          );
          const peer =
            existingConversation?.peer ??
            (message.sender.id === user.id ? null : message.sender);

          if (!peer) {
            return currentConversations;
          }

          return syncConversationForFolder(currentConversations, {
            folder:
              existingConversation?.folder ??
              (message.sender.id === user.id ? "INBOX" : "REQUESTS"),
            id: message.conversationId,
            lastMessage: toConversationPreview(message),
            peer,
            unreadCount:
              message.sender.id === user.id || message.conversationId === conversationId
                ? 0
                : (existingConversation?.unreadCount ?? 0) + 1,
            updatedAt: message.createdAt
          }, activeFolder);
        });

        if (
          !isActive ||
          message.conversationId !== conversationId ||
          message.sender.id === user.id ||
          !realtimeClient.isConnected()
        ) {
          return;
        }

        void realtimeClient
          .markRead({
            conversationId: message.conversationId,
            messageId: message.id
          })
          .then((response) => {
            if (!isActive) {
              return;
            }

            setThread((currentThread) =>
              currentThread &&
              currentThread.conversation.id === message.conversationId
                ? {
                    ...currentThread,
                    readState: response.readState
                  }
                : currentThread
            );
            setConversations((currentConversations) =>
              currentConversations.map((conversation) =>
                conversation.id === message.conversationId
                  ? {
                      ...conversation,
                      unreadCount: 0
                    }
                  : conversation
              )
            );
          })
          .catch(() => undefined);
      },
      onConversationReadUpdated: ({ conversationId: readConversationId, readState, userId }) => {
        if (userId !== user.id) {
          return;
        }

        setThread((currentThread) =>
          currentThread && currentThread.conversation.id === readConversationId
            ? {
                ...currentThread,
                readState
              }
            : currentThread
        );
        setConversations((currentConversations) =>
          currentConversations.map((conversation) =>
            conversation.id === readConversationId
              ? {
                  ...conversation,
                  unreadCount: 0
                }
              : conversation
          )
        );
      },
      onConversationSummaryUpdated: ({ conversation }) => {
        setConversations((currentConversations) =>
          syncConversationForFolder(
            currentConversations,
            conversation,
            activeFolder
          )
        );
      },
      onDisconnected: () => {
        setIsRealtimeConnected(false);
      }
    });

    realtimeClient.connect();

    return () => {
      isActive = false;
      unsubscribe();
      realtimeClient.disconnect();

      if (realtimeClientRef.current === realtimeClient) {
        realtimeClientRef.current = null;
      }

      setIsRealtimeConnected(false);
    };
  }, [accessToken, activeFolder, conversationId, user]);

  useEffect(() => {
    const selectedConversationId = conversationId;

    if (typeof selectedConversationId !== "string" || !user) {
      setThread(null);
      setThreadError(null);
      setDraft("");
      setDraftError(null);
      setIsLoadingThread(false);
      return;
    }

    const resolvedConversationId: string = selectedConversationId;
    const viewerId = user.id;
    let isActive = true;

    async function loadThread() {
      setIsLoadingThread(true);
      setThreadError(null);
      setDraftError(null);

      try {
        const response = await getConversationMessages(resolvedConversationId, {
          limit: messagePageSize
        });

        if (!isActive) {
          return;
        }

        const threadMessages = reverseMessagesForThread(response.messages);
        setThread({
          conversation: response.conversation,
          messages: threadMessages,
          pageInfo: response.pageInfo,
          readState: response.readState
        });

        const unreadMessageId = findLatestUnreadPeerMessageId({
          messages: threadMessages,
          readState: response.readState,
          viewerId
        });

        if (!unreadMessageId) {
          return;
        }

        const readResponse = await markConversationRead(resolvedConversationId, {
          messageId: unreadMessageId
        });

        if (!isActive) {
          return;
        }

        setThread((currentThread) =>
          currentThread
            ? {
                ...currentThread,
                readState: readResponse.readState
              }
            : currentThread
        );
        setConversations((currentConversations) =>
          currentConversations.map((conversation) =>
            conversation.id === resolvedConversationId
              ? {
                  ...conversation,
                  unreadCount: 0
                }
              : conversation
          )
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        setThread(null);
        setThreadError(
          getErrorMessage(
            error,
            "Could not load this conversation right now. Please try again."
          )
        );
      } finally {
        if (isActive) {
          setIsLoadingThread(false);
        }
      }
    }

    void loadThread();

    return () => {
      isActive = false;
    };
  }, [conversationId, user]);

  async function handleLoadMoreConversations(): Promise<void> {
    if (!conversationsPageInfo?.hasNextPage || !conversationsPageInfo.nextCursor) {
      return;
    }

    setIsLoadingMoreConversations(true);
    setConversationError(null);

    try {
      const response = await getConversations({
        cursor: conversationsPageInfo.nextCursor,
        folder: activeFolder,
        limit: conversationPageSize
      });

      setConversations((currentConversations) =>
        mergeConversations(currentConversations, response.conversations)
      );
      setConversationsPageInfo(response.pageInfo);
    } catch (error) {
      setConversationError(
        getErrorMessage(
          error,
          "Could not load more conversations right now. Please try again."
        )
      );
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }

  async function handleLoadOlderMessages(): Promise<void> {
    if (!conversationId || !thread?.pageInfo.hasNextPage || !thread.pageInfo.nextCursor) {
      return;
    }

    setIsLoadingOlderMessages(true);
    setThreadError(null);

    try {
      const response = await getConversationMessages(conversationId, {
        cursor: thread.pageInfo.nextCursor,
        limit: messagePageSize
      });

      setThread((currentThread) =>
        currentThread
          ? {
              ...currentThread,
              messages: prependOlderMessages(
                currentThread.messages,
                response.messages
              ),
              pageInfo: response.pageInfo
            }
          : currentThread
      );
    } catch (error) {
      setThreadError(
        getErrorMessage(
          error,
          "Could not load older messages right now. Please try again."
        )
      );
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }

  async function handleSubmitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!conversationId || !thread || !user) {
      return;
    }

    const trimmedDraft = draft.trim();

    if (!trimmedDraft) {
      setDraftError("Write a message before sending.");
      return;
    }

    setDraftError(null);
    setThreadError(null);
    setIsSendingMessage(true);

    try {
      const realtimeClient = realtimeClientRef.current;
      const response =
        realtimeClient && isRealtimeConnected && realtimeClient.isConnected()
          ? await realtimeClient.sendMessage({
              clientMessageId: createClientMessageId(),
              content: trimmedDraft,
              conversationId
            })
          : await createConversationMessage(conversationId, {
              content: trimmedDraft
            });

      setThread((currentThread) =>
        currentThread
          ? {
              ...currentThread,
              messages: appendMessage(currentThread.messages, response.message),
              readState: {
                conversationId,
                lastReadAt: response.message.createdAt,
                lastReadMessageId: response.message.id
              }
            }
          : currentThread
      );
      setConversations((currentConversations) =>
        syncConversationForFolder(currentConversations, {
          folder: "INBOX",
          id: conversationId,
          lastMessage: toConversationPreview(response.message),
          peer: thread.conversation.peer,
          unreadCount: 0,
          updatedAt: response.message.createdAt
        }, activeFolder)
      );
      setDraft("");
    } catch (error) {
      setDraftError(
        getErrorMessage(
          error,
          "Could not send the message right now. Please try again."
        )
      );
    } finally {
      setIsSendingMessage(false);
    }
  }

  return (
    <section
      className="panel messages-page"
      data-thread-open={conversationId ? "true" : "false"}
    >
      <div className="messages-layout">
        <aside className="messages-sidebar">
            <div className="messages-sidebar-header">
              <div className="auth-copy messages-hero-copy">
                <p className="messages-kicker">Slice 9C</p>
                <h2>Messages</h2>
                <p>
                  Keep the 1:1 inbox and thread view on top of the verified chat
                  backend.
                </p>
              </div>
              <Link className="secondary-inline-link" to="/search">
                Search people
              </Link>
            </div>

          <nav className="messages-view-toggle" aria-label="Messages folders">
            <Link
              aria-current={activeFolder === "inbox" ? "page" : undefined}
              className={
                activeFolder === "inbox"
                  ? "messages-view-tab messages-view-tab-active"
                  : "messages-view-tab"
              }
              to="/messages"
            >
              Inbox
            </Link>
            <Link
              aria-current={activeFolder === "requests" ? "page" : undefined}
              className={
                activeFolder === "requests"
                  ? "messages-view-tab messages-view-tab-active"
                  : "messages-view-tab"
              }
              to="/messages?view=requests"
            >
              Requests
            </Link>
          </nav>

          {conversationError ? (
            <p className="form-status" data-tone="error" role="status">
              {conversationError}
            </p>
          ) : null}

          {isCreatingConversation ? (
            <div className="messages-empty-state">
              <h3>Opening conversation</h3>
              <p>Creating or reusing the direct chat before the thread opens.</p>
            </div>
          ) : null}

          {isLoadingConversations ? (
            <div className="messages-empty-state">
              <h3>Loading inbox</h3>
              <p>Pulling the latest direct conversations from the protected API.</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="messages-empty-state">
              <h3>
                {activeFolder === "requests"
                  ? "No message requests."
                  : "No conversations yet."}
              </h3>
              <p>
                {activeFolder === "requests"
                  ? "Requests from people you do not follow will appear here."
                  : "Search for a classmate or demo account to start the first thread."}
              </p>
              {activeFolder === "inbox" ? (
                <Link className="secondary-inline-link" to="/search">
                  Search people
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div className="messages-conversation-list" role="list">
                {conversations.map((conversation) => (
                  <NavLink
                    aria-label={`Open chat with ${getPeerLabel(conversation.peer)}`}
                    className={({ isActive }) =>
                      isActive
                        ? "messages-conversation-card messages-conversation-card-active"
                        : "messages-conversation-card"
                    }
                    key={conversation.id}
                    to={`/messages/${conversation.id}`}
                  >
                    {conversation.peer.avatarUrl ? (
                      <img
                        alt={`Avatar for ${getPeerLabel(conversation.peer)}`}
                        className="messages-conversation-avatar"
                        src={conversation.peer.avatarUrl}
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="messages-conversation-avatar messages-conversation-avatar-fallback"
                      >
                        {getAvatarLabel(conversation.peer)}
                      </div>
                    )}

                    <div className="messages-conversation-copy">
                      <div className="messages-conversation-row">
                        <strong>{getPeerLabel(conversation.peer)}</strong>
                        <span>
                          {conversation.lastMessage
                            ? formatConversationTime(
                                conversation.lastMessage.createdAt
                              )
                            : "New"}
                        </span>
                      </div>
                      <p className="profile-handle">@{conversation.peer.username}</p>
                      {conversation.folder === "REQUESTS" ? (
                        <p className="messages-request-pill">Request</p>
                      ) : null}
                      <p className="messages-conversation-preview">
                        {conversation.lastMessage?.content ?? "No messages yet."}
                      </p>
                    </div>

                    {conversation.unreadCount > 0 ? (
                      <span className="messages-unread-pill">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>

              {conversationsPageInfo?.hasNextPage ? (
                <button
                  className="secondary-button messages-load-more"
                  disabled={isLoadingMoreConversations}
                  onClick={() => void handleLoadMoreConversations()}
                  type="button"
                >
                  {isLoadingMoreConversations
                    ? "Loading more..."
                    : activeFolder === "requests"
                      ? "Load more requests"
                      : "Load more conversations"}
                </button>
              ) : null}
            </>
          )}
        </aside>

        <section className="messages-thread-panel">
          {!conversationId ? (
            <div className="messages-thread-empty-state">
              <h3>Select a conversation</h3>
              <p>
                Choose a thread from the inbox to open the full direct-message
                history.
              </p>
            </div>
          ) : isLoadingThread ? (
            <div className="messages-thread-empty-state">
              <h3>Loading thread</h3>
              <p>Opening the selected conversation and recent message history.</p>
            </div>
          ) : threadError ? (
            <div className="messages-thread-empty-state">
              <h3>Thread unavailable</h3>
              <p className="form-status" data-tone="error" role="status">
                {threadError}
              </p>
            </div>
          ) : thread ? (
            <>
              <div className="messages-thread-header">
                <div className="messages-thread-peer">
                  {thread.conversation.peer.avatarUrl ? (
                    <img
                      alt={`Avatar for ${getPeerLabel(thread.conversation.peer)}`}
                      className="messages-thread-avatar"
                      src={thread.conversation.peer.avatarUrl}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="messages-thread-avatar messages-conversation-avatar-fallback"
                    >
                      {getAvatarLabel(thread.conversation.peer)}
                    </div>
                  )}

                  <div>
                    <p className="messages-kicker">Direct thread</p>
                    <h3>{getPeerLabel(thread.conversation.peer)}</h3>
                    <p className="profile-handle">
                      @{thread.conversation.peer.username}
                    </p>
                  </div>
                </div>

                <Link
                  className="secondary-inline-link messages-thread-back-link"
                  to="/messages"
                >
                  Back to inbox
                </Link>
              </div>

              {thread.pageInfo.hasNextPage ? (
                <button
                  className="secondary-button messages-load-older"
                  disabled={isLoadingOlderMessages}
                  onClick={() => void handleLoadOlderMessages()}
                  type="button"
                >
                  {isLoadingOlderMessages ? "Loading..." : "Load older messages"}
                </button>
              ) : null}

              {thread.messages.length === 0 ? (
                <div className="messages-thread-empty-state">
                  <h3>No messages yet.</h3>
                  <p>Say hi to start the first direct conversation.</p>
                </div>
              ) : (
                <ol className="messages-bubble-list">
                  {thread.messages.map((message) => {
                    const isOwnMessage = message.sender.id === user?.id;

                    return (
                      <li
                        className={
                          isOwnMessage
                            ? "messages-bubble-item messages-bubble-item-own"
                            : "messages-bubble-item"
                        }
                        key={message.id}
                      >
                        <div
                          className={
                            isOwnMessage
                              ? "messages-bubble messages-bubble-own"
                              : "messages-bubble"
                          }
                        >
                          <div className="messages-bubble-meta">
                            <strong>
                              {isOwnMessage
                                ? "You"
                                : getPeerLabel(message.sender)}
                            </strong>
                            <span>{formatMessageTime(message.createdAt)}</span>
                          </div>
                          <p>{message.content}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <form
                className="messages-compose-form"
                noValidate
                onSubmit={(event) => void handleSubmitMessage(event)}
              >
                <label className="form-field" htmlFor="messages-compose-input">
                  <span>Message</span>
                  <input
                    id="messages-compose-input"
                    onChange={(event) => {
                      setDraft(event.currentTarget.value);
                      setDraftError(null);
                    }}
                    placeholder={`Message ${getPeerLabel(thread.conversation.peer)}`}
                    type="text"
                    value={draft}
                  />
                </label>

                {draftError ? (
                  <p className="field-error" role="status">
                    {draftError}
                  </p>
                ) : null}

                <div className="messages-compose-actions">
                  <button
                    className="primary-button"
                    disabled={isSendingMessage}
                    type="submit"
                  >
                    {isSendingMessage ? "Sending..." : "Send message"}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}
