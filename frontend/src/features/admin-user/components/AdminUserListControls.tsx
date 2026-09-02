import type { Dispatch, SetStateAction } from "react";

import type { AdminUser } from "@/api/admin";
import { SavedAdminFilters } from "@/features/admin-filters/components/SavedAdminFilters";
import { adminFilterStorageKey } from "@/features/admin-filters/savedAdminFilters";
import {
  EMPTY_USER_FILTERS,
  USER_FILTER_KEYS,
  type AdminUserFilterForm,
} from "@/features/admin-user/adminUserFilters";

export function AdminUserListControls({
  adminId,
  filters,
  setFilters,
  users,
  selectedUserIds,
  setSelectedUserIds,
  loading,
  busy,
  onApply,
  onApplySaved,
  onExport,
}: {
  adminId: string;
  filters: AdminUserFilterForm;
  setFilters: Dispatch<SetStateAction<AdminUserFilterForm>>;
  users: AdminUser[];
  selectedUserIds: Set<string>;
  setSelectedUserIds: Dispatch<SetStateAction<Set<string>>>;
  loading: boolean;
  busy: boolean;
  onApply: (filters: AdminUserFilterForm) => void;
  onApplySaved: (values: Record<string, string>) => void;
  onExport: () => void;
}) {
  return (
    <>
      <SavedAdminFilters storageKey={adminFilterStorageKey(adminId, "users")} allowedKeys={USER_FILTER_KEYS} value={{ ...filters }} onApply={onApplySaved} />
      <div className="flex gap-2">
        <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") onApply(filters); }} placeholder="Поиск: фамилия, @логин, почта, Telegram ID" className="min-w-0 flex-1 rounded-lg border border-black/10 bg-tg-bg px-3 py-2 text-base" />
        <button type="button" disabled={loading} onClick={() => onApply(filters)} className="shrink-0 rounded-xl bg-tg-button px-3 py-2 text-xs font-semibold text-tg-button-text disabled:opacity-50">Найти</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Тариф пользователя" value={filters.subscriptionStatus} onChange={(event) => setFilters((current) => ({ ...current, subscriptionStatus: event.target.value }))} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-2 text-base"><option value="">Все тарифы</option><option value="free">Бесплатный</option><option value="pro_stars">Pro Stars</option></select>
        <select aria-label="Статус анкеты" value={filters.onboardingCompleted} onChange={(event) => setFilters((current) => ({ ...current, onboardingCompleted: event.target.value }))} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-2 text-base"><option value="">Любая анкета</option><option value="true">Анкета пройдена</option><option value="false">Анкета не пройдена</option></select>
        <select aria-label="Уровень пользователя" value={filters.level} onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value }))} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-2 text-base"><option value="">Все уровни</option><option value="beginner">Новичок</option><option value="intermediate">Опытный</option><option value="advanced">Продвинутый</option></select>
        <select aria-label="Цель пользователя" value={filters.primaryGoal} onChange={(event) => setFilters((current) => ({ ...current, primaryGoal: event.target.value }))} className="min-h-11 rounded-xl border border-black/10 bg-tg-bg px-2 text-base"><option value="">Все цели</option><option value="lose_fat">Снижение веса</option><option value="gain_muscle">Набор мышц</option><option value="maintain">Поддержание формы</option></select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => onApply(filters)} className="min-h-11 rounded-xl bg-tg-button px-4 text-sm font-semibold text-tg-button-text disabled:opacity-50">Применить фильтры</button>
        <button type="button" disabled={loading} onClick={() => { setFilters(EMPTY_USER_FILTERS); onApply(EMPTY_USER_FILTERS); }} className="min-h-11 rounded-xl bg-tg-bg px-4 text-sm text-tg-link disabled:opacity-50">Сбросить</button>
      </div>
      {users.length ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-tg-bg p-3">
        <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={users.length > 0 && users.every((item) => selectedUserIds.has(item.id))} onChange={(event) => setSelectedUserIds(event.target.checked ? new Set(users.slice(0, 50).map((item) => item.id)) : new Set())} className="h-5 w-5" />Выбрать показанных (до 50)</label>
        <button type="button" disabled={busy || selectedUserIds.size === 0} onClick={onExport} className="min-h-11 rounded-xl bg-tg-button px-4 text-xs font-semibold text-tg-button-text disabled:opacity-50">Скачать реестр ({selectedUserIds.size})</button>
        <p className="w-full text-[11px] text-tg-hint">Групповой реестр содержит только данные списка. Массовая очистка и удаление недоступны.</p>
      </div> : null}
    </>
  );
}
