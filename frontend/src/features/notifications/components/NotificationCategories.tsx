import { Link } from "react-router-dom";

import type { NotificationSettings } from "@/api/notifications";
import { WorkoutReminderSettings } from "@/features/profile/components/WorkoutReminderSettings";
import {
  NotificationSection,
  SaveSectionButton,
} from "@/features/notifications/components/NotificationSection";
import {
  timesSummary,
  workoutSummary,
} from "@/features/notifications/notificationSettings";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Category = "workouts" | "water" | "calories" | "measurements" | "supplements";

type Props = {
  settings: NotificationSettings;
  supplementCount: number;
  busy: boolean;
  onChange: (settings: NotificationSettings) => void;
  onSave: (category: Category) => void;
};

export function NotificationCategories(props: Props) {
  const { settings } = props;
  const update = <K extends Category>(key: K, value: NotificationSettings[K]) => {
    props.onChange({ ...settings, [key]: value });
  };

  return (
    <section className="space-y-3" aria-labelledby="notification-types-title">
      <div>
        <h2 id="notification-types-title" className="text-sm font-semibold">Что напоминать</h2>
        <p className="mt-1 text-xs text-tg-hint">Статус виден сразу. Откройте только нужный раздел.</p>
      </div>

      <NotificationSection
        title="Тренировки"
        summary={workoutSummary(settings)}
        enabled={settings.workouts.enabled}
      >
        <WorkoutReminderSettings
          enabled={settings.workouts.enabled}
          startTime={settings.workouts.time}
          remindBeforeMinutes={settings.workouts.remind_before_minutes}
          days={settings.workouts.days}
          onEnabledChange={(enabled) => update("workouts", { ...settings.workouts, enabled })}
          onLeadChange={(remind_before_minutes) => update("workouts", {
            ...settings.workouts,
            remind_before_minutes,
          })}
        />
        <SaveSectionButton busy={props.busy} onClick={() => props.onSave("workouts")} />
      </NotificationSection>

      <NotificationSection
        title="Вода и дневной чек-ин"
        summary={settings.water.enabled
          ? `${settings.water.daily_ml} мл · ${settings.water.start_time}–${settings.water.end_time}`
          : "Выключены"}
        enabled={settings.water.enabled}
      >
        <div className="space-y-3">
          <label className="flex min-h-11 items-center justify-between text-sm">
            <span>Напоминать о воде</span>
            <input
              type="checkbox"
              checked={settings.water.enabled}
              onChange={(event) => update("water", { ...settings.water, enabled: event.target.checked })}
            />
          </label>
          <label className="block text-xs text-tg-hint">Цель, мл в день
            <input
              type="number"
              min={500}
              max={8000}
              step={100}
              value={settings.water.daily_ml}
              onChange={(event) => update("water", {
                ...settings.water,
                daily_ml: Number(event.target.value),
              })}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
            />
          </label>
          <label className="block text-xs text-tg-hint">Интервал, минут
            <input
              type="number"
              min={30}
              max={360}
              step={15}
              value={settings.water.interval_minutes}
              onChange={(event) => update("water", {
                ...settings.water,
                interval_minutes: Number(event.target.value),
              })}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["start_time", "end_time"] as const).map((key) => (
              <label key={key} className="text-xs text-tg-hint">{key === "start_time" ? "Начать" : "Закончить"}
                <input
                  type="time"
                  value={settings.water[key]}
                  onChange={(event) => update("water", { ...settings.water, [key]: event.target.value })}
                  className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
                />
              </label>
            ))}
          </div>
        </div>
        <SaveSectionButton busy={props.busy} onClick={() => props.onSave("water")} />
      </NotificationSection>

      <NotificationSection
        title="Питание"
        summary={settings.calories.enabled ? timesSummary(settings.calories.times) : "Выключены"}
        enabled={settings.calories.enabled}
      >
        <label className="flex min-h-11 items-center justify-between text-sm">
          <span>Баланс калорий</span>
          <input
            type="checkbox"
            checked={settings.calories.enabled}
            onChange={(event) => update("calories", { ...settings.calories, enabled: event.target.checked })}
          />
        </label>
        <p className="mt-2 text-xs text-tg-hint">Покажем, сколько съедено и сколько осталось до цели.</p>
        <div className="mt-3 space-y-2">
          {settings.calories.times.map((value, index) => (
            <div key={`${value}-${index}`} className="flex gap-2">
              <input
                type="time"
                aria-label={`Время напоминания ${index + 1}`}
                value={value}
                onChange={(event) => {
                  const times = [...settings.calories.times];
                  times[index] = event.target.value;
                  update("calories", { ...settings.calories, times });
                }}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
              />
              <button
                type="button"
                aria-label={`Удалить время ${value}`}
                disabled={settings.calories.times.length === 1}
                onClick={() => update("calories", {
                  ...settings.calories,
                  times: settings.calories.times.filter((_, itemIndex) => itemIndex !== index),
                })}
                className="min-h-11 min-w-11 rounded-xl bg-tg-bg px-3 text-tg-hint disabled:opacity-30"
              >×</button>
            </div>
          ))}
          <button
            type="button"
            disabled={settings.calories.times.length >= 8}
            onClick={() => update("calories", {
              ...settings.calories,
              times: [...settings.calories.times, "20:00"],
            })}
            className="min-h-11 text-sm font-medium text-tg-link disabled:opacity-40"
          >+ Добавить время</button>
        </div>
        <SaveSectionButton busy={props.busy} onClick={() => props.onSave("calories")} />
      </NotificationSection>

      <NotificationSection
        title="Замеры тела"
        summary={settings.measurements.enabled
          ? `${settings.measurements.time} · раз в ${settings.measurements.interval_days} дн.`
          : "Выключены"}
        enabled={settings.measurements.enabled}
      >
        <label className="flex min-h-11 items-center justify-between text-sm">
          <span>Напоминать о замерах</span>
          <input
            type="checkbox"
            checked={settings.measurements.enabled}
            onChange={(event) => update("measurements", {
              ...settings.measurements,
              enabled: event.target.checked,
            })}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-tg-hint">Время
            <input
              type="time"
              value={settings.measurements.time}
              onChange={(event) => update("measurements", { ...settings.measurements, time: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
            />
          </label>
          <label className="text-xs text-tg-hint">Интервал, дней
            <input
              type="number"
              min={1}
              max={365}
              value={settings.measurements.interval_days}
              onChange={(event) => update("measurements", {
                ...settings.measurements,
                interval_days: Number(event.target.value),
              })}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-bg px-3 text-base"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-tg-hint">День недели</p>
        <div className="mt-1 grid grid-cols-4 gap-1 sm:grid-cols-8">
          <button
            type="button"
            onClick={() => update("measurements", { ...settings.measurements, weekday: null })}
            className={`min-h-11 rounded-xl text-xs ${settings.measurements.weekday === null ? "bg-tg-button text-tg-button-text" : "bg-tg-bg"}`}
          >Любой</button>
          {WEEKDAYS.map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => update("measurements", { ...settings.measurements, weekday: index })}
              className={`min-h-11 rounded-xl text-xs ${settings.measurements.weekday === index ? "bg-tg-button text-tg-button-text" : "bg-tg-bg"}`}
            >{day}</button>
          ))}
        </div>
        <SaveSectionButton busy={props.busy} onClick={() => props.onSave("measurements")} />
      </NotificationSection>

      <NotificationSection
        title="Добавки"
        summary={settings.supplements.enabled ? `${props.supplementCount} в стеке` : "Выключены"}
        enabled={settings.supplements.enabled}
      >
        <label className="flex min-h-11 items-center justify-between text-sm">
          <span>Напоминать о приёме</span>
          <input
            type="checkbox"
            checked={settings.supplements.enabled}
            onChange={(event) => update("supplements", { enabled: event.target.checked })}
          />
        </label>
        <p className="mt-2 text-xs text-tg-hint">Время каждой добавки задаётся в её единственном расписании.</p>
        <Link to="/profile?section=supplements" className="inline-flex min-h-11 items-center text-sm font-medium text-tg-link">
          Настроить добавки →
        </Link>
        <SaveSectionButton busy={props.busy} onClick={() => props.onSave("supplements")} />
      </NotificationSection>
    </section>
  );
}
