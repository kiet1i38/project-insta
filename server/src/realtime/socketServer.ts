import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { AppError } from "../lib/appError.js";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/accessToken.js";
import {
  createForbiddenError,
  createUnauthorizedError
} from "../modules/auth/auth.errors.js";
import { findUserById } from "../modules/auth/auth.repository.js";
import { initializeMessagesRealtimeConnection } from "../modules/messages/messages.realtime.js";

type RealtimeSocketAuthUser = {
  id: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "BANNED";
  username: string;
};

function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function readHandshakeAccessToken(rawAuth: unknown): string | null {
  if (!rawAuth || typeof rawAuth !== "object") {
    return null;
  }

  const accessToken = (rawAuth as { accessToken?: unknown }).accessToken;

  return typeof accessToken === "string" && accessToken.length > 0
    ? accessToken
    : null;
}

function buildConnectionError(error: AppError): Error & {
  data: {
    code: string;
    message: string;
  };
} {
  const connectionError = new Error(error.code) as Error & {
    data: {
      code: string;
      message: string;
    };
  };

  connectionError.data = {
    code: error.code,
    message: error.message
  };

  return connectionError;
}

async function authenticateRealtimeSocket(input: {
  accessToken: string;
}): Promise<RealtimeSocketAuthUser> {
  let verifiedToken;

  try {
    verifiedToken = await verifyAccessToken(input.accessToken);
  } catch {
    throw createUnauthorizedError();
  }

  const user = await findUserById(verifiedToken.userId);

  if (!user) {
    throw createUnauthorizedError();
  }

  if (user.status !== "ACTIVE") {
    throw createForbiddenError();
  }

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    username: user.username
  };
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    connectionStateRecovery: {},
    cors: {
      credentials: true,
      methods: ["GET", "POST"],
      origin: env.CLIENT_ORIGIN
    },
    serveClient: false
  });

  io.use(async (socket, next) => {
    try {
      const handshakeAccessToken =
        readHandshakeAccessToken(socket.handshake.auth) ??
        readBearerToken(socket.handshake.headers.authorization);

      if (!handshakeAccessToken) {
        throw createUnauthorizedError();
      }

      socket.data.authUser = await authenticateRealtimeSocket({
        accessToken: handshakeAccessToken
      });

      next();
    } catch (error) {
      const appError =
        error instanceof AppError ? error : createUnauthorizedError();
      next(buildConnectionError(appError));
    }
  });

  io.on("connection", (socket) => {
    void initializeMessagesRealtimeConnection(io, socket);
  });

  return io;
}
