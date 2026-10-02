import type { Badge } from "@/utils/achievements";

export function BadgesPanel({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div className="app-card app-card-neutral p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Достижения</p>
        <p className="text-[10px] text-tg-hint">
          {earned}/{badges.length}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {badges.map((b) => (
          <li
            key={b.id}
            className={[
              "app-metric px-3 py-3",
              b.earned ? "badge-earned" : "badge-pending",
            ].join(" ")}
          >
            <p className="text-xs font-semibold">
              {b.earned ? "★ " : "☆ "}
              {b.title}
            </p>
            <p className="mt-0.5 text-[10px] text-tg-hint">{b.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
