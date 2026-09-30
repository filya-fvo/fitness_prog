import type { Program } from "@/types/workout";
import { programHeroImage, programVisualTitle } from "@/utils/programVisuals";

export function HomeProgramBanner({ program }: { program: Program }) {
  return (
    <div
      className="home-program-banner"
      style={{ backgroundImage: `linear-gradient(90deg, rgba(6, 17, 36, .97), rgba(8, 22, 46, .75) 55%, rgba(8, 22, 46, .12)), url("${programHeroImage(program)}")` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200">Моя программа</p>
      <p className="mt-2 max-w-[65%] text-lg font-bold leading-tight text-white">{programVisualTitle(program)}</p>
    </div>
  );
}
