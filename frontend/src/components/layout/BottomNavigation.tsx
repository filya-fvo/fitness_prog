import { Link, useLocation } from "react-router-dom";

import { NAV_ITEMS, rootSectionForPath, type NavigationIconName } from "@/components/layout/navigation";

function NavIcon({ active, name }: { active: boolean; name: NavigationIconName }) {
  const gradientId = `nav-gradient-${name}`;
  const stroke = active ? `url(#${gradientId})` : "currentColor";
  const common = "h-6 w-6";

  const paths = (() => {
    if (name === "home") return <><path d="M3.5 10.5 12 3.7l8.5 6.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" strokeLinecap="round" strokeLinejoin="round" /></>;
    if (name === "exercise") return <><path d="M7 8v8M4.5 9.5v5M17 8v8m2.5-6.5v5M7 12h10M2.5 11v2m19-2v2" strokeLinecap="round" /></>;
    if (name === "diary") return <><path d="M6 3.5h9.5L19 7v13.5H6z" strokeLinecap="round" strokeLinejoin="round" /><path d="M15.5 3.5V7H19M9 11h7M9 15h7M9 19h4" strokeLinecap="round" /></>;
    if (name === "help") return <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.3a2.4 2.4 0 1 1 3.5 2.1c-.9.45-1.2 1.05-1.2 1.85M12 17h.01" strokeLinecap="round" /></>;
    return <><circle cx="12" cy="8" r="3.1" /><path d="M5 20c.8-3.8 3.1-5.9 7-5.9s6.2 2.1 7 5.9" strokeLinecap="round" /></>;
  })();

  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke={stroke} strokeWidth="1.8" aria-hidden="true">
      {active ? <defs><linearGradient id={gradientId} x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="var(--app-brand-start)" /><stop offset="0.52" stopColor="var(--app-brand-mid)" /><stop offset="1" stopColor="var(--app-brand-end)" /></linearGradient></defs> : null}
      {paths}
    </svg>
  );
}

export function BottomNavigation() {
  const location = useLocation();
  const activeRoot = rootSectionForPath(location.pathname);

  return (
    <nav className="app-bottom-navigation fixed bottom-0 left-0 right-0 z-20 border backdrop-blur-xl lg:bottom-auto lg:top-0 lg:border-t-0" aria-label="Основная навигация">
      <ul className="mx-auto flex max-w-5xl items-stretch justify-between px-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 lg:h-16 lg:items-center lg:justify-start lg:gap-1 lg:px-4 lg:py-2">
        <li className="mr-auto hidden items-center gap-2 text-sm font-semibold lg:flex"><span className="brand-lockup">FIL<span className="brand-lockup-accent">FIT</span></span></li>
        {NAV_ITEMS.map((item) => {
          const active = activeRoot === item.to;
          return (
            <li key={item.to} className="min-w-0 flex-1 lg:flex-none">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={[
                  "app-nav-link tap-target relative flex min-h-[52px] min-w-0 flex-col items-center justify-center px-0.5 pb-2 pt-1 text-[10px] font-medium transition-[color,transform] active:scale-[0.97] max-[359px]:min-h-[64px] sm:px-1 sm:text-[11px] lg:min-h-[44px] lg:flex-row lg:gap-2 lg:px-3 lg:py-1.5 lg:text-xs",
                  active ? "app-nav-link-active font-semibold" : "text-tg-hint hover:text-tg-text",
                ].join(" ")}
              >
                <span className="mb-0.5 leading-none lg:mb-0"><NavIcon active={active} name={item.icon} /></span>
                <span className="max-w-full break-all text-center leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
