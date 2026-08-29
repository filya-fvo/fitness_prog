import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  fetchAdminUserActivity,
  fetchAdminUserCommunications,
  fetchAdminUserSummary,
  type AdminUserActivity,
  type AdminUserCommunications,
  type AdminUserSummary,
} from "@/api/adminUser";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { enumLabel, subscriptionLabel } from "@/utils/localization";
import { toUserMessage } from "@/utils/errors";

import { AdminUserActions } from "../components/AdminUserActions";

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

function formatDate(value: string | null, withTime = true) {
  if (!value) return "Нет данных";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Нет данных" : (withTime ? dateTime : dateOnly).format(parsed);
}

function Info({ label, value }: { label: string; value: string | number | null }) {
  return <div className="flex justify-between gap-3"><dt className="text-tg-hint">{label}</dt><dd className="max-w-[60%] break-words text-right">{value ?? "Не указано"}</dd></div>;
}

function LoadBlock({ title, loaded, loading, error, onLoad, children }: {
  title: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-tg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" disabled={loading} onClick={onLoad} className="min-h-11 px-2 text-sm text-tg-link disabled:opacity-40">
          {loading ? "Загрузка…" : loaded ? "Обновить" : "Загрузить"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
      {loaded ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export function AdminUserPage() {
  const { userId = "" } = useParams();
  const currentUser = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(currentUser?.username), [currentUser?.username]);
  const [summary, setSummary] = useState<AdminUserSummary | null>(null);
  const [activity, setActivity] = useState<AdminUserActivity | null>(null);
  const [communications, setCommunications] = useState<AdminUserCommunications | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [communicationsLoading, setCommunicationsLoading] = useState(false);
  const startedUserId = useRef<string | null>(null);
  const detailsStartedUserId = useRef<string | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try { setSummary(await fetchAdminUserSummary(userId)); }
    catch (error) { setSummaryError(toUserMessage(error, "Не удалось загрузить карточку")); }
    finally { setSummaryLoading(false); }
  }, [userId]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try { setActivity(await fetchAdminUserActivity(userId)); }
    catch (error) { setActivityError(toUserMessage(error, "Не удалось загрузить активность")); }
    finally { setActivityLoading(false); }
  }, [userId]);

  const loadCommunications = useCallback(async () => {
    setCommunicationsLoading(true);
    setCommunicationsError(null);
    try { setCommunications(await fetchAdminUserCommunications(userId)); }
    catch (error) { setCommunicationsError(toUserMessage(error, "Не удалось загрузить настройки связи")); }
    finally { setCommunicationsLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (!isAuthLoading && allowed && startedUserId.current !== userId) {
      startedUserId.current = userId;
      detailsStartedUserId.current = null;
      setSummary(null);
      setActivity(null);
      setCommunications(null);
      void loadSummary();
    }
  }, [allowed, isAuthLoading, loadSummary, userId]);

  useEffect(() => {
    if (!summary || detailsStartedUserId.current === summary.id) return;
    detailsStartedUserId.current = summary.id;
    void Promise.all([loadActivity(), loadCommunications()]);
  }, [loadActivity, loadCommunications, summary]);

  if (isAuthLoading) return <section><Header title="Карточка пользователя" fallbackTo="/admin" /><PageSkeleton cards={4} /></section>;
  if (!allowed) return (
    <section>
      <Header title="Карточка пользователя" subtitle="Доступ ограничен" fallbackTo="/admin" />
      <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Раздел доступен только администраторам.<Link to="/" className="mt-3 block text-tg-link">На главную</Link></div>
    </section>
  );
  if (!summary && summaryLoading) return <section><Header title="Карточка пользователя" fallbackTo="/admin" /><PageSkeleton cards={4} /></section>;
  if (!summary) return (
    <section>
      <Header title="Карточка пользователя" fallbackTo="/admin" />
      <div role="alert" className="rounded-2xl bg-tg-secondary p-4 text-sm"><p>{summaryError || "Карточка не найдена."}</p><button type="button" onClick={() => void loadSummary()} className="mt-3 min-h-11 w-full rounded-xl bg-tg-button text-tg-button-text">Повторить</button></div>
    </section>
  );

  const profile = summary.questionnaire;
  return (
    <section className="space-y-4">
      <Header title={summary.display_name} subtitle="Карточка пользователя" fallbackTo="/admin" />

      <section className="rounded-2xl bg-tg-secondary p-4">
        <h2 className="font-semibold">Профиль и вход</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Info label="Способы входа" value={summary.login_methods.map((item) => item === "telegram" ? "Telegram" : "Email").join(" + ") || "Нет"} />
          <Info label="Telegram" value={summary.username ? `@${summary.username.replace(/^@/, "")}` : summary.telegram_id} />
          <Info label="Email" value={summary.auth_email} />
          <Info label="Объединение" value={enumLabel(summary.merge_state)} />
          <Info label="Регистрация" value={formatDate(summary.registered_at)} />
          <Info label="Последняя активность" value={formatDate(summary.last_activity_at)} />
          <Info label="Подписка" value={subscriptionLabel(summary.subscription_status)} />
          <Info label="Stars" value={summary.stars_balance} />
        </dl>
      </section>

      <section className="rounded-2xl bg-tg-secondary p-4">
        <h2 className="font-semibold">Анкета и программа</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Info label="Анкета" value={summary.onboarding_completed ? "Заполнена" : "Не завершена"} />
          <Info label="Цель" value={profile.primary_goal ? enumLabel(profile.primary_goal) : null} />
          <Info label="Уровень" value={profile.level ? enumLabel(profile.level) : null} />
          <Info label="Пол / возраст" value={[profile.sex ? enumLabel(profile.sex) : null, profile.age ? `${profile.age} лет` : null].filter(Boolean).join(" · ") || null} />
          <Info label="Рост / вес / цель" value={[profile.height_cm ? `${profile.height_cm} см` : null, profile.weight_kg ? `${profile.weight_kg} кг` : null, profile.target_weight_kg ? `цель ${profile.target_weight_kg} кг` : null].filter(Boolean).join(" · ") || null} />
          <Info label="Тренировки" value={[profile.location ? enumLabel(profile.location) : null, profile.days_per_week ? `${profile.days_per_week} дн./нед.` : null].filter(Boolean).join(" · ") || null} />
          <Info label="Инвентарь" value={profile.equipment.map((item) => enumLabel(item)).join(", ") || null} />
          <Info label="Ограничения" value={[...profile.limitations.map((item) => enumLabel(item)), profile.limitations_note].filter(Boolean).join(", ") || null} />
          <Info label="Программа" value={summary.active_program ? `${summary.active_program.name}${summary.active_program.next_day ? ` · день ${summary.active_program.next_day}` : ""}` : null} />
        </dl>
      </section>

      <LoadBlock title="Тренировки и записи" loaded={activity != null} loading={activityLoading} error={activityError} onLoad={() => void loadActivity()}>
        {activity ? <div className="space-y-3 text-sm">
          <p className="rounded-xl bg-tg-bg p-3">Следующая: {activity.next_workout ? `${activity.next_workout.target_date} · ${activity.next_workout.start_time.slice(0, 5)} · ${activity.next_workout.title}` : "не запланирована"}</p>
          <p className="text-xs text-tg-hint">Тренировки {activity.counts.completed_workouts}/{activity.counts.workouts} · питание {activity.counts.nutrition_logs} · замеры {activity.counts.body_measurements} · записи веса {activity.counts.weight_entries}</p>
          {activity.recent_workouts.map((item) => <div key={item.id} className="rounded-xl bg-tg-bg p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-xs text-tg-hint">{item.scheduled_date} · {enumLabel(item.status)} · подходы {item.completed_sets}/{item.sets_count}{item.rpe ? ` · RPE ${item.rpe}` : ""}</p></div>)}
          {!activity.recent_workouts.length ? <p className="text-tg-hint">Тренировок пока нет.</p> : null}
        </div> : null}
      </LoadBlock>

      <LoadBlock title="Связь и уведомления" loaded={communications != null} loading={communicationsLoading} error={communicationsError} onLoad={() => void loadCommunications()}>
        {communications ? <div className="space-y-3 text-sm">
          <p className="text-xs text-tg-hint">Telegram: {communications.telegram_available ? "доступен" : "не подключён"} · Web Push: {communications.web_push.active}/{communications.web_push.total} · Email: {!communications.email_available ? "не подключён" : communications.email_service_messages_allowed ? "разрешён" : "нет согласия"} · часовой пояс: {communications.timezone}</p>
          {communications.categories.map((item) => <div key={item.key} className="flex justify-between gap-3 rounded-xl bg-tg-bg p-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-tg-hint">{item.details}</p></div><span className={item.enabled ? "text-emerald-600" : "text-tg-hint"}>{item.enabled ? "Вкл." : "Выкл."}</span></div>)}
          <div><h3 className="text-xs font-semibold uppercase text-tg-hint">Последние действия</h3>{communications.recent_events.map((item) => <div key={item.id} className="mt-2 rounded-xl bg-tg-bg p-3"><p>{item.description}</p><p className="mt-1 text-xs text-tg-hint">{item.actor_label} · {formatDate(item.created_at)}</p></div>)}{!communications.recent_events.length ? <p className="mt-2 text-tg-hint">Действий пока нет.</p> : null}</div>
        </div> : null}
      </LoadBlock>

      <AdminUserActions
        userId={summary.id}
        displayName={summary.display_name}
        currentUserId={currentUser?.id}
        telegramAvailable={summary.telegram_id != null}
        emailAvailable={communications?.email_available ?? summary.auth_email != null}
        emailAllowed={communications?.email_service_messages_allowed ?? false}
        webPushActive={communications?.web_push.active ?? 0}
        remindersEnabled={communications?.reminders_enabled ?? null}
        communicationsLoading={communicationsLoading}
        communicationsError={communicationsError}
        onCommunicationsChanged={loadCommunications}
        onDataChanged={async () => {
          await loadSummary();
          if (activity) await loadActivity();
          if (communications) await loadCommunications();
        }}
      />
    </section>
  );
}
