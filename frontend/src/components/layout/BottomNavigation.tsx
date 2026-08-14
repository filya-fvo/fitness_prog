import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Главная", icon: "⌂", end: true },
  { to: "/train", label: "Тренировки", icon: "◆", end: false },
  { to: "/nutrition", label: "Питание", icon: "◉", end: false },
  { to: "/progress", label: "Прогресс", icon: "↗", end: false },
  { to: "/more", label: "Ещё", icon: "•••", end: false },
] as const;

export function BottomNavigation() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-black/10 bg-tg-secondary/95 backdrop-blur"
      aria-label="Основная навигация"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-between px-1 py-1.5">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "tap-target flex min-h-[44px] flex-col items-center justify-center rounded-lg px-1 py-2 text-[11px] font-medium",
                  isActive
                    ? "bg-tg-button/10 font-semibold text-tg-button"
                    : "text-tg-hint hover:bg-tg-bg/60",
                ].join(" ")
              }
            >
              <span aria-hidden="true" className="mb-0.5 text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
