import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  type ConversationMessage,
  type ConversationReadState,
  type ConversationSummary,
  type ConversationThreadResponse,
  type ConversationsResponse,
  type GetConversationMessagesInput,
  type GetConversationsInput
} from "../auth/authApi";

type MessagesRealtimeListener = {
  onConnected?: () => void;
  onConversationMessageCreated?: (payload: { message: ConversationMessage }) => void;
  onConversationReadUpdated?: (payload: {
    conversationId: string;
    readState: ConversationReadState;
    userId: string;
  }) => void;
  onConversationSummaryUpdated?: (payload: {
    conversation: ConversationSummary;
  }) => void;
  onDisconnected?: () => void;
};

type SocketAckError = {
  error?: {
    code?: string;
    details?: Array<{
      message: string;
      path: string;
    }>;
    message?: string;
  };
};

type SocketAckResponse<T> = SocketAckError & T;

const defaultApiBaseUrl = "http://localhost:3001/api/v1";
const defaultRealtimeBaseUrl = "http://localhost:3001";

function resolveRealtimeBaseUrl(): string {
  const configuredRealtimeBaseUrl = import.meta.env.VITE_REALTIME_BASE_URL;

  if (
    typeof configuredRealtimeBaseUrl === "string" &&
    configuredRealtimeBaseUrl.trim().length > 0
  ) {
    return configuredRealtimeBaseUrl.trim().replace(/\/+$/, "");
  }

  const configuredApiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl;

  try {
    return new URL(configuredApiBaseUrl).origin;
  } catch {
    return defaultRealtimeBaseUrl;
  }
}

function toRealtimeError(response: SocketAckError): ApiError {
  return new ApiError(
    500,
    response.error?.code ?? "REALTIME_ERROR",
    response.error?.message ?? "Realtime request failed.",
    response.error?.details ?? []
  );
}

function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload: unknown
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    socket.emit(event, payload, (response: SocketAckResponse<T>) => {
      if (response?.error) {
        reject(toRealtimeError(response));
        return;
      }

      resolve(response as T);
    });
  });
}

export function createMessagesRealtimeClient(input: { accessToken: string }) {
  const listeners = new Set<MessagesRealtimeListener>();
  const socket = io(resolveRealtimeBaseUrl(), {
    auth: {
      accessToken: input.accessToken
    },
    autoConnect: false,
    withCredentials: true
  });

  socket.on("connect", () => {
    listeners.forEach((listener) => listener.onConnected?.());
  });

  socket.on("disconnect", () => {
    listeners.forEach((listener) => listener.onDisconnected?.());
  });

  socket.on("conversation:message:created", (payload) => {
    listeners.forEach((listener) =>
      listener.onConversationMessageCreated?.(
        payload as { message: ConversationMessage }
      )
    );
  });

  socket.on("conversation:summary:updated", (payload) => {
    listeners.forEach((listener) =>
      listener.onConversationSummaryUpdated?.(
        payload as { conversation: ConversationSummary }
      )
    );
  });

  socket.on("conversation:read:updated", (payload) => {
    listeners.forEach((listener) =>
      listener.onConversationReadUpdated?.(
        payload as {
          conversationId: string;
          readState: ConversationReadState;
          userId: string;
        }
      )
    );
  });

  return {
    connect() {
      socket.connect();
    },
    disconnect() {
      socket.disconnect();
    },
    isConnected() {
      return socket.connected;
    },
    async markRead(input: { conversationId: string; messageId: string }) {
      return emitWithAck<{ readState: ConversationReadState }>(
        socket,
        "conversation:read:update",
        input
      );
    },
    async sendMessage(input: {
      clientMessageId: string;
      content: string;
      conversationId: string;
    }) {
      return emitWithAck<{ message: ConversationMessage }>(
        socket,
        "conversation:message:create",
        input
      );
    },
    async syncConversations(
      input: GetConversationsInput = {}
    ): Promise<Pick<ConversationsResponse, "conversations" | "pageInfo">> {
      return emitWithAck<Pick<ConversationsResponse, "conversations" | "pageInfo">>(
        socket,
        "conversations:sync",
        {
          cursor: input.cursor ?? undefined,
          limit: input.limit ?? 10
        }
      );
    },
    async syncMessages(
      input: { conversationId: string } & GetConversationMessagesInput
    ): Promise<
      Omit<ConversationThreadResponse, "requestId">
    > {
      return emitWithAck<Omit<ConversationThreadResponse, "requestId">>(
        socket,
        "conversation:messages:sync",
        {
          conversationId: input.conversationId,
          cursor: input.cursor ?? undefined,
          limit: input.limit ?? 20
        }
      );
    },
    subscribe(listener: MessagesRealtimeListener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}
