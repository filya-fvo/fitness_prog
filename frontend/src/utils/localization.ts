const LABELS: Record<string, string> = {
  beginner: "Новичок",
  intermediate: "Опытный",
  advanced: "Продвинутый",
  full_body: "Всё тело",
  full_body_alt: "Всё тело A/B",
  upper_lower: "Верх/низ",
  push_pull_legs: "Жим/тяга/ноги",
  home_express: "Домашняя экспресс",
  strength: "Сила",
  hypertrophy: "Набор мышц",
  mobility: "Мобильность",
  conditioning: "Выносливость",
  custom: "Пользовательская",
  male: "Мужская",
  female: "Женская",
  any: "Для всех",
  unisex: "Для всех",
  home: "Дом",
  gym: "Зал",
  outdoor: "Улица",
  light: "Лёгкая",
  medium: "Средняя",
  heavy: "Тяжёлая",
  no_knee: "Без нагрузки на колени",
  no_spine: "Без нагрузки на позвоночник",
  shoulder_sensitive: "Щадящая нагрузка на плечи",
  lose_fat: "Снижение веса",
  gain_muscle: "Набор мышц",
  maintain: "Поддержание формы",
  planned: "Запланирована",
  completed: "Завершена",
  skipped: "Пропущена",
  pending: "Ожидает",
  taken: "Принято",
  free: "Бесплатный",
  premium: "Премиум",
  pro: "Профессиональный",
  trial: "Пробный",
  active: "Активна",
  inactive: "Неактивна",
  none: "Нет",
  external: "Внешний источник",
  youtube: "YouTube",
  local: "Локальный файл",
  bodyweight: "Свой вес",
  dumbbells: "Гантели",
  dumbbell: "Гантель",
  barbell: "Штанга",
  kettlebell: "Гиря",
  bands: "Резинки",
  resistance_band: "Резинка",
  cable: "Блочный тренажёр",
  machine: "Тренажёр",
  smith: "Машина Смита",
  treadmill: "Беговая дорожка",
  elliptical: "Эллиптический тренажёр",
  bench: "Скамья",
  pull_up_bar: "Турник",
  mat: "Коврик",
  rope: "Канат",
  chest: "Грудь",
  back: "Спина",
  legs: "Ноги",
  shoulders: "Плечи",
  biceps: "Бицепс",
  triceps: "Трицепс",
  core: "Кор",
  cardio: "Кардио",
  glutes: "Ягодицы",
  quads: "Квадрицепсы",
  hamstrings: "Задняя поверхность бедра",
  calves: "Икры",
};

export function enumLabel(value: string | null | undefined, fallback = "Не указано"): string {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  if (!key) return fallback;
  if (LABELS[key]) return LABELS[key];
  if (/[а-яё]/i.test(raw)) return raw;
  return fallback;
}

export const subscriptionLabel = (value: string | null | undefined) =>
  enumLabel(value, "Тариф не указан");

const EXERCISE_TAG_LABELS: Record<string, string> = {
  cardio: "Кардио",
  unilateral: "На одну сторону",
  replacement: "Вариант замены",
  manual_add: "Добавлено вручную",
  "load:timed": "На время",
  "load:reps_only": "Без веса",
  "load:cardio_machine": "Кардиотренажёр",
};

/** Hide catalog provenance/technical tags and translate the useful ones. */
export function visibleExerciseTags(tags: string[] | null | undefined): string[] {
  const labels = (tags || [])
    .map((tag) => EXERCISE_TAG_LABELS[tag.trim().toLowerCase()])
    .filter((tag): tag is string => Boolean(tag));
  return [...new Set(labels)];
}

export function pluralRu(
  count: number,
  forms: readonly [string, string, string],
): string {
  const absolute = Math.abs(Math.trunc(count));
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const form = lastTwo >= 11 && lastTwo <= 14
    ? forms[2]
    : last === 1
      ? forms[0]
      : last >= 2 && last <= 4
        ? forms[1]
        : forms[2];
  return `${count} ${form}`;
}

export const workoutsCount = (count: number) =>
  pluralRu(count, ["тренировка", "тренировки", "тренировок"]);
export const daysCount = (count: number) => pluralRu(count, ["день", "дня", "дней"]);
export const setsCount = (count: number) => pluralRu(count, ["подход", "подхода", "подходов"]);
export const exercisesCount = (count: number) =>
  pluralRu(count, ["упражнение", "упражнения", "упражнений"]);

const DAY_TERMS: Array<[RegExp, string]> = [
  [/\bFB\b/g, "Всё тело"],
  [/Spine-safe/gi, "Без нагрузки на позвоночник"],
  [/No-knee/gi, "Без нагрузки на колени"],
  [/Full Body/gi, "Всё тело"],
  [/Outdoor/gi, "Улица"],
  [/Machine/gi, "Тренажёры"],
  [/Strength/gi, "Сила"],
  [/Volume/gi, "Объём"],
  [/Dense/gi, "Плотный круг"],
  [/Bands/gi, "Резинки"],
  [/Glute/gi, "Ягодицы"],
  [/Lower/gi, "Низ"],
  [/Upper/gi, "Верх"],
  [/Push/gi, "Жим"],
  [/Pull/gi, "Тяга"],
  [/Legs/gi, "Ноги"],
  [/Home/gi, "Дом"],
  [/Core/gi, "Кор"],
  [/Full/gi, "Всё тело"],
  [/\bDB\b/g, "Гантели"],
  [/\bBW\b/g, "Свой вес"],
];

export function programDayLabel(value: string | null | undefined, dayIndex?: number): string {
  let result = String(value || "").trim();
  if (!result) return dayIndex ? `День ${dayIndex}` : "Тренировочный день";
  for (const [pattern, replacement] of DAY_TERMS) result = result.replace(pattern, replacement);
  return result.replace(/\s+/g, " ").trim();
}
