/**
 * «Ещё» — profile, AI, admin (compact nav).
 */
import { Link } from "react-router-dom";

import { Header } from "@/components/layout/Header";
import { ThemeSelector } from "@/features/theme/ThemeSelector";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { subscriptionLabel } from "@/utils/localization";

type MoreIconName = "profile" | "measurements" | "ai" | "invite" | "support" | "help" | "knowledge" | "admin";

function MoreIcon({ name }: { name: MoreIconName }) {
  const common = "h-5 w-5";
  if (name === "profile") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" strokeLinecap="round" /></svg>;
  if (name === "measurements") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3v18M16 3v18M8 6h4m-4 4h2m-2 4h4m-4 4h2M16 5h-2m2 4h-4m4 4h-2m2 4h-4" strokeLinecap="round" /></svg>;
  if (name === "ai") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 14 8l5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" strokeLinejoin="round" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg>;
  if (name === "invite") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-4 2.3-6 5.5-6 1.7 0 3 .6 3.9 1.7M17 8v6m-3-3h6" strokeLinecap="round" /></svg>;
  if (name === "support") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.7a2.5 2.5 0 0 1-1-2V5.5Z" strokeLinejoin="round" /><path d="M8 8h8M8 12h5" strokeLinecap="round" /></svg>;
  if (name === "help") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.9.4-1.2 1-1.2 1.8M12 17h.01" strokeLinecap="round" /></svg>;
  if (name === "knowledge") return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23V5.5Z" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 4 7v5c0 4.7 3.2 7.7 8 9 4.8-1.3 8-4.3 8-9V7l-8-4Z" /><path d="M9 12h6M12 9v6" strokeLinecap="round" /></svg>;
}

function MoreLink({ to, icon, title, description }: { to: string; icon: MoreIconName; title: string; description: string }) {
  return (
    <Link to={to} className="group flex min-h-[68px] items-center gap-3 rounded-2xl bg-tg-secondary p-3.5 active:scale-[0.99]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/15 to-violet-500/15 text-tg-link ring-1 ring-cyan-300/15">
        <MoreIcon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-tg-hint">{description}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-tg-hint transition-transform group-active:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Link>
  );
}

export function MorePage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = isAdminUsername(user?.username);

  return (
    <section>
      <Header title="Ещё" subtitle="Профиль и сервисы" />
      {user ? (
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-tg-secondary p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {user.auth_email || (user.username ? `@${user.username.replace(/^@/, "")}` : "Аккаунт")}
            </p>
            <p className="mt-1 text-xs text-tg-hint">Данные аккаунта и подписки находятся в профиле</p>
          </div>
          <span className="ml-3 shrink-0 rounded-full bg-tg-button/15 px-2.5 py-1 text-xs font-medium text-tg-link">
            {subscriptionLabel(user.subscription_status)}
          </span>
        </div>
      ) : null}
      <ThemeSelector />
      <div className="space-y-3">
        <MoreLink to="/profile" icon="profile" title="Профиль" description="Тело, программа, добавки и уведомления" />
        <MoreLink to="/measurements" icon="measurements" title="Замеры тела" description="Обхваты, сравнение и графики динамики" />
        <MoreLink to="/ai" icon="ai" title="ИИ-тренер" description="Техника, замены и разбор прогресса" />
        <MoreLink to="/invite" icon="invite" title="Пригласить друга" description="Поделиться ссылкой или принять приглашение по коду" />
        <MoreLink to="/support" icon="support" title="Поддержка" description="Задать вопрос и получить ответ внутри приложения" />
        <MoreLink to="/help" icon="help" title="Как пользоваться" description="Короткая инструкция по основным разделам" />
        <MoreLink to="/knowledge" icon="knowledge" title="Справочник" description="Питание, нагрузка, разминка и восстановление" />
        {isAdmin ? (
          <MoreLink to="/admin" icon="admin" title="Админ" description="Пользователи, каталог и состояние системы" />
        ) : null}
      </div>
    </section>
  );
}
