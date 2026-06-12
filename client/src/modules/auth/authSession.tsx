import {
  useEffect,
  useState,
  type ReactNode
} from "react";
import { storeNextAuthNotice } from "../../app/authRouteNotice";
import { clearAccessToken, setAccessToken } from "./accessTokenStore";
import {
  AuthSessionContext,
  type AuthStatus
} from "./authSessionContext";
import {
  ApiError,
  clearStoredCsrfToken,
  hasStoredCsrfToken,
  loginAuthUser,
  logoutAuthSession,
  refreshAuthSession,
  registerAuthUser,
  type AuthSessionResponse,
  type LoginInput,
  type RegisterInput,
  type AuthUser
} from "./authApi";
import {
  resolveBootstrapSession,
  storeBootstrapSession
} from "./authSessionBootstrap";

export function AuthSessionProvider({
  children
}: {
  children: ReactNode;
}) {
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("bootstrapping");
  const [user, setUser] = useState<AuthUser | null>(null);

  function applyAuthenticatedSession(session: AuthSessionResponse): void {
    storeBootstrapSession(session);
    setAccessToken(session.accessToken);
    setAccessTokenState(session.accessToken);
    setStatus("authenticated");
    setUser(session.user);
  }

  function clearSession(): void {
    storeBootstrapSession(null);
    clearStoredCsrfToken();
    clearAccessToken();
    setAccessTokenState(null);
    setStatus("guest");
    setUser(null);
  }

  async function refresh(): Promise<void> {
    if (!hasStoredCsrfToken()) {
      clearSession();
      return;
    }

    const session = await refreshAuthSession();
    applyAuthenticatedSession(session);
  }

  async function login(input: LoginInput): Promise<void> {
    const session = await loginAuthUser(input);
    applyAuthenticatedSession(session);
  }

  async function register(input: RegisterInput): Promise<void> {
    await registerAuthUser(input);
  }

  async function logout(options?: { notice?: string }): Promise<void> {
    try {
      await logoutAuthSession();

      if (options?.notice) {
        storeNextAuthNotice(options.notice);
      }

      clearSession();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "AUTH_INVALID_SESSION"
      ) {
        if (options?.notice) {
          storeNextAuthNotice(options.notice);
        }

        clearSession();
        return;
      }

      throw error;
    }
  }

  useEffect(() => {
    let isActive = true;

    async function bootstrapSession(): Promise<void> {
      const session = await resolveBootstrapSession();

      if (!isActive) {
        return;
      }

      if (session) {
        applyAuthenticatedSession(session);
      } else {
        clearSession();
      }
    }

    void bootstrapSession();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <AuthSessionContext.Provider
      value={{
        accessToken,
        login,
        logout,
        refresh,
        register,
        status,
        user
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}
