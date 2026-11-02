import { isAxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import { fetchReleaseNotices, markReleaseNoticeSeen, type ReleaseNotice } from "@/api/releaseNotices";
import { getStoredToken } from "@/api/client";
import { useUserStore } from "@/store/userStore";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { eligibleReleaseSummaries } from "@/lib/releaseSummaryPlatform";
import { isOnline } from "@/utils/network";
import { confirmReleaseRead, dismissReleaseNotices, isReleaseDismissed, pendingReleaseReads } from "../releaseNoticeReads";

/** One displayed unread snapshot at a safe Home entry, independent of transport. */
export function ReleaseSummaryOverlay({ owner }: { owner: string }) {
  const [items, setItems] = useState<ReleaseNotice[]>([]);
  const [ready, setReady] = useState(false);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const displayed = useRef<ReleaseNotice[]>([]);
  const closedEntry = useRef(false);
  const version = useRef(0);
  const acknowledge = useRef(() => {}), retry = useRef(() => {});
  const close = () => {
    if (!items.length || useUserStore.getState().user?.id !== owner) return;
    dismissReleaseNotices(owner, items.map(item => item.id));
    closedEntry.current = true; version.current++;
    displayed.current = []; setItems([]); setLoading(false);
    acknowledge.current();
  };
  const dialogRef = useModalAccessibility(Boolean(items.length && ready), close);

  useEffect(() => {
    let alive = true, reading = false, queuedRead = false, revoked = false;
    let fetching: number | null = null;
    let resume: string | null = null;
    const token = getStoredToken();
    const isCurrent = () => alive && !revoked && Boolean(token) && getStoredToken() === token && useUserStore.getState().user?.id === owner;
    const showWhenSafe = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (focused.matches("input,textarea,select") || focused.isContentEditable);
      if (alive) setReady(!editing && !document.querySelector('[aria-modal="true"]:not([data-release-summary])'));
    };
    async function flushReads() {
      if (!isCurrent() || !isOnline()) return;
      if (reading) { queuedRead = true; return; }
      reading = true;
      try {
        // One attempt per pending ID, sequential: no request storm or GET dependency.
        for (const id of pendingReleaseReads(owner)) {
          if (!isCurrent()) return;
          try { await markReleaseNoticeSeen(owner, id, isCurrent); }
          catch (error) {
            if (!isCurrent()) return;
            if (!isAxiosError(error) || error.response?.status !== 404) continue;
          }
          if (isCurrent()) confirmReleaseRead(owner, id);
        }
      } finally {
        reading = false;
        if (queuedRead) { queuedRead = false; void flushReads(); }
      }
    }
    async function load(explicit = false) {
      if (!isCurrent() || !isOnline() || document.visibilityState === "hidden" || fetching === version.current || closedEntry.current || (displayed.current.length && !explicit)) return;
      const ticket = version.current;
      fetching = ticket; setLoading(true);
      const collected = explicit ? [...displayed.current] : [];
      const ids = new Set(collected.map(item => item.id)), cursors = new Set<string>();
      let cursor = explicit ? resume : null, failed = false;
      try {
        do {
          if (cursor) cursors.add(cursor);
          const page = await fetchReleaseNotices(owner, isCurrent, cursor);
          if (!isCurrent() || version.current !== ticket || closedEntry.current) return;
          const next = page.next_cursor;
          if (next && (cursors.has(next) || page.items.at(-1)?.id !== next || page.items.every(item => ids.has(item.id)))) throw new Error("Invalid cursor progress");
          for (const item of page.items) {
            if (ids.has(item.id)) continue;
            ids.add(item.id);
            if (!isReleaseDismissed(owner, item.id)) collected.push(item);
          }
          cursor = next;
        } while (cursor);
      } catch { failed = true; }
      finally {
        try {
          if (isCurrent() && version.current === ticket && !closedEntry.current) {
            const eligible = await eligibleReleaseSummaries(collected);
            if (isCurrent() && version.current === ticket && !closedEntry.current) {
              resume = cursor; displayed.current = eligible;
              setItems(eligible); setPartial(failed); setLoading(false); showWhenSafe();
            }
          }
        } catch {
          if (isCurrent() && version.current === ticket) setLoading(false);
        } // Unknown runtime eligibility defers presentation, never ACKs.
        finally { if (fetching === ticket) fetching = null; }
      }
    }
    acknowledge.current = () => { void flushReads(); };
    retry.current = () => { void load(true); };
    const refresh = () => { void flushReads(); if (!closedEntry.current) void load(); };
    const foreground = () => { if (document.visibilityState !== "hidden") { closedEntry.current = false; refresh(); } };
    const afterFocus = () => { void Promise.resolve().then(showWhenSafe); };
    const sessionChanged = () => { revoked = true; version.current++; displayed.current = []; setItems([]); };
    const observer = new MutationObserver(showWhenSafe);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusout", afterFocus);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", refresh);
    window.addEventListener("fitness:session-change", sessionChanged);
    void Promise.resolve().then(refresh);
    return () => {
      alive = false; observer.disconnect();
      document.removeEventListener("focusout", afterFocus);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("online", refresh);
      window.removeEventListener("fitness:session-change", sessionChanged);
    };
  }, [owner]);

  if (!items.length || !ready) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))]">
    <section data-release-summary ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="release-summary-title" tabIndex={-1} className="app-card app-card-neutral flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden text-tg-text shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
        <div><p className="text-xs text-tg-hint">Что нового</p><h2 id="release-summary-title" className="mt-1 text-lg font-semibold">{items.length === 1 ? items[0].title : "Что нового в FilFit"}</h2></div>
        <button type="button" data-autofocus aria-label="Закрыть изменения" onClick={close} className="app-button app-ghost-action min-w-11 shrink-0 text-lg">×</button>
      </header>
      <div tabIndex={0} className="min-h-0 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
        {items.map(item => <section key={item.id} className="mb-5 last:mb-0">
          {items.length > 1 ? <h3 className="font-semibold">{item.title}</h3> : null}
          <time dateTime={item.created_at} className="text-xs text-tg-hint">{new Date(item.created_at).toLocaleDateString("ru-RU")}</time>
          <p className="mt-2 whitespace-pre-wrap break-words">{item.message_text}</p>
        </section>)}
        {partial ? <div className="mt-4"><p>Не все изменения загрузились</p><button type="button" disabled={loading} onClick={() => retry.current()} className="app-button app-secondary-action mt-2 min-h-11">{loading ? "Загружаем…" : "Загрузить остальные изменения"}</button></div> : null}
      </div>
      <footer className="shrink-0 border-t border-[var(--border-subtle)] px-5 py-3"><button type="button" onClick={close} className="app-button app-gradient-action min-h-11 w-full">Понятно</button></footer>
    </section>
  </div>;
}
