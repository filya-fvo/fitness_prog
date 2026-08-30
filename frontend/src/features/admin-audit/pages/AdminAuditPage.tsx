import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchAdminAudit,
  type AdminAuditFilters,
  type AdminAuditResponse,
} from "@/api/adminAudit";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

import {
  ADMIN_AUDIT_PAGE_SIZE,
  formatAuditValue,
  toApiFilters,
} from "../adminAuditView";
import { AdminAuditExport } from "../components/AdminAuditExport";
import { AdminAuditObject } from "../components/AdminAuditObject";

const ACTION_LABELS: Record<string, string> = {
  "audit.export": "Экспорт журнала",
  "user.clear.workouts": "Очистка тренировок",
  "user.clear.nutrition": "Очистка питания",
  "user.clear.measurements": "Очистка замеров",
  "user.clear.all": "Полная очистка профиля",
  "user.archive": "Архивирование пользователя",
  "notification.delivery": "Доставка уведомления",
  "exercise.create": "Добавление упражнения",
  "exercise.update": "Изменение упражнения",
  "exercise.archive": "Архивирование упражнения",
  "program.create": "Добавление программы",
  "program.update": "Изменение программы",
  "program.archive": "Архивирование программы",
  "broadcast.create": "Создание черновика рассылки",
  "broadcast.update": "Изменение черновика рассылки",
  "broadcast.test": "Тест рассылки",
  "broadcast.launch": "Запуск рассылки",
  "broadcast.retry": "Повтор ошибок рассылки",
  "broadcast.resume": "Возобновление очереди рассылки",
  "broadcast.complete": "Завершение рассылки",
};

const FIELD_LABELS: Record<string, string> = {
  format: "Формат",
  exported_count: "Выгружено записей",
  total_matches: "Найдено записей",
  truncated: "Ограничено лимитом",
  scope: "Раздел",
  stats: "Удалено записей",
  is_deleted: "В архиве",
  channel: "Канал",
  requested: "Отправка запрошена",
  name: "Название",
  muscle_group: "Группа мышц",
  equipment: "Оборудование",
  difficulty: "Сложность",
  media_source: "Источник медиа",
  tags: "Теги",
  workout_type: "Тип тренировки",
  level: "Уровень",
  target_level: "Целевой уровень",
  duration_weeks: "Недель",
  is_template: "Шаблон",
  days_count: "Тренировочных дней",
  audience: "Аудитория",
  expected: "Получателей",
  pending: "Ожидает",
  sent: "Доставлено",
  failed: "Ошибок",
  skipped: "Пропущено",
  status: "Статус",
  scheduled: "По расписанию",
};

const OBJECT_LABELS: Record<string, string> = {
  audit_export: "Выгрузка журнала",
  user: "Пользователь",
  exercise: "Упражнение",
  program: "Программа",
  broadcast: "Рассылка",
};

const NOTIFICATION_LABELS: Record<string, string> = {
  pending: "Ожидает отправки",
  sent: "Доставлено",
  failed: "Ошибка доставки",
  not_requested: "Не запрашивалось",
  unavailable: "Канал недоступен",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "medium",
});

type FilterForm = {
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
  query: string;
  action: string;
  result: string;
};

const EMPTY_FILTERS: FilterForm = {
  dateFrom: "",
  dateTo: "",
  actorUserId: "",
  query: "",
  action: "",
  result: "",
};

