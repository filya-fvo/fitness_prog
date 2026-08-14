const configuredAdminUsernames = new Set(
  String(import.meta.env.VITE_ADMIN_TELEGRAM_USERNAMES || "Filatov_Slava")
    .split(",")
    .map((value) => value.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean),
);

export function isAdminUsername(username: string | null | undefined): boolean {
  const normalized = String(username || "").trim().replace(/^@/, "").toLowerCase();
  return Boolean(normalized && configuredAdminUsernames.has(normalized));
}

