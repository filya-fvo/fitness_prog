import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ProgramExercisePicker } from "../../src/features/admin-programs/components/ProgramExercisePicker";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";
initializeTheme();
function Fixture() { const [ids, setIds] = useState(new Set<string>()); return <main className="mx-auto max-w-lg p-4"><h1>Упражнения программы</h1><p role="status">Добавлено: {ids.size}</p><ProgramExercisePicker selectedIds={ids} onPick={item => setIds(new Set([...ids, item.id]))} /></main>; }
createRoot(document.getElementById("root")!).render(<Fixture />);
