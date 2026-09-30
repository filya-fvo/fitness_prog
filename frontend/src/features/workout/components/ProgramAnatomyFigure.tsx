import type { MuscleGroupKey } from "@/utils/muscleGroups";

type Side = "front" | "back";
type Props = { side: Side; groups: readonly MuscleGroupKey[]; className?: string };

const frontRegions: Partial<Record<MuscleGroupKey, readonly string[]>> = {
  chest: [
    "M30 47Q37 43 48 47L49 63Q44 68 34 65L29 56Z",
    "M52 47Q63 43 70 47L71 56Q66 68 56 65L51 63Z",
  ],
  shoulders: [
    "M28 39Q20 39 16 48L18 59Q22 64 29 58L31 46Z",
    "M72 39Q80 39 84 48L82 59Q78 64 71 58L69 46Z",
  ],
  biceps: [
    "M18 59Q22 62 28 58L25 72Q23 80 17 79L14 75Z",
    "M82 59Q78 62 72 58L75 72Q77 80 83 79L86 75Z",
  ],
  abs: [
    "M40 67Q45 69 49 68L49 96Q44 98 39 95L37 81Z",
    "M51 68Q55 69 60 67L63 81L61 95Q56 98 51 96Z",
  ],
  core: [
    "M34 66Q40 68 49 68L49 103L38 100Q34 88 32 76Z",
    "M51 68Q60 68 66 66L68 76Q66 88 62 100L51 103Z",
  ],
  legs: [
    "M37 116Q43 113 49 119L48 137L46 158Q42 164 37 160L34 139Z",
    "M51 119Q57 113 63 116L66 139L63 160Q58 164 54 158L52 137Z",
    "M37 174Q41 176 46 173L45 201Q42 207 36 203Z",
    "M54 173Q59 176 63 174L64 203Q58 207 55 201Z",
  ],
  cardio: ["M43 52Q49 47 55 52L51 64Q46 63 42 58Z"],
  mobility: ["M32 101Q41 105 49 104L49 117Q40 121 35 114Z", "M51 104Q59 105 68 101L65 114Q60 121 51 117Z"],
};

const backRegions: Partial<Record<MuscleGroupKey, readonly string[]>> = {
  back: [
    "M30 43Q39 40 49 40L49 82Q41 79 36 91L31 78L29 57Z",
    "M51 40Q61 40 70 43L71 57L69 78L64 91Q59 79 51 82Z",
  ],
  shoulders: frontRegions.shoulders,
  triceps: [
    "M18 57Q22 62 28 57L25 75Q22 82 17 79L14 75Z",
    "M82 57Q78 62 72 57L75 75Q78 82 83 79L86 75Z",
  ],
  glutes: [
    "M35 103Q42 101 49 105L49 121Q42 128 36 122L33 113Z",
    "M51 105Q58 101 65 103L67 113L64 122Q58 128 51 121Z",
  ],
  legs: frontRegions.legs,
};

/** Skin and muscle definition stay visible beneath the selected, translucent regions. */
export function ProgramAnatomyFigure({ side, groups, className = "" }: Props) {
  const selected = groups.flatMap((group) =>
    (side === "front" ? frontRegions[group] : backRegions[group])?.map((path) => ({ group, path })) ?? [],
  );

  return (
    <svg viewBox="0 0 100 220" className={className} data-view={side} aria-hidden="true">
      <image href={`/app-media/program-anatomy-${side}.svg`} width="100" height="220" />
      <g fill="currentColor" fillOpacity=".74" stroke="#f5d8d0" strokeOpacity=".82" strokeWidth=".8">
        {selected.map(({ group, path }) => <path key={`${group}-${path}`} data-muscle={group} d={path} />)}
      </g>
    </svg>
  );
}
