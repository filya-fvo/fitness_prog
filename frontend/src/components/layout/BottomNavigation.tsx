import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Главная", icon: "home", end: true },
  { to: "/train", label: "Тренировки", icon: "training", end: false },
  { to: "/nutrition", label: "Питание", icon: "nutrition", end: false },
  { to: "/progress", label: "Прогресс", icon: "progress", end: false },
  { to: "/more", label: "Ещё", icon: "more", end: false },
] as const;

type NavIconName = (typeof items)[number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3.5 10.5 12 3.7l8.5 6.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "training") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7 8v8M4.5 9.5v5M17 8v8m2.5-6.5v5M7 12h10M2.5 11v2m19-2v2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "nutrition") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M7 3v7m-2-7v5a2 2 0 0 0 4 0V3M7 10v11M15 3v18m0-18c3 1 4 4 4 7h-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "progress") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 7H19v3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function BottomNavigation() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#091525]/90 shadow-[0_-12px_36px_rgba(0,4,12,0.28)] backdrop-blur-xl lg:bottom-auto lg:top-0 lg:border-b lg:border-t-0 lg:shadow-[0_12px_36px_rgba(0,4,12,0.2)]"
      aria-label="Основная навигация"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-between px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 lg:h-16 lg:items-center lg:justify-start lg:gap-1 lg:px-4 lg:py-2">
        <li className="mr-auto hidden items-center gap-2 text-sm font-semibold lg:flex">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-cyan-300 to-violet-500 shadow-[0_0_14px_rgba(67,199,255,0.65)]" />
          Fitness
        </li>
        {items.map((item) => (
          <li key={item.to} className="flex-1 lg:flex-none">
            <NavLink
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "tap-target relative flex min-h-[48px] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-medium transition-colors lg:flex-row lg:gap-2 lg:px-3 lg:text-xs",
                  isActive
                    ? "bg-gradient-to-b from-cyan-400/15 to-violet-500/10 font-semibold text-cyan-300 ring-1 ring-cyan-300/15"
                    : "text-tg-hint hover:bg-white/5 hover:text-tg-text",
                ].join(" ")
              }
            >
              <span className="mb-0.5 leading-none lg:mb-0"><NavIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
