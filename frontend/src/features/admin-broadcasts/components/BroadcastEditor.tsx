import { useEffect, useMemo, useRef, useState } from "react";

import {
  createAdminBroadcast,
  launchAdminBroadcast,
  previewBroadcastAudience,
  testAdminBroadcast,
  updateAdminBroadcast,
  type AdminBroadcast,
  type AdminBroadcastAudience,
  type AdminBroadcastDraft,
} from "@/api/adminBroadcasts";
import type { Program } from "@/types/workout";
import { toUserMessage } from "@/utils/errors";

type Props = {
  selected: AdminBroadcast | null;
  programs: Program[];
  onChanged: (campaign: AdminBroadcast) => void;
};

const DEFAULT_AUDIENCE: AdminBroadcastAudience = { kind: "all_telegram" };
const ADMIN_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function audienceValid(audience: AdminBroadcastAudience): boolean {
  if (["active", "inactive_workouts"].includes(audience.kind)) return Boolean(audience.days);
  if (audience.kind === "program") return Boolean(audience.program_id);
  if (audience.kind === "subscription") return Boolean(audience.subscription_status);
  return true;
}

export function BroadcastEditor({ selected, programs, onChanged }: Props) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<AdminBroadcastAudience>(DEFAULT_AUDIENCE);
  const [campaign, setCampaign] = useState<AdminBroadcast | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState("");
  const previewSequence = useRef(0);

  useEffect(() => {
    if (!selected) return;
    setCampaign(selected);
    setTitle(selected.title);
    setMessage(selected.message_text);
    setAudience(selected.audience);
    setExpected(selected.counts.expected);
    setDirty(false);
    setConfirming(false);
    setNote(
      selected.status === "draft"
        ? "Черновик открыт для редактирования."
        : selected.status === "tested"
          ? "Тест доставлен администратору. Теперь можно подтвердить запуск."
          : selected.status === "scheduled"
            ? "Рассылка поставлена в очередь."
            : null,
    );
  }, [selected]);

  useEffect(() => {
    const sequence = ++previewSequence.current;
    if (!audienceValid(audience)) {
      setExpected(null);
      setPreviewError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void previewBroadcastAudience(audience, controller.signal)
        .then((count) => {
          if (sequence !== previewSequence.current) return;
          setExpected(count);
          setPreviewError(null);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted || sequence !== previewSequence.current) return;
          setPreviewError(toUserMessage(reason, "Не удалось рассчитать аудиторию."));
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [audience]);

  const draft = useMemo<AdminBroadcastDraft>(
    () => ({ title: title.trim(), message_text: message.trim(), audience }),
    [audience, message, title],
  );
  const editable = !campaign || ["draft", "tested"].includes(campaign.status);
  const canSave = editable && draft.title.length > 0 && draft.message_text.length > 0 && audienceValid(audience);
  const requiredText = `РАЗОСЛАТЬ ${expected ?? 0}`;

  function markDirty() {
    setDirty(true);
    setNote(null);
    setConfirming(false);
  }

  async function save(): Promise<AdminBroadcast> {
    if (!canSave) throw new Error("Заполните заголовок, текст и параметры аудитории.");
    setBusy("save");
    setError(null);
    try {
      const saved = campaign
        ? await updateAdminBroadcast(campaign.id, draft)
        : await createAdminBroadcast(draft);
      setCampaign(saved);
      setExpected(saved.counts.expected);
      setDirty(false);
      setNote("Черновик сохранён. Изменения требуют новой тестовой отправки.");
      onChanged(saved);
      return saved;
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    try {
      await save();
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось сохранить черновик."));
    }
  }

  async function onTest() {
    setBusy("test");
    setError(null);
    try {
      let target = campaign;
      if (!target || dirty) target = await save();
      const tested = await testAdminBroadcast(target.id);
      setCampaign(tested);
      setDirty(false);
      setNote("Тест доставлен администратору. Теперь можно подтвердить запуск.");
      onChanged(tested);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось отправить тест."));
    } finally {
      setBusy(null);
    }
  }

  async function onLaunch() {
    if (!campaign || expected == null) return;
    setBusy("launch");
    setError(null);
    try {
      const launched = await launchAdminBroadcast(campaign.id, {
        expectedCount: expected,
        confirmationText: confirmation,
        scheduledAt: scheduleEnabled && scheduledLocal
          ? new Date(scheduledLocal).toISOString()
          : undefined,
        scheduledTimezone: ADMIN_TIMEZONE,
      });
      setCampaign(launched);
      setConfirming(false);
      setNote(scheduleEnabled ? "Рассылка запланирована." : "Рассылка поставлена в очередь.");
      onChanged(launched);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось запустить рассылку."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-tg-secondary p-4">
      <div>
        <h2 className="font-semibold text-tg-text">Редактор сообщения</h2>
        <p className="mt-1 text-xs text-tg-hint">Сначала сохраните и отправьте тест только себе.</p>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      {previewError ? <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{previewError}</p> : null}
      {note ? <p className="rounded-xl bg-tg-bg p-3 text-sm text-tg-hint">{note}</p> : null}
      <label className="block text-xs text-tg-hint">
        Заголовок
        <input
          value={title}
          maxLength={80}
          disabled={!editable}
          onChange={(event) => { setTitle(event.target.value); markDirty(); }}
          className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text disabled:opacity-60"
          placeholder="Например: Новая неделя тренировок"
        />
      </label>
      <label className="block text-xs text-tg-hint">
        Текст · {message.length}/3000
        <textarea
          value={message}
          maxLength={3000}
          rows={6}
          disabled={!editable}
          onChange={(event) => { setMessage(event.target.value); markDirty(); }}
          className="mt-1 w-full rounded-xl border border-black/10 bg-tg-bg p-3 text-base text-tg-text disabled:opacity-60"
          placeholder="Короткое полезное сообщение без HTML-разметки"
        />
      </label>

      <div className="rounded-xl bg-tg-bg p-3" aria-label="Предварительный вид Telegram-сообщения">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint">Предварительный вид Telegram</p>
        <div className="mt-2 max-w-md rounded-2xl rounded-bl-md bg-tg-secondary p-3 text-sm whitespace-pre-wrap">
          <p className="font-semibold">🔔 {title || "Заголовок"}</p>
          <p className="mt-1">{message || "Текст сообщения появится здесь."}</p>
          <div className="mt-3 rounded-lg bg-tg-button px-3 py-2 text-center text-xs font-semibold text-tg-button-text">Открыть приложение</div>
        </div>
      </div>

      <label className="block text-xs text-tg-hint">
        Аудитория
        <select
          value={audience.kind}
          disabled={!editable}
          onChange={(event) => {
            setAudience({ kind: event.target.value as AdminBroadcastAudience["kind"] });
            markDirty();
          }}
          className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
        >
          <option value="all_telegram">Все пользователи с Telegram</option>
          <option value="active">Активные за период</option>
          <option value="onboarding_incomplete">Не завершили анкету</option>
          <option value="inactive_workouts">Не тренировались</option>
          <option value="program">Конкретная программа</option>
          <option value="subscription">Статус подписки</option>
        </select>
      </label>
      {["active", "inactive_workouts"].includes(audience.kind) ? (
        <label className="block text-xs text-tg-hint">
          Дней
          <input type="number" min={1} max={365} value={audience.days ?? 30} onChange={(event) => { setAudience({ ...audience, days: Number(event.target.value) }); markDirty(); }} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base" />
        </label>
      ) : null}
      {audience.kind === "program" ? (
        <label className="block text-xs text-tg-hint">
          Программа
          <select value={audience.program_id ?? ""} onChange={(event) => { setAudience({ ...audience, program_id: event.target.value || null }); markDirty(); }} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base">
            <option value="">Выберите программу</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
      ) : null}
      {audience.kind === "subscription" ? (
        <label className="block text-xs text-tg-hint">
          Подписка
          <select value={audience.subscription_status ?? ""} onChange={(event) => { setAudience({ ...audience, subscription_status: event.target.value as "free" | "pro_stars" }); markDirty(); }} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base">
            <option value="">Выберите статус</option><option value="free">Бесплатная</option><option value="pro_stars">Pro Stars</option>
          </select>
        </label>
      ) : null}
      <p className="rounded-xl bg-tg-bg p-3 text-sm"><span className="text-tg-hint">Ожидается получателей:</span> <strong>{expected ?? "—"}</strong></p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" disabled={!canSave || Boolean(busy)} onClick={() => void onSave()} className="min-h-11 rounded-xl bg-tg-bg px-4 py-3 text-sm font-semibold text-tg-link disabled:opacity-40">{busy === "save" ? "Сохраняем…" : "Сохранить черновик"}</button>
        <button type="button" disabled={!canSave || Boolean(busy)} onClick={() => void onTest()} className="min-h-11 rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-40">{busy === "test" ? "Отправляем…" : "Отправить тест себе"}</button>
      </div>

      {campaign?.status === "tested" && !dirty ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          {!confirming ? <button type="button" onClick={() => setConfirming(true)} className="min-h-11 w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white">Перейти к запуску</button> : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Подтвердите массовую отправку для {expected} получателей</p>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="h-5 w-5" />Я проверил текст, аудиторию и тестовое сообщение</label>
              <label className="block text-xs text-tg-hint">Для второго подтверждения введите <strong>{requiredText}</strong><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base" /></label>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} className="h-5 w-5" />Отправить по расписанию</label>
              {scheduleEnabled ? <label className="block text-xs text-tg-hint">Дата и время · {ADMIN_TIMEZONE}<input aria-label="Время отправки" type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base" /></label> : null}
              <div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl bg-tg-bg px-3 text-sm">Отмена</button><button type="button" disabled={!checked || confirmation !== requiredText || (scheduleEnabled && !scheduledLocal) || Boolean(busy)} onClick={() => void onLaunch()} className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "launch" ? "Ставим…" : "Запустить"}</button></div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
