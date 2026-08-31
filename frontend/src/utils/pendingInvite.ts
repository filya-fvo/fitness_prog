const PENDING_INVITE_KEY = "fitness_pending_invite";
const HANDLED_INVITE_KEY = "fitness_handled_invite";
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function validInviteToken(value: string): boolean {
  return INVITE_TOKEN_PATTERN.test(value.trim());
}

export function rememberPendingInvite(value: string): void {
  const token = value.trim();
  if (!validInviteToken(token) || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PENDING_INVITE_KEY, token);
}

export function claimInviteStartParam(value: string): boolean {
  const token = value.trim();
  if (!validInviteToken(token) || typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem(HANDLED_INVITE_KEY) === token) return false;
  sessionStorage.setItem(HANDLED_INVITE_KEY, token);
  rememberPendingInvite(token);
  return true;
}

export function pendingInvitePath(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const token = sessionStorage.getItem(PENDING_INVITE_KEY) ?? "";
  return validInviteToken(token) ? `/invite?token=${encodeURIComponent(token)}` : null;
}

export function consumePendingInvitePath(): string | null {
  const path = pendingInvitePath();
  clearPendingInvite();
  return path;
}

export function clearPendingInvite(): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(PENDING_INVITE_KEY);
}
