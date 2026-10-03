import { useState } from "react";
import { createRoot } from "react-dom/client";
import { WheelPicker } from "../../src/components/WheelPicker";
import { AddSetModal } from "../../src/features/workout/components/AddSetModal";
import type { Exercise } from "../../src/types/workout";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";

initializeTheme();

const exercise: Exercise = {
  id: "wheel-fixture", name_ru: "Планка", muscle_group: "пресс", equipment: "свой вес",
  description: null, technique: null, common_mistakes: null, difficulty: 1,
  video_url: null, animation_url: null, thumbnail_url: null, media_duration_sec: null,
  media_source: "none", tags: ["load:timed"],
};
function Fixture() {
  const chosenExercise = new URLSearchParams(location.search).get("load") === "weight"
    ? { ...exercise, name_ru: "Жим", equipment: "штанга", tags: ["load:weight_reps"] } : exercise;
  const [value, setValue] = useState(3);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  return <main className="mx-auto max-w-md p-4">
    <WheelPicker label="Повторения" value={value} options={[1, 3, 5, 9]} onChange={setValue} />
    <output aria-label="Выбрано">{value}</output>
    <button onClick={() => setValue(5)}>Пресет</button>
    <button onClick={() => setValue(100)}>Большой пресет</button>
    <button onClick={() => setOpen(true)}>Открыть подход</button>
    {open && <AddSetModal open exercise={chosenExercise} onClose={() => setOpen(false)} onApply={draft => { setResult(JSON.stringify(draft)); setOpen(false); }} />}
    <output aria-label="Результат">{result}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
