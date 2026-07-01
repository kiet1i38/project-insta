import type { Server as SocketServer, Socket } from "socket.io";
import { ZodError } from "zod";
import { AppError } from "../../lib/appError.js";
import {
  createConversationMessageRealtime,
  getConversationMessages,
  getConversationSummary,
  listConversationRoomIds,
  listConversations,
  markConversationReadRealtime
} from "./messages.service.js";
import {
  realtimeCreateConversationMessageSchema,
  realtimeListConversationMessagesSchema,
  realtimeListConversationsSchema,
  realtimeMarkConversationReadSchema
} from "./messages.schema.js";

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  {
    authUser: {
      id: string;
      role: "USER" | "ADMIN";
      status: "ACTIVE" | "BANNED";
      username: string;
    };
  }
>;

type AckPayload = (response: unknown) => void;

function createInternalServerError(): AppError {
  return new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error.");
}

function buildValidationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function toSocketErrorPayload(error: unknown) {
  const appError = error instanceof AppError ? error : createInternalServerError();

  return {
    error: {
      code: appError.code,
      message: appError.message
    }
  };
}

function acknowledgeValidationError(ack: AckPayload, error: ZodError, message: string) {
  ack({
    error: {
      code: "VALIDATION_ERROR",
      details: buildValidationDetails(error),
      message
    }
  });
}

export function buildConversationRoomName(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function buildUserRoomName(userId: string): string {
  return `user:${userId}`;
}

async function joinExistingConversationRooms(socket: AuthenticatedSocket) {
  const conversationIds = await listConversationRoomIds({
    viewerId: socket.data.authUser.id
  });

  if (conversationIds.length === 0) {
    return;
  }

  socket.join(conversationIds.map(buildConversationRoomName));
}

async function joinParticipantsToConversationRoom(
  io: SocketServer,
  conversationId: string,
  participantUserIds: string[]
) {
  const conversationRoom = buildConversationRoomName(conversationId);

  await Promise.all(
    participantUserIds.map((userId) =>
      io.in(buildUserRoomName(userId)).socketsJoin(conversationRoom)
    )
  );
}

async function emitConversationSummaryUpdates(
  io: SocketServer,
  conversationId: string,
  participantUserIds: string[]
) {
  await Promise.all(
    participantUserIds.map(async (userId) => {
      const conversation = await getConversationSummary({
        conversationId,
        viewerId: userId
      });

      io.to(buildUserRoomName(userId)).emit("conversation:summary:updated", {
        conversation
      });
    })
  );
}

export async function initializeMessagesRealtimeConnection(
  io: SocketServer,
  socket: AuthenticatedSocket
) {
  socket.join(buildUserRoomName(socket.data.authUser.id));
  void joinExistingConversationRooms(socket);

  socket.on("conversations:sync", async (rawInput, ack: AckPayload) => {
    const parsedInput = realtimeListConversationsSchema.safeParse(rawInput);

    if (!parsedInput.success) {
      acknowledgeValidationError(
        ack,
        parsedInput.error,
        "Invalid realtime inbox sync payload."
      );
      return;
    }

    try {
      const response = await listConversations({
        query: parsedInput.data,
        viewerId: socket.data.authUser.id
      });

      ack(response);
    } catch (error) {
      ack(toSocketErrorPayload(error));
    }
  });

  socket.on(
    "conversation:messages:sync",
    async (rawInput, ack: AckPayload) => {
      const parsedInput =
        realtimeListConversationMessagesSchema.safeParse(rawInput);

      if (!parsedInput.success) {
        acknowledgeValidationError(
          ack,
          parsedInput.error,
          "Invalid realtime thread sync payload."
        );
        return;
      }

      try {
        const { conversationId, ...query } = parsedInput.data;
        const response = await getConversationMessages({
          conversationId,
          query,
          viewerId: socket.data.authUser.id
        });

        await joinParticipantsToConversationRoom(io, conversationId, [
          socket.data.authUser.id
        ]);
        ack(response);
      } catch (error) {
        ack(toSocketErrorPayload(error));
      }
    }
  );

  socket.on(
    "conversation:message:create",
    async (rawInput, ack: AckPayload) => {
      const parsedInput =
        realtimeCreateConversationMessageSchema.safeParse(rawInput);

      if (!parsedInput.success) {
        acknowledgeValidationError(
          ack,
          parsedInput.error,
          "Invalid realtime message payload."
        );
        return;
      }

      try {
        const { clientMessageId, content, conversationId } = parsedInput.data;
        const response = await createConversationMessageRealtime({
          body: {
            clientMessageId,
            content
          },
          conversationId,
          viewerId: socket.data.authUser.id
        });

        await joinParticipantsToConversationRoom(
          io,
          conversationId,
          response.participantUserIds
        );

        if (response.created) {
          io.to(buildConversationRoomName(conversationId)).emit(
            "conversation:message:created",
            {
              message: response.message
            }
          );

          await emitConversationSummaryUpdates(
            io,
            conversationId,
            response.participantUserIds
          );
        }

        ack({
          message: response.message
        });
      } catch (error) {
        ack(toSocketErrorPayload(error));
      }
    }
  );

  socket.on("conversation:read:update", async (rawInput, ack: AckPayload) => {
    const parsedInput = realtimeMarkConversationReadSchema.safeParse(rawInput);

    if (!parsedInput.success) {
      acknowledgeValidationError(
        ack,
        parsedInput.error,
        "Invalid realtime read-state payload."
      );
      return;
    }

    try {
      const { conversationId, messageId } = parsedInput.data;
      const response = await markConversationReadRealtime({
        body: {
          messageId
        },
        conversationId,
        viewerId: socket.data.authUser.id
      });

      await joinParticipantsToConversationRoom(
        io,
        conversationId,
        response.participantUserIds
      );
      await emitConversationSummaryUpdates(
        io,
        conversationId,
        response.participantUserIds
      );

      io.to(buildConversationRoomName(conversationId)).emit(
        "conversation:read:updated",
        {
          conversationId,
          readState: response.readState,
          userId: socket.data.authUser.id
        }
      );

      ack({
        readState: response.readState
      });
    } catch (error) {
      ack(toSocketErrorPayload(error));
    }
  });
}
