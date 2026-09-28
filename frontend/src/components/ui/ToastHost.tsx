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
            ? "app-status-danger"
            : t.kind === "info"
              ? "app-status-info"
              : "app-status-success";
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={[
              "app-status pointer-events-auto min-h-11 max-w-sm text-center font-medium shadow-lg",
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
