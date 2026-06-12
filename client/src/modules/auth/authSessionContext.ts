import { createContext, useContext } from "react";
import type { AuthUser, LoginInput, RegisterInput } from "./authApi";

export type AuthStatus = "authenticated" | "bootstrapping" | "guest";

export type AuthSessionContextValue = {
  accessToken: string | null;
  login: (input: LoginInput) => Promise<void>;
  logout: (options?: { notice?: string }) => Promise<void>;
  refresh: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  status: AuthStatus;
  user: AuthUser | null;
};

export const AuthSessionContext = createContext<
  AuthSessionContextValue | undefined
>(undefined);

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider.");
  }

  return context;
}