function Snapshot({ title, values }: { title: string; values: Record<string, unknown> }) {
  const entries = Object.entries(values);
  if (!entries.length) return null;
  return (
    <div className="rounded-xl bg-tg-bg p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tg-hint">{title}</p>
      <dl className="mt-2 space-y-1 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-tg-hint">{FIELD_LABELS[key] || key}</dt>
            <dd className="max-w-[60%] break-words text-right text-tg-text">
              {formatAuditValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AdminAuditPage() {
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AdminAuditFilters>({});
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);

  const load = useCallback(async (nextFilters: AdminAuditFilters, nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await fetchAdminAudit(nextFilters, {
          limit: ADMIN_AUDIT_PAGE_SIZE,
          offset: nextOffset,
        }),
      );
    } catch (loadError) {
      setError(toUserMessage(loadError, "Не удалось загрузить журнал действий."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && allowed && !initialLoadStarted.current) {
      initialLoadStarted.current = true;
      void load({}, 0);
    }
  }, [allowed, isAuthLoading, load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = toApiFilters(form);
    setFilters(nextFilters);
    setOffset(0);
    void load(nextFilters, 0);
  }

  function clearFilters() {
    setForm(EMPTY_FILTERS);
    setFilters({});
    setOffset(0);
    void load({}, 0);
  }

  function movePage(nextOffset: number) {
    setOffset(nextOffset);
    void load(filters, nextOffset);
  }

  if (isAuthLoading) {
    return (
      <section>
        <Header title="Журнал действий" subtitle="Проверка доступа…" fallbackTo="/admin" />
        <PageSkeleton cards={4} />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section>
        <Header title="Журнал действий" subtitle="Доступ ограничен" fallbackTo="/admin" />
        <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">
          Журнал доступен только настроенным администраторам.
          <Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Header
        title="Журнал действий"
        subtitle="Неизменяемая история операций администраторов"
        fallbackTo="/admin"
      />

      <form onSubmit={applyFilters} className="mb-4 grid gap-3 rounded-2xl bg-tg-secondary p-4 md:grid-cols-2">
        <label className="text-xs text-tg-hint md:col-span-2">
          Пользователь или объект
          <input
            type="search"
            value={form.query}
            maxLength={120}
            onChange={(event) => setForm({ ...form, query: event.target.value })}
            placeholder="@логин, email, Telegram ID, название или UUID"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          />
        </label>
        <label className="text-xs text-tg-hint">
          С даты
          <input
            type="datetime-local"
            value={form.dateFrom}
            onChange={(event) => setForm({ ...form, dateFrom: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          />
        </label>
        <label className="text-xs text-tg-hint">
          По дату
          <input
            type="datetime-local"
            value={form.dateTo}
            onChange={(event) => setForm({ ...form, dateTo: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          />
        </label>
        <label className="text-xs text-tg-hint">
          Администратор
          <select
            value={form.actorUserId}
            onChange={(event) => setForm({ ...form, actorUserId: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          >
            <option value="">Все</option>
            {data?.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-tg-hint">
          Действие
          <select
            value={form.action}
            onChange={(event) => setForm({ ...form, action: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          >
            <option value="">Все</option>
            {data?.actions.map((action) => (
              <option key={action} value={action}>{ACTION_LABELS[action] || "Другое действие"}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-tg-hint md:col-span-2">
          Результат
          <select
            value={form.result}
            onChange={(event) => setForm({ ...form, result: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base text-tg-text"
          >
            <option value="">Все</option>
            <option value="success">Успешно</option>
            <option value="failure">Ошибка</option>
          </select>
        </label>
        <button type="submit" disabled={loading} className="min-h-11 rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50">
          Применить
        </button>
        <button type="button" disabled={loading} onClick={clearFilters} className="min-h-11 rounded-xl bg-tg-bg px-4 py-3 text-sm text-tg-link disabled:opacity-50">
          Сбросить
        </button>
      </form>

      {data ? <AdminAuditExport filters={filters} total={data.total} /> : null}

      {loading && !data ? <PageSkeleton cards={4} /> : null}
      {error ? (
        <div role="alert" className="mb-4 rounded-2xl bg-tg-secondary p-4 text-sm">
          <p>{error}</p>
          <button type="button" onClick={() => void load(filters, offset)} className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 py-3 font-semibold text-tg-button-text">
            Повторить
          </button>
        </div>
      ) : null}
      {!loading && !error && data?.items.length === 0 ? (
        <div className="rounded-2xl bg-tg-secondary p-5 text-center text-sm text-tg-hint">
          За выбранный период действий нет.
        </div>
      ) : null}

      {!error && data?.items.length ? (
        <div className="space-y-3" aria-busy={loading}>
          {data.items.map((item) => (
            <article key={item.id} className="rounded-2xl bg-tg-secondary p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-tg-text">{ACTION_LABELS[item.action] || "Другое действие"}</h2>
                  <p className="mt-1 text-xs text-tg-hint">
                    {item.actor_label} · {dateFormatter.format(new Date(item.created_at))}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.result === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                  {item.result === "success" ? "Успешно" : "Ошибка"}
                </span>
              </div>
              <p className="mt-3 text-sm text-tg-text">{item.description}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Snapshot title="До" values={item.before} />
                <Snapshot title="После" values={item.after} />
              </div>
              <dl className="mt-3 space-y-1 border-t border-black/10 pt-3 text-[11px] text-tg-hint">
                <div className="flex justify-between gap-3">
                  <dt>Объект</dt>
                  <dd className="max-w-[70%] break-words text-right">
                    <AdminAuditObject
                      objectType={item.object_type}
                      objectId={item.object_id}
                      objectLabel={item.object_label}
                      typeLabel={OBJECT_LABELS[item.object_type] || "Объект"}
                    />
                  </dd>
                </div>
                {item.notification_status ? <div className="flex justify-between gap-3"><dt>Уведомление</dt><dd>{NOTIFICATION_LABELS[item.notification_status] || "Нет данных"}</dd></div> : null}
                <div className="flex justify-between gap-3"><dt>Код запроса</dt><dd className="break-all text-right">{item.correlation_id}</dd></div>
              </dl>
            </article>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-tg-secondary p-3 text-xs">
            <button type="button" disabled={loading || offset === 0} onClick={() => movePage(Math.max(0, offset - ADMIN_AUDIT_PAGE_SIZE))} className="min-h-11 rounded-xl bg-tg-bg px-4 text-tg-link disabled:opacity-40">Назад</button>
            <span className="text-center text-tg-hint">{offset + 1}–{Math.min(offset + data.items.length, data.total)} из {data.total}</span>
            <button type="button" disabled={loading || offset + data.items.length >= data.total} onClick={() => movePage(offset + ADMIN_AUDIT_PAGE_SIZE)} className="min-h-11 rounded-xl bg-tg-bg px-4 text-tg-link disabled:opacity-40">Дальше</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
