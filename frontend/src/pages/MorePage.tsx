/**
 * «Ещё» — profile, AI, admin (compact nav).
 */
import { Link } from "react-router-dom";

import { Header } from "@/components/layout/Header";
import { useUserStore } from "@/store/userStore";

const ADMIN_USERNAMES = new Set(["filatov_slava"]);

export function MorePage() {
  const user = useUserStore((s) => s.user);
  const isAdmin = Boolean(
    user?.username && ADMIN_USERNAMES.has(user.username.replace(/^@/, "").toLowerCase()),
  );

  return (
    <section>
      <Header title="Ещё" subtitle="Профиль и сервисы" />
      <div className="space-y-3">
        <Link to="/profile" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">Профиль</p>
          <p className="mt-1 text-xs text-tg-hint">Тело, программа, добавки, уведомления</p>
        </Link>
        <Link to="/ai" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
          <p className="text-sm font-semibold">AI-тренер</p>
          <p className="mt-1 text-xs text-tg-hint">Техника, замены, разбор прогресса</p>
        </Link>
        {isAdmin ? (
          <Link to="/admin" className="tap-target-x block min-h-[44px] rounded-2xl bg-tg-secondary p-4">
            <p className="text-sm font-semibold">Админ</p>
            <p className="mt-1 text-xs text-tg-hint">Контент и служебные действия</p>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
