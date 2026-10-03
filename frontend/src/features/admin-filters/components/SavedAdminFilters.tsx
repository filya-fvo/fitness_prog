import { useEffect, useId, useState } from "react";

import {
  parseSavedAdminFilters,
  saveAdminFilterSet,
  type SavedAdminFilterSet,
} from "../savedAdminFilters";

export function SavedAdminFilters({
  storageKey,
  allowedKeys,
  value,
  onApply,
}: {
  storageKey: string;
  allowedKeys: readonly string[];
  value: Record<string, string>;
  onApply: (value: Record<string, string>) => void;
}) {
  const nameId = useId();
  const [items, setItems] = useState<SavedAdminFilterSet[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    setItems(parseSavedAdminFilters(localStorage.getItem(storageKey), allowedKeys));
    setSelectedId("");
  }, [allowedKeys, storageKey]);

  function persist(next: SavedAdminFilterSet[]) {
    setItems(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function saveCurrent() {
    const next = saveAdminFilterSet(items, name, value);
    persist(next);
    if (next[0]) setSelectedId(next[0].id);
    setName("");
  }

  function applySelected() {
    const selected = items.find((item) => item.id === selectedId);
    if (selected) onApply(selected.values);
  }

  function removeSelected() {
    if (!selectedId) return;
    persist(items.filter((item) => item.id !== selectedId));
    setSelectedId("");
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-black/10 bg-tg-bg p-3 md:col-span-2">
      <p className="text-xs font-semibold text-tg-text">Сохранённые фильтры</p>
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <select
          aria-label="Сохранённый набор фильтров"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-black/10 bg-tg-secondary px-3 text-base"
        >
          <option value="">Выберите набор</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="button" disabled={!selectedId} onClick={applySelected} className="min-h-11 rounded-xl bg-tg-secondary px-3 text-sm text-tg-link disabled:opacity-40">Загрузить набор</button>
        <button type="button" disabled={!selectedId} onClick={removeSelected} className="min-h-11 rounded-xl bg-red-500/10 px-3 text-sm text-red-600 disabled:opacity-40">Удалить набор</button>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="block text-xs text-tg-hint">Название набора фильтров</label>
          <input
            id={nameId}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название текущего набора"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-tg-secondary px-3 text-base"
          />
        </div>
        <button type="button" disabled={!name.trim()} onClick={saveCurrent} className="min-h-11 shrink-0 rounded-xl app-gradient-action px-3 text-sm font-semibold disabled:opacity-40">Сохранить</button>
      </div>
      <p className="mt-1 text-[11px] text-tg-hint">До 8 наборов, только на этом устройстве.</p>
    </div>
  );
}
