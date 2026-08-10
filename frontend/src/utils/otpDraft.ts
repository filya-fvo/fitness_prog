/**
 * Persist short-lived email OTP UI state across Telegram WebView reloads
 * (user switches to Mail app and back).
 */

export type OtpDraft = {
  email: string;
  step: "code";
  info?: string | null;
  devCode?: string | null;
  resendUntil?: number | null;
  /** unix ms */
  expiresAt: number;
};

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readOtpDraft(key: string): OtpDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as OtpDraft;
    if (!data || data.step !== "code" || !data.email) {
      localStorage.removeItem(key);
      return null;
    }
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeOtpDraft(
  key: string,
  draft: Omit<OtpDraft, "expiresAt" | "step"> & { ttlMs?: number },
): void {
  if (!canUseStorage()) return;
  const ttl = draft.ttlMs ?? DEFAULT_TTL_MS;
  const payload: OtpDraft = {
    email: draft.email.trim(),
    step: "code",
    info: draft.info ?? null,
    devCode: draft.devCode ?? null,
    resendUntil: draft.resendUntil ?? null,
    expiresAt: Date.now() + ttl,
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearOtpDraft(key: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const OTP_DRAFT_LINK_KEY = "fitness_otp_link_email";
export const OTP_DRAFT_LOGIN_KEY = "fitness_otp_login_email";
