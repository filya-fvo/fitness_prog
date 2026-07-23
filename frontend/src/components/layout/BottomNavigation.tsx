import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Главная", end: true },
  { to: "/programs", label: "Программы" },
  { to: "/workouts", label: "Каталог" },
  { to: "/nutrition", label: "Питание" },
  { to: "/progress", label: "Прогресс" },
  { to: "/ai", label: "AI" },
] as const;

export function BottomNavigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-black/10 bg-tg-secondary/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 py-2">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center rounded-lg px-1 py-1 text-[11px] font-medium",
                  isActive ? "text-tg-button" : "text-tg-hint",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
