import { Link } from "react-router-dom";
import type { Program } from "@/types/workout";
import { HomeProgramBanner } from "@/features/home/components/HomeProgramBanner";

export function HomeRecommendedProgram({ program }: { program: Program }) {
  return (
    <section className="app-card app-card-neutral overflow-hidden p-4">
      <HomeProgramBanner program={program} label="Рекомендуемая программа" />
      <div className="pt-3">
        <p className="text-sm text-tg-hint">Подобрана по анкете. Выберите её, чтобы добавить в свой план.</p>
        <Link to="/programs" aria-label="Выбрать рекомендуемую программу" className="inline-flex min-h-11 items-center text-sm font-medium text-tg-link">
          Выбрать программу →
        </Link>
      </div>
    </section>
  );
}
