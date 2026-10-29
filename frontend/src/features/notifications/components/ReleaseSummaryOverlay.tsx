import { useEffect, useRef, useState } from "react";
import { fetchReleaseNotices, markReleaseNoticeSeen, type ReleaseNotice } from "@/api/releaseNotices";
import { getStoredToken } from "@/api/client";
import { useUserStore } from "@/store/userStore";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { isOnline } from "@/utils/network";
import { confirmReleaseRead, dismissReleaseNotice, isReleaseDismissed, pendingReleaseReads } from "../releaseNoticeReads";

/** Mounted only at a safe Home entry; never interrupts a form or active workout. */
export function ReleaseSummaryOverlay({ owner }: { owner: string }) {
  const [items, setItems] = useState<ReleaseNotice[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useRef(() => {});
  const current = items[0];
  const close = () => {
    if (!current || useUserStore.getState().user?.id !== owner) return;
    dismissReleaseNotice(owner, current.id);
    setItems(old => old.filter(item => item.id !== current.id));
    refresh.current();
  };
  const dialogRef = useModalAccessibility(Boolean(current && ready), close);

  useEffect(() => {
    let alive = true, running = false, queued = false, revoked = false;
    const token = getStoredToken();
    const isCurrent = () => alive && !revoked && Boolean(token) && getStoredToken() === token && useUserStore.getState().user?.id === owner;
    const showWhenSafe = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (focused.matches("input,textarea,select") || focused.isContentEditable);
      const otherDialog = document.querySelector('[aria-modal="true"]:not([data-release-summary])');
      if (alive) setReady(!editing && !otherDialog);
    };
    async function run() {
      if (!isCurrent() || !isOnline() || document.visibilityState === "hidden") return;
      if (running) { queued = true; return; }
      running = true;
      try {
        for (const id of pendingReleaseReads(owner)) {
          if (!isCurrent()) return;
          await markReleaseNoticeSeen(owner, id, isCurrent);
          if (!isCurrent()) return;
          confirmReleaseRead(owner, id);
        }
        const found = await fetchReleaseNotices(owner, isCurrent);
        if (isCurrent()) { setItems(found.filter(item => !isReleaseDismissed(owner, item.id))); showWhenSafe(); }
      } catch { /* Keep the application usable; retry on the next online/open event. */ }
      finally {
        running = false;
        if (queued) { queued = false; void run(); }
      }
    }
    refresh.current = () => { void run(); };
    const afterFocus = () => { void Promise.resolve().then(showWhenSafe); };
    const sessionChanged = () => { revoked = true; setItems([]); };
    const observer = new MutationObserver(showWhenSafe);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusout", afterFocus);
    document.addEventListener("visibilitychange", refresh.current);
    window.addEventListener("online", refresh.current);
    window.addEventListener("fitness:session-change", sessionChanged);
    // StrictMode's disposable mount cannot start a request before cleanup.
    void Promise.resolve().then(run);
    return () => {
      alive = false; observer.disconnect();
      document.removeEventListener("focusout", afterFocus);
      document.removeEventListener("visibilitychange", refresh.current);
      window.removeEventListener("online", refresh.current);
      window.removeEventListener("fitness:session-change", sessionChanged);
    };
  }, [owner]);

  if (!current || !ready) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
    <section data-release-summary ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="release-summary-title" tabIndex={-1} className="app-card app-card-neutral flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden text-tg-text shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
        <div><p className="text-xs text-tg-hint">Что нового</p><h2 id="release-summary-title" className="mt-1 text-lg font-semibold">{current.title}</h2></div>
        <button type="button" data-autofocus aria-label="Закрыть изменения" onClick={close} className="app-button app-ghost-action min-w-11 shrink-0 text-lg">×</button>
      </header>
      <p tabIndex={0} className="min-h-0 overflow-y-auto whitespace-pre-wrap break-words px-5 py-4 text-sm leading-relaxed">{current.message_text}</p>
      <footer className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-3"><button type="button" onClick={close} className="app-button app-gradient-action min-h-11 w-full">Понятно</button></footer>
    </section>
  </div>;
}
