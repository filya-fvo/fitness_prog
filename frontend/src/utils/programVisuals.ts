import type { Program } from "@/types/workout";
import { programLocation } from "@/utils/programRecommend";

const typeTitles: Record<string, string> = {
  strength: "Сила и база",
  hypertrophy: "Набор мышц",
  conditioning: "Выносливость и тонус",
  home_express: "Экспресс дома",
  full_body: "Всё тело",
  full_body_alt: "Всё тело · чередование",
  upper_lower: "Верх и низ",
  push_pull_legs: "Жим, тяга, ноги",
  mobility: "Подвижность и восстановление",
  custom: "Моя программа",
};

export function programVisualTitle(program: Program): string {
  return typeTitles[program.workout_type] || "Тренировочная программа";
}

export function programHeroImage(program: Program): string {
  const location = programLocation(program);
  if (location === "home") return "/app-media/train-home.webp";
  if (location === "outdoor") return "/app-media/train-outdoor.webp";
  return "/app-media/training-programs-hero.webp";
}

export function programGoal(program: Program): string {
  const goals: Record<string, string> = {
    strength: "Увеличение силы",
    hypertrophy: "Рост мышц",
    conditioning: "Выносливость",
    home_express: "Регулярная активность",
    mobility: "Подвижность",
  };
  return goals[program.workout_type] || "Регулярные тренировки";
}
