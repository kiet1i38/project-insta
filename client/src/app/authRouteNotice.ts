let nextAuthNotice: string | null = null;

export function clearNextAuthNotice(): void {
  nextAuthNotice = null;
}

export function readNextAuthNotice(): string | null {
  return nextAuthNotice;
}

export function storeNextAuthNotice(notice: string): void {
  nextAuthNotice = notice;
}
