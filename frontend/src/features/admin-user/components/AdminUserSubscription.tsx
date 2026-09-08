import { useState } from "react";

import {
  grantAdminTestPlus,
  revokeAdminTestEntitlement,
  type AdminEntitlementReason,
  type AdminUserSummary,
} from "@/api/adminUser";
import { confirmAction } from "@/lib/telegram";
import { toUserMessage } from "@/utils/errors";

type Entitlement = AdminUserSummary["active_entitlements"][number];

const SOURCE_LABELS: Record<Entitlement["source"], string> = {
  beta_grant: "Временный PLUS периода разработки",
  legacy_stars: "Ранее выданный Stars-доступ",
  admin: "Административный доступ",
  qa: "Тестовый QA-доступ",
  telegram_stars: "Telegram Stars",
  web_payment: "Оплата на сайте",
  corporate: "Корпоративный доступ",
  promo: "Промокод",
  partner: "Партнёрский доступ",
};

const REASONS: Array<{ value: AdminEntitlementReason; label: string }> = [
  { value: "free_mode_qa", label: "Проверка режима FREE" },
  { value: "release_check", label: "Проверка релиза" },
  { value: "support_reproduction", label: "Воспроизведение обращения" },
];

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null): string {
  if (!value) return "без ограничения срока";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "дата не определена" : dateTime.format(parsed);
}

export function AdminUserSubscription({
  summary,
  onChanged,
}: {
  summary: AdminUserSummary;
  onChanged: () => Promise<void>;
}) {
  const [durationDays, setDurationDays] = useState(7);
  const [reason, setReason] = useState<AdminEntitlementReason>("free_mode_qa");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reasonLabel = REASONS.find((item) => item.value === reason)?.label ?? "QA-проверка";

  async function perform(key: string, action: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      setNotice(await action());
    } catch (actionError) {
      setError(toUserMessage(actionError, "Не удалось изменить тариф"));
    } finally {
      setBusy(null);
    }
  }

  async function grantPlus() {
    const accepted = await confirmAction(
      `Выдать «${summary.display_name}» тестовый PLUS на ${durationDays} дн.?\nПричина: ${reasonLabel}.`,
    );
    if (!accepted) return;
    void perform("grant", async () => {
      await grantAdminTestPlus(summary.id, durationDays, reason);
      await onChanged();
      return `Тестовый PLUS выдан на ${durationDays} дн.`;
    });
  }

  async function revoke(entitlement: Entitlement) {
    const willBeFree = summary.active_entitlements.length === 1;
    const accepted = await confirmAction(
      `Отозвать только «${SOURCE_LABELS[entitlement.source]}» у «${summary.display_name}»?\n`
      + `${willBeFree ? "После этого аккаунт станет FREE.\n" : "Другие источники PLUS останутся активны.\n"}`
      + `Причина: ${reasonLabel}.`,
    );
    if (!accepted) return;
    void perform(entitlement.id, async () => {
      await revokeAdminTestEntitlement(summary.id, entitlement.id, reason);
      await onChanged();
      return willBeFree ? "Аккаунт переведён в FREE для проверки." : "Выбранное право отозвано.";
    });
  }

  return (
    <section className="rounded-2xl border border-tg-link/20 bg-tg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Тариф и QA-доступ</h2>
          <p className="mt-1 text-xs text-tg-hint">
            Отзыв применяется только к выбранному источнику и не затрагивает остальные.
          </p>
        </div>
        <span className={[
          "rounded-full px-3 py-1 text-xs font-semibold",
          summary.subscription.active
            ? "bg-tg-button text-tg-button-text"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        ].join(" ")}>
          {summary.subscription.active ? "PLUS" : "FREE"}
        </span>
      </div>

      {summary.subscription.valid_until ? (
        <p className="mt-3 text-xs text-tg-hint">
          Эффективный доступ до {formatDate(summary.subscription.valid_until)}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {summary.active_entitlements.map((entitlement) => (
          <div key={entitlement.id} className="rounded-xl bg-tg-bg p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{SOURCE_LABELS[entitlement.source]}</p>
                <p className="mt-1 text-xs text-tg-hint">
                  С {formatDate(entitlement.starts_at)} · до {formatDate(entitlement.ends_at)}
                </p>
              </div>
              {entitlement.revocable ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void revoke(entitlement)}
                  className="min-h-11 shrink-0 rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-600 disabled:opacity-40"
                >
                  {busy === entitlement.id ? "Отзываем…" : "Отозвать"}
                </button>
              ) : (
                <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] text-tg-hint dark:bg-white/5">
                  Защищено
                </span>
              )}
            </div>
          </div>
        ))}
        {!summary.active_entitlements.length ? (
          <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            Аккаунт работает в режиме FREE и готов для проверки ограничений.
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs text-tg-hint">
          Причина
          <select
            value={reason}
            disabled={busy !== null}
            onChange={(event) => setReason(event.target.value as AdminEntitlementReason)}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-2 text-base text-tg-text"
          >
            {REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-tg-hint">
          Срок PLUS
          <select
            value={durationDays}
            disabled={busy !== null}
            onChange={(event) => setDurationDays(Number(event.target.value))}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-2 text-base text-tg-text"
          >
            <option value={1}>1 день</option>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void grantPlus()}
        className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-40"
      >
        {busy === "grant" ? "Выдаём…" : "Выдать тестовый PLUS"}
      </button>
      {notice ? <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    </section>
  );
}
