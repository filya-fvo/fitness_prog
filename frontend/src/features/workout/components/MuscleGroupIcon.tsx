import type { ReactNode } from "react";

import { normalizeMuscleGroup, type MuscleGroupKey } from "@/utils/muscleGroups";

type Props = { group: string | null | undefined; side?: "front" | "back"; className?: string };

const rearGroups = new Set<MuscleGroupKey>(["back", "glutes", "triceps"]);

const muscleRegions: Record<MuscleGroupKey, ReactNode> = {
  legs: <>
    <path d="M23 57c2 1 5 1 7 0l-1 12-3 10-6-1 1-10z" fill="currentColor" />
    <path d="M34 57c2 1 5 1 7 0l2 11 1 10-6 1-3-10z" fill="currentColor" />
  </>,
  back: <>
    <path d="M20 26c3-2 7-3 11-3v28l-7-4-5-10z" fill="currentColor" />
    <path d="M33 23c4 0 8 1 11 3l1 11-5 10-7 4z" fill="currentColor" />
  </>,
  glutes: <>
    <path d="M22 49h9v10c-5 3-9 0-10-4z" fill="currentColor" />
    <path d="M33 49h9l1 6c-1 4-5 7-10 4z" fill="currentColor" />
  </>,
  chest: <>
    <path d="M20 26c4-2 8-2 11 0v12c-5 3-9 1-12-3z" fill="currentColor" />
    <path d="M33 26c3-2 7-2 11 0l1 9c-3 4-7 6-12 3z" fill="currentColor" />
  </>,
  shoulders: <>
    <path d="M17 25c-3 2-5 6-5 11l7 3 4-12z" fill="currentColor" />
    <path d="M47 25c3 2 5 6 5 11l-7 3-4-12z" fill="currentColor" />
  </>,
  biceps: <>
    <path d="M13 36l7 3-3 12-7-2z" fill="currentColor" />
    <path d="M44 39l7-3 3 13-7 2z" fill="currentColor" />
  </>,
  triceps: <>
    <path d="M13 33l7 2-3 15-7-2z" fill="currentColor" />
    <path d="M44 35l7-2 3 15-7 2z" fill="currentColor" />
  </>,
  abs: <>
    <path d="M26 38h5v6h-6zm7 0h5l1 6h-6zm-8 8h6v6h-7zm8 0h6l1 6h-7z" fill="currentColor" />
  </>,
  core: <>
    <path d="M24 38h7v16h-9zm9 0h7l2 16h-9z" fill="currentColor" />
  </>,
  cardio: <>
    <path d="M32 41c-9-10-17 2 0 14 17-12 9-24 0-14z" fill="currentColor" />
    <path d="m23 47 5 1 3-5 3 9 3-5h4" fill="none" stroke="#fff" strokeWidth="1.6" />
  </>,
  mobility: <>
    <circle cx="18" cy="34" r="4" fill="currentColor" />
    <circle cx="46" cy="34" r="4" fill="currentColor" />
    <circle cx="23" cy="58" r="4" fill="currentColor" />
    <circle cx="41" cy="58" r="4" fill="currentColor" />
  </>,
  neutral: null,
};

export function MuscleGroupIcon({ group, side, className = "" }: Props) {
  const muscle = normalizeMuscleGroup(group);
  const view = side ?? (rearGroups.has(muscle) ? "back" : "front");

  return (
    <svg viewBox="0 0 64 96" className={className} data-muscle={muscle} data-view={view} aria-hidden="true">
      <g fill="#8196b5" stroke="#adc1dc" strokeWidth="0.8" strokeLinejoin="round">
        <path d="M26 3c4-3 8-3 12 0 3 3 4 8 2 13-2 4-5 6-8 6s-6-2-8-6c-2-5-1-10 2-13z" />
        <path d="M25 20c-5 1-9 3-11 7l5 12 2 16c3 2 7 3 11 3s8-1 11-3l2-16 5-12c-2-4-6-6-11-7l-3 5h-8z" />
        <path d="M14 27c-3 1-4 4-5 8L5 52c-1 4 0 8 3 9l5-1 7-21-1-9z" />
        <path d="M50 27c3 1 4 4 5 8l4 17c1 4 0 8-3 9l-5-1-7-21 1-9z" />
        <path d="M22 55c-2 5-2 10-2 15l-3 20c2 3 7 4 11 2l4-24V57z" />
        <path d="M42 55c2 5 2 10 2 15l3 20c-2 3-7 4-11 2l-4-24V57z" />
      </g>
      <g fill="none" stroke="#c8d7e9" strokeWidth="0.8" opacity=".75">
        <path d="M32 26v29M22 38c4 3 7 3 10 1 3 2 6 2 10-1M24 47c3 2 5 2 8 1 3 1 5 1 8-1" />
      </g>
      <g opacity=".96">{muscleRegions[muscle]}</g>
    </svg>
  );
}
