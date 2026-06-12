let currentAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function setAccessToken(token: string): void {
  currentAccessToken = token;
}

export function clearAccessToken(): void {
  currentAccessToken = null;
}
