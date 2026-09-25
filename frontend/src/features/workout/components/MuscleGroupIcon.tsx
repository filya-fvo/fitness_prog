import { normalizeMuscleGroup } from "@/utils/muscleGroups";

type Props = { group: string | null | undefined; side?: "front" | "back"; className?: string };

const frontPaths = {
  legs: <>
    <path d="M10 17 8 29h6l2-12m2 0 2 12h6l-2-12M10 29h4m6 0h4" />
    <path d="m10.5 18 4.1.2-1 6.2-4.6-.3z" fill="currentColor" stroke="none" opacity=".9" />
    <path d="m17.4 18.2 4.1-.2 1.5 6.1-4.6.3z" fill="currentColor" stroke="none" opacity=".9" />
  </>,
  glutes: <path d="M10 17c0 5 12 5 12 0" />, shoulders: <path d="M7 10c2-3 8-3 10 0m0 0c3-3 7-1 8 2" />,
  chest: <path d="M9 12c2-2 4-2 7 1 3-3 5-3 7-1M9 12v4m14-4v4" />,
  biceps: <path d="M8 12c-2 4 1 6 4 5m12-5c2 4-1 6-4 5" />,
  triceps: <path d="M9 13c-2 3-1 5 2 6m10-6c2 3 1 5-2 6" />,
  abs: <path d="M13 12h6m-6 4h6m-6 4h6M16 10v11" />,
  cardio: <path d="m16 22-7-7c-3-4 3-8 7-3 4-5 10-1 7 3z" />,
  core: <path d="M12 11c-1 5-1 9 0 12m8-12c1 5 1 9 0 12M12 17h8" />,
  mobility: <path d="M8 22c5-7 11-7 16 0M9 14l3-3m3-1 1-4m3 5 3 3" />,
  back: <path d="M10 12c2 2 10 2 12 0m-10 2 4 9 4-9" />,
  neutral: <path d="M9 13h14M11 18h10M13 23h6" />,
};

export function MuscleGroupIcon({ group, side = "front", className = "" }: Props) {
  const normalized = normalizeMuscleGroup(group);
  const highlighted = normalized === "back" && side === "back" ? frontPaths.back : frontPaths[normalized];
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="5.5" r="3" />
      <path d="M10 10c2-1 10-1 12 0l2 7-3 2-2-5v10h-6V14l-2 5-3-2z" opacity=".45" />
      {highlighted}
    </svg>
  );
}
