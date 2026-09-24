type Props = {
  cards?: number;
};

export function PageSkeleton({ cards = 3 }: Props) {
  return (
    <div role="status" aria-label="Загрузка" className="grid animate-pulse gap-3 md:grid-cols-2">
      {Array.from({ length: cards }, (_, index) => (
        <AppCard key={index} className="p-4">
          <div className="h-4 w-2/3 rounded bg-black/10" />
          <div className="mt-3 h-3 w-full rounded bg-black/10" />
          <div className="mt-2 h-3 w-4/5 rounded bg-black/10" />
          <div className="mt-4 h-10 w-full rounded-xl bg-black/10" />
        </AppCard>
      ))}
      <span className="sr-only">Загружаем данные…</span>
    </div>
  );
}
import { AppCard } from "@/components/ui/AppCard";
