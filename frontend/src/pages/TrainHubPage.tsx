/**
 * Training hub — programs + custom workout (bottom nav «Тренировки»).
 */
import { Link } from "react-router-dom";

import { Header } from "@/components/layout/Header";

export function TrainHubPage() {
  return (
    <section>
      <Header title="Тренировки" subtitle="Программы и свой день" />
      <div className="space-y-3">
        <Link
          to="/programs"
          className="block rounded-2xl bg-tg-secondary p-4 active:opacity-90"
        >
          <p className="text-sm font-semibold">Программы</p>
          <p className="mt-1 text-xs text-tg-hint">
            Готовые сплиты под зал, дом и улицу. Фильтры по полу, уровню и ограничениям.
          </p>
        </Link>
        <Link
          to="/workouts"
          className="block rounded-2xl bg-tg-secondary p-4 active:opacity-90"
        >
          <p className="text-sm font-semibold">Каталог · своя тренировка</p>
          <p className="mt-1 text-xs text-tg-hint">
            Соберите день из упражнений: поиск, мышцы, шаблон подходов.
          </p>
        </Link>
        <Link to="/" className="block rounded-2xl bg-tg-bg px-4 py-3 text-center text-sm text-tg-link">
          ← На главную · «Сегодня»
        </Link>
      </div>
    </section>
  );
}
