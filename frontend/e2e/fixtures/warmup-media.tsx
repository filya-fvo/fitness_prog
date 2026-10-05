import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { WarmupPanel } from "../../src/features/workout/components/WarmupPanel";
import type { Exercise } from "../../src/types/workout";
import { buildWarmupPlan } from "../../src/utils/warmupPlan";
import { initializeTheme } from "../../src/theme/theme";
import "../../src/index.css";

initializeTheme();

const rows = [
  ["Кошка-корова", "088-1363-b9dbdbdf1d49"],
  ["Мобилизация голеностопа", "089-1368-b68d49c198ff"],
  ["Наклоны к носкам", "096-3212-1be8f6718d93"],
  ["Раскрытие грудного отдела у стены", "094-1167-efe8b5c9d16c"],
  ["Мировая растяжка", "097-1604-ff7b82744394"],
  ["Выпады вперёд без веса", "129-3470-1d4e5e3d2269"],
  ["Планка", "061-2135-591a72c68751"],
];
const catalog: Exercise[] = rows.map(([name_ru, media], index) => ({
  id: `mobility-${index}`, name_ru, muscle_group: "мобильность", equipment: "свой вес",
  description: "Мягкое движение без дополнительного веса.", technique: "1. Примите устойчивое положение.\n2. Двигайтесь подконтрольно.",
  common_mistakes: null, difficulty: 1, video_url: null, animation_url: null,
  thumbnail_url: index === 2 ? null : `/exercise-thumbnails/${media}-start.webp`,
  image_url: `/exercise-images/${media}.webp`, media_duration_sec: null, media_source: "none", tags: [],
}));

function Fixture() {
  const [loaded, setLoaded] = useState(!new URLSearchParams(location.search).has("delayed"));
  const [result, setResult] = useState("Разминка идёт");
  const available = loaded ? catalog : [];
  return <MemoryRouter><main style={{ maxWidth: 700, margin: "auto", padding: 12 }}>
    {!loaded ? <button type="button" onClick={() => setLoaded(true)}>Загрузить каталог</button> : null}
    <WarmupPanel plan={buildWarmupPlan({ location: "home", catalog: available })} catalog={available}
      onSkipAll={() => setResult("Разминка пропущена")} onCompleteAll={() => setResult("Разминка завершена")} />
    <p role="status">{result}</p>
  </main></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
