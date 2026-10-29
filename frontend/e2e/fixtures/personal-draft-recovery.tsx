import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useRecoverableDraft } from "../../src/hooks/useRecoverableDraft";
import { PERSONAL_PROGRAM_DRAFT_MAX_CHARS, parsePersonalProgramDraft, personalDayFromPlan, personalDayToPlan, personalProgramInput } from "../../src/features/workout/pages/personalProgramDraft";
import { emptyPersonalDraft, maximumPersonalDraft, personalDraftCatalog } from "./personal-draft-data";

function Form({ instance = "a" }: { instance?: string }) {
  const params = new URLSearchParams(location.search);
  const domain = params.has("domain");
  const [value, setValue] = useState<unknown>(domain ? (params.has("populated") ? maximumPersonalDraft() : emptyPersonalDraft()) : { text: "" });
  const [tick, setTick] = useState(0);
  const recovery = useRecoverableDraft({
    owner: params.get("owner") ?? "synthetic-a", context: params.get("context") ?? "personal-program:v2",
    ready: true, value, restore: setValue,
    ...(!params.has("default") ? { maxChars: domain ? PERSONAL_PROGRAM_DRAFT_MAX_CHARS : 2_000_000 } : {}),
    ...(domain ? { parse: parsePersonalProgramDraft } : {}),
  });
  const harness = { value, recovery, setValue, rerender: () => setTick(current => current + 1), tick };
  Reflect.set(window, `draftHarness_${instance}`, harness);
  if (instance === "a") Reflect.set(window, "draftHarness", harness);
  return <output data-instance={instance}>{`${recovery.dirty}:${recovery.available}`}</output>;
}
const roots = new Map<string, ReturnType<typeof createRoot>>();
function mount(instance: string) {
  const element = document.createElement("div"); document.body.appendChild(element);
  const root = createRoot(element); roots.set(instance, root); root.render(<Form instance={instance} />);
}
Object.assign(window, { maximumPersonalDraft, emptyPersonalDraft, personalDraftCatalog, personalDayFromPlan, personalDayToPlan, personalProgramInput,
  mountDraft: mount, unmountDraft: (instance: string) => roots.get(instance)?.unmount(), maxDraftChars: PERSONAL_PROGRAM_DRAFT_MAX_CHARS });
mount("a");
