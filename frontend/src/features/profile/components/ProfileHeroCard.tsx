import { Link } from "react-router-dom";

import type { AuthUser } from "@/api/auth";
import type { UserProfile } from "@/api/users";
import { hasPlus } from "@/features/subscription/subscriptionAccess";
import { subscriptionLabel } from "@/utils/localization";

type Props = { user: AuthUser | null; profile: UserProfile | null };

function savedNumber(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function ProfileHeroCard({ user, profile }: Props) {
  const account = user?.auth_email || (user?.username ? `@${user.username.replace(/^@/, "")}` : "Аккаунт");
  const weight = savedNumber(profile?.anthropometry.weight_kg, 20, 500);
  const height = savedNumber(profile?.anthropometry.height_cm, 80, 250);

  return (
    <Link to="/profile/settings" className="group relative mb-3 block overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#142d51] via-[#162343] to-[#101b33] p-4 text-white shadow-[0_14px_32px_rgba(1,8,25,.26)]">
      <span className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-fuchsia-500/15 blur-3xl" aria-hidden="true" />
      <span className="relative flex items-center gap-4">
        <span className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#a48dff]/70 bg-gradient-to-b from-[#4f6ba3] to-[#21355e]" aria-hidden="true">
          <svg viewBox="0 0 72 72" className="h-16 w-16" fill="none">
            <circle cx="36" cy="26" r="13" fill="#b3c3de" />
            <path d="M9 73c2-21 11-31 27-31s25 10 27 31" fill="#90a8cb" />
            <path d="M22 23c1-12 9-18 18-16 8 1 12 8 11 16-5-4-9-4-14-4-6 0-10 2-15 4Z" fill="#243958" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">{account}</span>
          <span className="mt-1 block text-xs text-sky-100/75">На пути к лучшей версии себя</span>
          {user ? <span className="mt-2 inline-block rounded-full bg-fuchsia-500/25 px-2 py-0.5 text-[10px] font-bold text-fuchsia-100">{hasPlus(user) ? "PLUS" : subscriptionLabel(user.subscription_status)}</span> : null}
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-sky-200/70 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {weight !== null || height !== null ? (
        <span className="relative mt-4 grid grid-cols-2 divide-x divide-white/10 rounded-xl bg-[#08182e]/55 py-3 text-center">
          <span><span className="block text-base font-bold">{weight !== null ? `${weight.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг` : "—"}</span><span className="text-[11px] text-sky-100/60">вес</span></span>
          <span><span className="block text-base font-bold">{height !== null ? `${Math.round(height)} см` : "—"}</span><span className="text-[11px] text-sky-100/60">рост</span></span>
        </span>
      ) : <span className="relative mt-4 block text-xs font-semibold text-sky-200">Добавить данные →</span>}
    </Link>
  );
}
