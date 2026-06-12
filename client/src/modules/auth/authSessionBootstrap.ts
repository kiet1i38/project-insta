import {
  hasStoredCsrfToken,
  refreshAuthSession,
  type AuthSessionResponse
} from "./authApi";

let bootstrapSessionPromise: Promise<AuthSessionResponse | null> | null = null;
let bootstrapSessionSnapshot: AuthSessionResponse | null = null;
let hasResolvedBootstrapSession = false;

export function storeBootstrapSession(
  session: AuthSessionResponse | null
): AuthSessionResponse | null {
  bootstrapSessionSnapshot = session;
  hasResolvedBootstrapSession = true;
  return session;
}

export async function resolveBootstrapSession(): Promise<AuthSessionResponse | null> {
  if (hasResolvedBootstrapSession) {
    return bootstrapSessionSnapshot;
  }

  if (!bootstrapSessionPromise) {
    bootstrapSessionPromise = (async () => {
      if (!hasStoredCsrfToken()) {
        return storeBootstrapSession(null);
      }

      try {
        return storeBootstrapSession(await refreshAuthSession());
      } catch {
        return storeBootstrapSession(null);
      }
    })();
  }

  return bootstrapSessionPromise;
}

export function resetBootstrapSessionState(): void {
  bootstrapSessionPromise = null;
  bootstrapSessionSnapshot = null;
  hasResolvedBootstrapSession = false;
}
