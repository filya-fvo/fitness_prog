import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AdminUserListControls } from "../../src/features/admin-user/components/AdminUserListControls";
import { EMPTY_USER_FILTERS } from "../../src/features/admin-user/adminUserFilters";
import { AdminUserActions } from "../../src/features/admin-user/components/AdminUserActions";
import { ExerciseImportPreviewPanel } from "../../src/features/admin-exercises/components/ExerciseImportPreview";
import { ProgramDayEditor } from "../../src/features/admin-programs/components/ProgramDayEditor";
import type { ProgramDayDraft } from "../../src/features/admin-programs/programDraft";
import { PlannedExercisePicker } from "../../src/features/workout/components/PlannedExercisePicker";
import type { Exercise } from "../../src/types/workout";
import "../../src/index.css";

const exercise: Exercise = {
  id: "22222222-2222-4222-8222-222222222222", name_ru: "Жим гантелей", muscle_group: "грудь", equipment: "гантели",
  description: null, technique: null, common_mistakes: null, difficulty: 2, video_url: null,
  animation_url: null, thumbnail_url: null, media_duration_sec: null, media_source: "none", tags: [],
};
const noAction = () => {};
const noAsyncAction = async () => {};

function Fixture() {
  const mode = new URLSearchParams(location.search).get("fixture");
  const [filters, setFilters] = useState(EMPTY_USER_FILTERS);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set<string>());
  const [applied, setApplied] = useState("");
  const [day, setDay] = useState<ProgramDayDraft>({
    key: "day", name: "Первый день", focus: "грудь", source: {}, exercises: [{
      key: "exercise", exerciseId: exercise.id, exerciseName: exercise.name_ru,
      sets: 3, reps: "8-12", restSec: 60, weightMode: null, note: "", source: {},
    }],
  });
  return <main className="mx-auto max-w-xl space-y-3 p-4">
    {mode === "filters" && <>
      <AdminUserListControls adminId="qa" filters={filters} setFilters={setFilters} users={[]}
        selectedUserIds={selectedUserIds} setSelectedUserIds={setSelectedUserIds} loading={false} busy={false}
        onApply={(next) => setApplied(next.q)} onApplySaved={noAction} onExport={noAction} />
      <output aria-label="Применённый поиск">{applied}</output>
    </>}
    {mode === "import" && <ExerciseImportPreviewPanel onImported={noAction} />}
    {mode === "actions" && <AdminUserActions userId="11111111-1111-4111-8111-111111111111" displayName="Тестовый пользователь"
      telegramAvailable emailAvailable={false} emailAllowed={false} webPushActive={0} remindersEnabled communicationsLoading={false}
      communicationsError={null} onCommunicationsChanged={noAsyncAction} onDataChanged={noAsyncAction} />}
    {mode === "planned" && <PlannedExercisePicker source={{ ...exercise, name_ru: "Жим гантелей лёжа" }} catalog={[exercise, {
      ...exercise, id: "33333333-3333-4333-8333-333333333333", name_ru: "Жим гантелей лёжа",
    }]} occupiedIds={new Set()}
      onBack={noAction} onChoose={noAction} onOpenDetail={noAction} />}
    {mode === "day" && <ProgramDayEditor day={day} index={0} count={1} onChange={setDay}
      onMove={noAction} onCopy={noAction} onRemove={noAction} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Fixture /></BrowserRouter>);
