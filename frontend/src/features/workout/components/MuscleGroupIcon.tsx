import { normalizeMuscleGroup, type MuscleGroupKey } from "@/utils/muscleGroups";

type Props = { group: string | null | undefined; groups?: readonly MuscleGroupKey[]; side?: "front" | "back"; className?: string };

const rearGroups = new Set<MuscleGroupKey>(["back", "glutes", "triceps"]);

const muscleRegions: Record<MuscleGroupKey, readonly string[]> = {
  legs: ["M22 58c3-2 6-2 9 0l-1 11-4 8-5-2-1-7z", "M33 58c3-2 6-2 9 0l2 10-1 7-5 2-4-8z"],
  back: ["M20 28c3-3 7-4 11-4l-1 9-3 11-5-2-3-8z", "M33 24c4 0 8 1 11 4l1 6-3 8-5 2-3-11z"],
  glutes: ["M21 50c3 1 6 1 10 0v8c-3 3-7 3-10-1z", "M33 50c4 1 7 1 10 0v7c-3 4-7 4-10 1z"],
  chest: ["M20 28c4-3 8-3 11-2v12c-5 2-9 0-12-4z", "M33 26c3-1 7-1 11 2l1 6c-3 4-7 6-12 4z"],
  shoulders: ["M17 25c-4 3-5 7-5 11l7 3 4-11z", "M47 25c4 3 5 7 5 11l-7 3-4-11z"],
  biceps: ["M13 36c2 1 4 2 7 2l-3 12-7-2z", "M44 38c3 0 5-1 7-2l3 12-7 2z"],
  triceps: ["M13 33c2 0 5 1 7 2l-3 14-7-2z", "M44 35c2-1 5-2 7-2l3 14-7 2z"],
  abs: ["M26 38h5v6h-6zm7 0h5l1 6h-6zm-8 8h6v6h-7zm8 0h6l1 6h-7z"],
  core: ["M24 38h7v16h-9zm9 0h7l2 16h-9z"],
  cardio: ["M32 41c-9-10-17 2 0 14 17-12 9-24 0-14z"],
  mobility: ["M22 34a4 4 0 1 0-8 0a4 4 0 1 0 8 0", "M50 34a4 4 0 1 0-8 0a4 4 0 1 0 8 0", "M27 58a4 4 0 1 0-8 0a4 4 0 1 0 8 0", "M45 58a4 4 0 1 0-8 0a4 4 0 1 0 8 0"],
  neutral: [],
};

const rearLegRegions = [
  "M22 57c3 1 6 1 9 0l-2 15-5 3-4-4z",
  "M33 57c3 1 6 1 9 0l2 14-4 4-5-3z",
];

export function MuscleGroupIcon({ group, groups, side, className = "" }: Props) {
  const muscle = normalizeMuscleGroup(group);
  const view = side ?? (rearGroups.has(muscle) ? "back" : "front");
  const selected = groups ?? [muscle];
  const highlights = selected.flatMap((key) => key === "legs" && view === "back" ? rearLegRegions : muscleRegions[key]);

  return (
    <svg viewBox="0 0 64 96" className={className} data-view={view} aria-hidden="true">
      <g fill="#5d789a" stroke="#b4c8e0" strokeWidth=".75" strokeLinejoin="round">
        <path d="M26 3c4-3 8-3 12 0 3 3 4 8 2 13-2 4-5 6-8 6s-6-2-8-6c-2-5-1-10 2-13z" />
        <path d="M28 20h8l2 4c6 0 11 4 13 9l-6 6-2 16c-3 3-7 4-11 4s-8-1-11-4l-2-16-6-6c2-5 7-9 13-9z" />
        <path d="M14 28c-3 1-5 4-5 8L5 52c-1 4 0 8 3 9l5-1 7-21-1-9z" />
        <path d="M50 28c3 1 5 4 5 8l4 16c1 4 0 8-3 9l-5-1-7-21 1-9z" />
        <path d="M22 55c-2 5-2 10-2 15l-3 20c2 3 7 4 11 2l4-24V58z" />
        <path d="M42 55c2 5 2 10 2 15l3 20c-2 3-7 4-11 2l-4-24V58z" />
      </g>
      <g fill="#203c63" opacity=".28">
        <path d="M24 12c1 5 4 9 8 9s7-4 8-9c-4 2-12 2-16 0zM19 35l5 19 8 4c-6 0-9-1-11-3zM45 35l-5 19-8 4c6 0 9-1 11-3z" />
        <path d="M20 68l4 5-4 16-3 1zM44 68l-4 5 4 16 3 1z" />
      </g>
      <g opacity=".84">{highlights.map((d) => <path key={d} d={d} fill="currentColor" stroke="rgba(255,255,255,.5)" strokeWidth=".5" />)}</g>
      <g fill="none" stroke="#d9e6f5" strokeWidth=".7" strokeLinecap="round" opacity=".88">
        {view === "front" ? <>
          <path d="M32 24v31M20 30c4-3 8-4 12-3 4-1 8 0 12 3M20 35c4 4 8 5 12 3 4 2 8 1 12-3M25 42c5 2 9 2 14 0M24 47c5 2 11 2 16 0M24 52c5 2 11 2 16 0" />
          <path d="M17 31c-3 5-3 10-5 15m35-15c3 5 3 10 5 15M23 59c2 3 4 5 7 6m11-6c-2 3-4 5-7 6M23 72l5 2m8 0 5-2M21 81l6 2m16-2-6 2" />
        </> : <>
          <path d="M32 23v34M20 29l12 7 12-7M20 36l12 9 12-9M23 43l9 8 9-8M22 54c3 1 6 1 10-1 4 2 7 2 10 1" />
          <path d="M18 31l-5 16m33-16 5 16M22 63l7 5m13-5-7 5M21 75l7 4m15-4-7 4M20 83l7 3m17-3-7 3" />
        </>}
      </g>
      {selected.includes("cardio") ? <path d="m23 47 5 1 3-5 3 9 3-5h4" fill="none" stroke="#fff" strokeWidth="1.6" /> : null}
    </svg>
  );
}
