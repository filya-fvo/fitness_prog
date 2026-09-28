import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  decideAdminNutritionCorrection,
  fetchAdminNutritionCorrections,
  type CorrectionStatus,
  type NutritionCorrection,
} from "@/api/adminNutrition";
import { Header } from "@/components/layout/Header";
import { AppCard } from "@/components/ui/AppCard";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { toUserMessage } from "@/utils/errors";

const fields = [
  { key: "calories", label: "Ккал", unit: "ккал" },
  { key: "proteins", label: "Белки", unit: "г" },
  { key: "fats", label: "Жиры", unit: "г" },
  { key: "carbs", label: "Углеводы", unit: "г" },
] as const;

const statuses: Array<{ value: CorrectionStatus; label: string }> = [
  { value: "pending", label: "На проверке" },
  { value: "approved", label: "Одобрены" },
  { value: "rejected", label: "Отклонены" },
];

export function AdminNutritionPage() {
  const user = useUserStore((state) => state.user);
  const authLoading = useUserStore((state) => state.isAuthLoading);
  const allowed = useMemo(() => isAdminUsername(user?.username), [user?.username]);
  const [status, setStatus] = useState<CorrectionStatus>("pending");
  const [items, setItems] = useState<NutritionCorrection[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [review, setReview] = useState<{ item: NutritionCorrection; decision: "approve" | "reject" } | null>(null);
  const dialogRef = useModalAccessibility(Boolean(review), () => setReview(null));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAdminNutritionCorrections(status);
      setItems(response.items);
      setPendingCount(response.pending_count);
      setError(null);
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось загрузить исправления продуктов"));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (!authLoading && allowed) void load();
  }, [authLoading, allowed, load]);

  async function confirmReview() {
    if (!review || busy) return;
    setBusy(true);
    try {
      await decideAdminNutritionCorrection(review.item.id, review.decision);
      setNote(review.decision === "approve" ? "Исправление опубликовано в каталоге" : "Исправление отклонено");
      setReview(null);
      await load();
    } catch (reason) {
      setError(toUserMessage(reason, "Не удалось рассмотреть исправление"));
      setReview(null);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <section><Header title="Исправления продуктов" subtitle="Проверка доступа…" fallbackTo="/admin" /><PageSkeleton cards={3} /></section>;
  if (!allowed) return <section><Header title="Исправления продуктов" subtitle="Доступ ограничен" fallbackTo="/admin" /><AppCard className="p-4 text-sm">Раздел доступен только администраторам.<Link to="/" className="mt-3 block text-tg-link">На главную</Link></AppCard></section>;

  return (
    <section>
      <Header title="Исправления продуктов" subtitle={`Ждут проверки: ${pendingCount}`} fallbackTo="/admin" />
      {error ? <div role="alert" className="app-status app-status-danger mb-3">{error}<button type="button" onClick={() => void load()} className="mt-2 block text-tg-link">Повторить</button></div> : null}
      {note ? <div role="status" className="app-status app-status-success mb-3">{note}</div> : null}
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {statuses.map((option) => <button key={option.value} type="button" onClick={() => setStatus(option.value)} className={`min-h-11 shrink-0 rounded-xl px-3 text-sm ${status === option.value ? "app-gradient-action" : "app-card app-card-inset"}`}>{option.label}</button>)}
      </div>
      {loading ? <PageSkeleton cards={3} /> : items.length === 0 ? (
        <AppCard className="p-4 text-sm text-tg-hint">{status === "pending" ? "Пока нет заявок на проверку" : "В этом разделе пока нет заявок"}</AppCard>
      ) : <div className="space-y-3">
        {items.map((item) => <AppCard key={item.id} tone="indigo" className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold">{item.product_name}</h2>
            <p className="text-xs text-tg-hint">Предложено {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</p>
          </div>
          <div className="space-y-2 text-sm">
            {fields.filter(({ key }) => item.original_kbju[key] !== item.proposed_kbju[key]).map(({ key, label, unit }) => (
              <div key={key} className="flex justify-between gap-2 border-t border-white/10 pt-2">
                <span>{label}</span>
                <strong>{item.original_kbju[key]} {unit} → {item.proposed_kbju[key]} {unit}</strong>
              </div>
            ))}
          </div>
          {item.status === "pending" ? <div className="flex gap-2">
            <button type="button" onClick={() => setReview({ item, decision: "reject" })} className="app-button app-secondary-action min-h-11 flex-1">Отклонить</button>
            <button type="button" onClick={() => setReview({ item, decision: "approve" })} className="app-button app-gradient-action min-h-11 flex-1">Одобрить</button>
          </div> : null}
        </AppCard>)}
      </div>}
      {review ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={review.decision === "approve" ? "Подтвердить исправление" : "Подтвердить отклонение"} tabIndex={-1} className="app-card app-card-indigo w-full max-w-sm space-y-4 p-4">
          <h2 className="text-lg font-semibold">{review.decision === "approve" ? "Подтвердить исправление" : "Отклонить исправление"}</h2>
          <p className="text-sm text-tg-hint">{review.decision === "approve" ? `Новые значения «${review.item.product_name}» станут доступны всем пользователям.` : `Предложение для «${review.item.product_name}» будет отклонено.`}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setReview(null)} className="app-button app-secondary-action min-h-11 flex-1">Отмена</button>
            <button type="button" disabled={busy} onClick={() => void confirmReview()} className="app-button app-gradient-action min-h-11 flex-1">{busy ? "Сохраняем…" : "Подтвердить"}</button>
          </div>
        </div>
      </div> : null}
    </section>
  );
}
