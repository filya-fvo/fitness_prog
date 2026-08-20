/**
 * «Ещё» — profile, AI, admin (compact nav).
 */
import { Link } from "react-router-dom";

import { Header } from "@/components/layout/Header";
import { useUserStore } from "@/store/userStore";
import { isAdminUsername } from "@/utils/adminAccess";
import { subscriptionLabel } from "@/utils/localization";

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
      <div className="space-y-3">
        <Link to="/profile" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Профиль</p>
          <p className="mt-1 text-xs text-tg-hint">Тело, программа, добавки, уведомления</p>
        </Link>
        <Link to="/measurements" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Замеры тела</p>
          <p className="mt-1 text-xs text-tg-hint">Обхваты, сравнение и графики динамики</p>
        </Link>
        <Link to="/ai" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">ИИ-тренер</p>
          <p className="mt-1 text-xs text-tg-hint">Техника, замены, разбор прогресса</p>
        </Link>
        <Link to="/help" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Как пользоваться</p>
          <p className="mt-1 text-xs text-tg-hint">Короткая инструкция по тренировкам, питанию и прогрессу</p>
        </Link>
        <Link to="/knowledge" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Справочник</p>
          <p className="mt-1 text-xs text-tg-hint">Питание, рабочий вес, периодизация, разминка и восстановление</p>
        </Link>
        {isAdmin ? (
          <Link to="/admin" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-semibold">Админ</p>
            <p className="mt-1 text-xs text-tg-hint">Пользователи, очистка/удаление, каталог</p>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
