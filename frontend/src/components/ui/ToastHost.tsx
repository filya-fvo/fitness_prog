import { useToastStore } from "@/store/toastStore";

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-3"
      aria-live="polite"
    >
      {items.map((t) => {
        const tone =
          t.kind === "error"
            ? "bg-red-600 text-white"
            : t.kind === "info"
              ? "bg-tg-secondary text-tg-text border border-black/10"
              : "bg-emerald-600 text-white";
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={[
              "pointer-events-auto max-w-sm rounded-2xl px-4 py-2.5 text-center text-sm font-medium shadow-lg",
              tone,
            ].join(" ")}
          >
            {t.message}
          </button>
        );
      })}
    </div>
  );
}
