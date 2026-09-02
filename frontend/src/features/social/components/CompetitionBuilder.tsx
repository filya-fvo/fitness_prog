import { useEffect, useMemo, useState } from "react";

import { fetchExercises } from "@/api/exercises";
import type { CompetitionFactorInput, CompetitionMetric, Friend } from "@/api/social";
import type { Exercise } from "@/types/workout";

const FACTORS: Array<{ metric: CompetitionMetric; title: string; hint: string }> = [
  { metric: "regularity", title: "Личный план", hint: "Процент выполненных плановых тренировок" },
  { metric: "weight_loss", title: "Снижение веса", hint: "Процент от исходной массы, а не килограммы" },
  { metric: "waist_reduction", title: "Уменьшение талии", hint: "Процент от исходного обхвата" },
  { metric: "relative_strength", title: "Относительная сила", hint: "Расчётный 1ПМ с учётом повторов и массы тела" },
];

type Props = {
  friends: Friend[];
  busy: boolean;
  onCreate: (input: {
    friendshipId: string;
    durationDays: number;
    title?: string;
    factors: CompetitionFactorInput[];
  }) => Promise<void>;
};

export function CompetitionBuilder({ friends, busy, onCreate }: Props) {
  const [friendshipId, setFriendshipId] = useState(friends[0]?.id ?? "");
  const [durationDays, setDurationDays] = useState(60);
  const [title, setTitle] = useState("");
  const [metrics, setMetrics] = useState<CompetitionMetric[]>(["regularity"]);
  const [exerciseId, setExerciseId] = useState("");
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    if (!friends.some((friend) => friend.id === friendshipId)) {
      setFriendshipId(friends[0]?.id ?? "");
    }
  }, [friends, friendshipId]);

  useEffect(() => {
    if (!metrics.includes("relative_strength")) return;
    const timer = window.setTimeout(() => {
      void fetchExercises({ pageSize: 50, q: exerciseQuery.trim() || undefined })
        .then(({ items }) => setExercises(items.filter((item) => item.weight_rule !== "none")))
        .catch(() => setExercises([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [exerciseQuery, metrics]);

  const factors = useMemo<CompetitionFactorInput[]>(
    () => metrics.map((metric) => (
      metric === "relative_strength" ? { metric, exercise_id: exerciseId } : { metric }
    )),
    [exerciseId, metrics],
  );
  const valid = friendshipId && factors.length > 0
    && durationDays >= 7 && durationDays <= 365
    && (!metrics.includes("relative_strength") || exerciseId);

  function toggle(metric: CompetitionMetric) {
    setMetrics((current) => (
      current.includes(metric)
        ? current.filter((item) => item !== metric)
        : [...current, metric]
    ));
  }

  return (
    <section className="mb-4 rounded-2xl bg-tg-secondary p-4" aria-labelledby="new-competition-title">
      <h2 id="new-competition-title" className="font-semibold">Новое соревнование</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-tg-hint">С кем
          <select value={friendshipId} onChange={(event) => setFriendshipId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text">
            {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-tg-hint">Срок, дней
          <input type="number" min={7} max={365} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="Быстрый выбор срока">
        {[14, 28, 60, 90, 180].map((days) => (
          <button key={days} type="button" onClick={() => setDurationDays(days)} className={`min-h-11 rounded-xl px-3 text-sm ${durationDays === days ? "bg-tg-button text-tg-button-text" : "bg-tg-bg text-tg-link"}`}>{days} дней</button>
        ))}
      </div>
      <label className="mt-3 block text-sm text-tg-hint">Название (необязательно)
        <input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, спор на 2 месяца" className="mt-1 min-h-11 w-full rounded-xl bg-tg-bg px-3 text-base text-tg-text" />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Что сравниваем</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {FACTORS.map((factor) => {
            const selected = metrics.includes(factor.metric);
            return (
              <label key={factor.metric} className={`flex min-h-[68px] cursor-pointer gap-3 rounded-xl border p-3 ${selected ? "border-tg-button bg-tg-button/10" : "border-transparent bg-tg-bg"}`}>
                <input type="checkbox" checked={selected} onChange={() => toggle(factor.metric)} className="mt-1 h-5 w-5" />
                <span><span className="block text-sm font-medium">{factor.title}</span><span className="mt-1 block text-xs leading-relaxed text-tg-hint">{factor.hint}</span></span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {metrics.includes("relative_strength") ? (
        <div className="mt-3 rounded-xl bg-tg-bg p-3">
          <label className="block text-sm text-tg-hint">Найти упражнение
            <input value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} placeholder="Например, жим штанги лёжа" className="mt-1 min-h-11 w-full rounded-xl bg-tg-secondary px-3 text-base text-tg-text" />
          </label>
          <label className="mt-2 block text-sm text-tg-hint">Общее упражнение
            <select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-tg-secondary px-3 text-base text-tg-text">
              <option value="">Выберите упражнение</option>
              {exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name_ru}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-tg-hint">
        Для веса и талии нужны замеры не старше 7 дней, для силы — вес не старше 7 дней на дату подхода и сам подход 1–12 повторов за последние 90 дней. Друг увидит только проценты изменения; ваши килограммы и сантиметры останутся приватными.
      </p>
      <button type="button" disabled={!valid || busy} onClick={() => void onCreate({ friendshipId, durationDays, title: title.trim() || undefined, factors })} className="mt-3 min-h-11 w-full rounded-xl bg-tg-button px-4 font-semibold text-tg-button-text disabled:opacity-50">
        {busy ? "Создаём…" : "Предложить соревнование"}
      </button>
    </section>
  );
}
