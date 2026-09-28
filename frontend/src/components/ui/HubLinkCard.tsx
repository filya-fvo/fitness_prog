import { Link } from "react-router-dom";

import { joinClassNames } from "@/theme/visualStyles";

export type HubIconName = "ai" | "support" | "faq" | "settings" | "notifications" | "social" | "invite" | "measurements" | "admin";

const iconTone = {
  indigo: "from-blue-500/30 via-indigo-500/20 to-violet-500/20 text-cyan-300",
  plum: "from-fuchsia-500/30 via-violet-500/20 to-indigo-500/20 text-pink-300",
  ember: "from-orange-500/30 via-rose-500/20 to-fuchsia-500/20 text-orange-300",
  ocean: "from-cyan-500/30 via-sky-500/20 to-blue-500/20 text-cyan-300",
} as const;

type HubLinkCardProps = {
  to: string;
  title: string;
  description: string;
  icon: HubIconName;
  tone?: "indigo" | "plum" | "ember" | "ocean";
  className?: string;
};

function HubIcon({ name }: { name: HubIconName }) {
  const common = "h-6 w-6";
  if (name === "ai") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" strokeLinejoin="round" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg>;
  if (name === "support") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.7a2.5 2.5 0 0 1-1-2V5.5Z" strokeLinejoin="round" /><path d="M8 8h8M8 12h5" strokeLinecap="round" /></svg>;
  if (name === "faq") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.9.4-1.2 1-1.2 1.8M12 17h.01" strokeLinecap="round" /></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" strokeLinecap="round" /></svg>;
  if (name === "notifications") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 5 2 7H4.5c0-2 2-2 2-7Z" strokeLinejoin="round" /><path d="M9.5 20h5" strokeLinecap="round" /></svg>;
  if (name === "social") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.8 20c.5-4 2.2-6 5.2-6s4.7 2 5.2 6M14 15c2.8 0 4.5 1.7 5 5" strokeLinecap="round" /></svg>;
  if (name === "invite") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.3-6 5.5-6 1.7 0 3 .6 3.9 1.7M17 8v6m-3-3h6" strokeLinecap="round" /></svg>;
  if (name === "measurements") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3v18M16 3v18M8 6h4m-4 4h2m-2 4h4m-4 4h2M16 5h-2m2 4h-4m4 4h-2m2 4h-4" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 7v5c0 4.7 3.2 7.7 8 9 4.8-1.3 8-4.3 8-9V7l-8-4Z" /><path d="M9 12h6M12 9v6" strokeLinecap="round" /></svg>;
}

export function HubLinkCard({ className, description, icon, title, to, tone = "indigo" }: HubLinkCardProps) {
  return (
    <Link
      to={to}
      className={joinClassNames("app-card", `app-card-${tone}`, "app-card-interactive group flex min-h-[88px] items-center gap-3 p-4", className)}
    >
      <span className={joinClassNames("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/15 shadow-[0_4px_12px_rgba(0,0,0,.15)]", iconTone[tone])}>
        <HubIcon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-tg-text">{title}</span>
        <span className="mt-1 block text-xs leading-snug text-tg-hint">{description}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-tg-hint transition-transform group-active:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
