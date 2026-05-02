const LOCAL_SESSION_PREFIX = 'local-session-';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLocalSessionId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LOCAL_SESSION_PREFIX);
}

export function isUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function assertServerSessionId(id: string, label: string): void {
  if (isLocalSessionId(id)) {
    throw new Error(
      `Refusing to send local fallback session ID to server (${label}): ${id}`,
    );
  }
}
