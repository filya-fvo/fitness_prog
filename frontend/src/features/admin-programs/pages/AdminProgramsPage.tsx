import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  createAdminProgram,
  deleteAdminProgram,
  listAdminPrograms,
  previewAdminProgram,
  publishAdminProgram,
  rollbackAdminProgram,
  updateAdminProgram,
} from "@/api/adminPrograms";
import { Header } from "@/components/layout/Header";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { confirmAction } from "@/lib/telegram";
import { useUserStore } from "@/store/userStore";
import type { Program, WorkoutPlan } from "@/types/workout";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

import { AdminProgramCard } from "../components/AdminProgramCard";
import { ProgramEditor } from "../components/ProgramEditor";
import { ProgramPreviewDialog } from "../components/ProgramPreviewDialog";
import {
  draftFromProgram,
  emptyProgramPayload,
  payloadFromProgramDraft,
  type ProgramDraft,
} from "../programDraft";

type PreviewState = {
  program: Program;
  dayIndex: number;
  plan: WorkoutPlan | null;
  loading: boolean;
  error: string | null;
};

export function AdminProgramsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedId = searchParams.get("focus");
  const user = useUserStore((state) => state.user);
  const isAuthLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("full_body");
  const [createLevel, setCreateLevel] = useState("beginner");
  const [editing, setEditing] = useState<Program | null>(null);
  const [draft, setDraft] = useState<ProgramDraft | null>(null);
  const [baseline, setBaseline] = useState<ProgramDraft | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const loaded = useRef(false);
  const navigationApproved = useRef(false);
  const isDirty = Boolean(draft && baseline && JSON.stringify(payloadFromProgramDraft(draft)) !== JSON.stringify(payloadFromProgramDraft(baseline)));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPrograms(await listAdminPrograms());
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить программы."));
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmDiscard = useCallback(async () => {
    if (!isDirty) return true;
    return confirmAction("Есть несохранённые изменения программы. Уйти без сохранения?");
  }, [isDirty]);

  useEffect(() => {
    if (isAuthLoading || !allowed || loaded.current) return;
    loaded.current = true;
    void load();
  }, [allowed, isAuthLoading, load]);

  useEffect(() => {
    if (!focusedId || !programs.some((item) => item.id === focusedId)) return;
    document.getElementById(`admin-program-${focusedId}`)?.scrollIntoView({ block: "center" });
  }, [focusedId, programs]);

  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationApproved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const interceptLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank") return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      void confirmDiscard().then((accepted) => {
        if (!accepted) return;
        navigationApproved.current = true;
        navigate(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptLink, true);
    };
  }, [confirmDiscard, isDirty, navigate]);

  function openEditor(program: Program) {
    const nextDraft = draftFromProgram(program);
    setEditing(program);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function editProgram(program: Program) {
    if (!await confirmDiscard()) return;
    if (program.publication_status === "draft") {
      openEditor(program);
      return;
    }
    if (!await confirmAction(`Создать новый черновик из версии ${program.version}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const created = await updateAdminProgram(program.id, { name: program.name });
      await load();
      openEditor(created);
      setNotice(`Создан черновик версии ${created.version}.`);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось создать новую версию."));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!editing || !draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateAdminProgram(editing.id, payloadFromProgramDraft(draft));
      const savedDraft = draftFromProgram(saved);
      setEditing(saved);
      setDraft(savedDraft);
      setBaseline(savedDraft);
      setNotice("Черновик сохранён.");
      await load();
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось сохранить программу."));
    } finally {
      setBusy(false);
    }
  }

  async function closeEditor() {
    if (!await confirmDiscard()) return;
    setEditing(null);
    setDraft(null);
    setBaseline(null);
  }

  async function createProgram() {
    if (!createName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminProgram(emptyProgramPayload(createName.trim(), createType, createLevel));
      setCreateName("");
      await load();
      openEditor(created);
      setNotice("Черновик создан. Добавьте дни и упражнения.");
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось создать программу."));
    } finally {
      setBusy(false);
    }
  }

  async function publish(program: Program) {
    if (editing?.id === program.id && isDirty) {
      setError("Сначала сохраните изменения черновика.");
      return;
    }
    if (!await confirmAction(`Опубликовать «${program.name}» для пользователей?`)) return;
    setBusy(true);
    setError(null);
    try {
      setNotice(await publishAdminProgram(program.id));
      if (editing?.id === program.id) await closeEditor();
      await load();
    } catch (reason) {
      setError(toUserMessage(reason, "Публикация невозможна."));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(program: Program) {
    if (!await confirmAction(`Вернуть предыдущую опубликованную версию «${program.name}»?`)) return;
    setBusy(true);
    setError(null);
    try {
      setNotice(await rollbackAdminProgram(program.id));
      await load();
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось вернуть предыдущую версию."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(program: Program) {
    const action = program.publication_status === "draft" ? "Удалить черновик" : "Скрыть программу из каталога";
    if (!await confirmAction(`${action} «${program.name}»? История пользователей сохранится.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminProgram(program.id);
      if (editing?.id === program.id) {
        setEditing(null); setDraft(null); setBaseline(null);
      }
      setNotice(program.publication_status === "draft" ? "Черновик удалён." : "Программа перенесена в архив.");
      await load();
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось изменить программу."));
    } finally {
      setBusy(false);
    }
  }

  async function showPreview(program: Program, dayIndex = 1) {
    setPreview({ program, dayIndex, plan: null, loading: true, error: null });
    try {
      const plan = await previewAdminProgram(program.id, dayIndex);
      setPreview((current) => current?.program.id === program.id && current.dayIndex === dayIndex ? { ...current, plan, loading: false } : current);
    } catch (reason) {
      const message = toUserMessage(reason, "Предпросмотр недоступен.");
      setPreview((current) => current?.program.id === program.id && current.dayIndex === dayIndex ? { ...current, error: message, loading: false } : current);
    }
  }

  if (isAuthLoading) return <section><Header title="Редактор программ" subtitle="Проверка доступа…" fallbackTo="/admin" /><PageSkeleton cards={5} /></section>;
  if (!allowed) return <section><Header title="Редактор программ" subtitle="Доступ ограничен" fallbackTo="/admin" /><div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Программы доступны только настроенным администраторам.<Link to="/" className="mt-3 block text-center text-tg-link">На главную</Link></div></section>;

  return (
    <section>
      <Header title="Редактор программ" subtitle="Дни, упражнения, версии и публикация" fallbackTo="/admin" beforeBack={confirmDiscard} />
      {error ? <div role="alert" className="mb-4 rounded-2xl bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
      {notice ? <div role="status" className="mb-4 rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      {draft ? <ProgramEditor draft={draft} busy={busy} onChange={setDraft} onSave={() => void saveDraft()} onCancel={() => void closeEditor()} /> : (
        <div className="rounded-2xl bg-tg-secondary p-4">
          <h2 className="font-semibold">Новая программа</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base sm:col-span-3" placeholder="Название программы" maxLength={200} />
            <select value={createType} onChange={(event) => setCreateType(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="full_body">Всё тело</option><option value="upper_lower">Верх/низ</option><option value="strength">Сила</option><option value="hypertrophy">Масса</option><option value="conditioning">Выносливость</option><option value="custom">Своя</option></select>
            <select value={createLevel} onChange={(event) => setCreateLevel(event.target.value)} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-3 text-base"><option value="beginner">Новичок</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option></select>
            <button type="button" disabled={busy || !createName.trim()} onClick={() => void createProgram()} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">Создать черновик</button>
          </div>
        </div>
      )}

      <div className="my-5 flex items-center justify-between gap-3"><h2 className="font-semibold">Все версии</h2><button type="button" disabled={loading || busy} onClick={() => void load()} className="min-h-11 text-sm text-tg-link disabled:opacity-50">Обновить</button></div>
      {loading ? <PageSkeleton cards={5} /> : programs.length ? (
        <ul className="space-y-3">{programs.map((program) => <AdminProgramCard key={program.id} program={program} focused={program.id === focusedId} busy={busy} onEdit={() => void editProgram(program)} onPreview={() => void showPreview(program)} onPublish={() => void publish(program)} onRollback={() => void rollback(program)} onDelete={() => void remove(program)} />)}</ul>
      ) : <div className="rounded-2xl bg-tg-secondary p-5 text-center text-sm text-tg-hint">Программ пока нет.</div>}
      {preview ? <ProgramPreviewDialog {...preview} onDay={(dayIndex) => void showPreview(preview.program, dayIndex)} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}
